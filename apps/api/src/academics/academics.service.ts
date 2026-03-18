import { Injectable, NotFoundException } from "@nestjs/common";
import { apiCache } from "../common/cache";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class AcademicsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTerms() {
    return apiCache.getOrSet("academics:terms", 30_000, async () =>
      this.prisma.term.findMany({ orderBy: { startDate: "desc" } })
    );
  }

  async listCourses() {
    return this.prisma.course.findMany({
      include: {
        prerequisiteLinks: {
          include: { prerequisiteCourse: true }
        }
      },
      orderBy: { code: "asc" }
    });
  }

  async getCourse(courseId: string, termId?: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        prerequisiteLinks: { include: { prerequisiteCourse: true } },
        sections: {
          where: termId ? { termId } : undefined,
          include: {
            term: true,
            meetingTimes: true
          },
          orderBy: { sectionCode: "asc" }
        }
      }
    });

    if (!course) {
      throw new NotFoundException({ code: "COURSE_NOT_FOUND", message: "课程不存在" });
    }

    return course;
  }

  async listSections(termId?: string, courseId?: string, userId?: string) {
    const sections = await this.prisma.section.findMany({
      where: {
        termId: termId || undefined,
        courseId: courseId || undefined
      },
      include: {
        course: {
          include: {
            prerequisiteLinks: {
              include: { prerequisiteCourse: true }
            }
          }
        },
        term: true,
        meetingTimes: true,
        ratings: {
          select: { rating: true, difficulty: true, workload: true, wouldRecommend: true }
        },
        enrollments: {
          where: {
            deletedAt: null,
            status: { in: ["ENROLLED", "WAITLISTED"] }
          },
          select: { status: true }
        }
      },
      orderBy: [{ term: { startDate: "desc" } }, { sectionCode: "asc" }]
    });

    if (!userId) {
      return sections.map((section) => ({
        ...section,
        myStatus: "NONE" as const,
        myWaitlistPosition: null
      }));
    }

    const sectionIds = sections.map((section) => section.id);
    const [enrollments, cartItems] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: {
          deletedAt: null,
          studentId: userId,
          sectionId: { in: sectionIds },
          status: { in: ["ENROLLED", "WAITLISTED", "PENDING_APPROVAL"] }
        },
        select: {
          sectionId: true,
          status: true,
          waitlistPosition: true
        }
      }),
      this.prisma.cartItem.findMany({
        where: {
          studentId: userId,
          sectionId: { in: sectionIds }
        },
        select: {
          sectionId: true
        }
      })
    ]);

    const enrollmentMap = new Map(
      enrollments.map((enrollment) => [
        enrollment.sectionId,
        {
          status: enrollment.status,
          waitlistPosition: enrollment.waitlistPosition
        }
      ])
    );
    const cartSectionIds = new Set(cartItems.map((item) => item.sectionId));

    return sections.map((section) => {
      const enrollment = enrollmentMap.get(section.id);
      if (enrollment?.status === "WAITLISTED") {
        return {
          ...section,
          myStatus: "WAITLISTED" as const,
          myWaitlistPosition: enrollment.waitlistPosition
        };
      }
      if (enrollment?.status === "ENROLLED" || enrollment?.status === "PENDING_APPROVAL") {
        return {
          ...section,
          myStatus: "ENROLLED" as const,
          myWaitlistPosition: null
        };
      }
      if (cartSectionIds.has(section.id)) {
        return {
          ...section,
          myStatus: "IN_CART" as const,
          myWaitlistPosition: null
        };
      }
      return {
        ...section,
        myStatus: "NONE" as const,
        myWaitlistPosition: null
      };
    });
  }

  async getSectionGradeDistribution(sectionId: string) {
    const rows = await this.prisma.enrollment.groupBy({
      by: ["finalGrade"],
      where: {
        sectionId,
        deletedAt: null,
        status: "COMPLETED",
        finalGrade: { not: null }
      },
      _count: { finalGrade: true }
    });

    const distribution: Record<"A" | "B" | "C" | "D" | "F" | "W", number> = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      F: 0,
      W: 0
    };

    for (const row of rows) {
      const grade = (row.finalGrade ?? "").charAt(0).toUpperCase() as keyof typeof distribution;
      if (grade in distribution) {
        distribution[grade] += row._count.finalGrade;
      }
    }

    const total = Object.values(distribution).reduce((sum, value) => sum + value, 0);
    return { ...distribution, total };
  }

  async getCoursePairings(courseId: string, limit = 5) {
    return apiCache.getOrSet(`academics:pairing:${courseId}`, 60_000, async () => {
      const rows = await this.prisma.coursePairing.findMany({
        where: { OR: [{ courseAId: courseId }, { courseBId: courseId }] },
        orderBy: { coCount: "desc" },
        take: limit,
        include: {
          courseA: { select: { id: true, code: true, title: true } },
          courseB: { select: { id: true, code: true, title: true } }
        }
      });
      return rows.map((row) => {
        const partner = row.courseAId === courseId ? row.courseB : row.courseA;
        return { course: partner, coCount: row.coCount };
      });
    });
  }

  async recomputeCoursePairings() {
    // Find all student-term pairs with multiple enrollments
    const enrollments = await this.prisma.enrollment.findMany({
      where: { deletedAt: null, status: { in: ["ENROLLED", "COMPLETED"] } },
      select: { studentId: true, section: { select: { courseId: true, termId: true } } }
    });

    // Group by studentId+termId → set of courseIds
    const map = new Map<string, Set<string>>();
    for (const e of enrollments) {
      const key = `${e.studentId}:${e.section.termId}`;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(e.section.courseId);
    }

    const counts = new Map<string, number>();
    for (const courses of map.values()) {
      const arr = [...courses].sort();
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const key = `${arr[i]}|${arr[j]}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }

    // Upsert pairs with count >= 2
    let upserted = 0;
    for (const [key, count] of counts.entries()) {
      if (count < 2) continue;
      const [courseAId, courseBId] = key.split("|");
      await this.prisma.coursePairing.upsert({
        where: { courseAId_courseBId: { courseAId, courseBId } },
        create: { courseAId, courseBId, coCount: count },
        update: { coCount: count }
      });
      upserted++;
    }
    return { upserted };
  }

  async getSectionReviews(sectionId: string) {
    const rows = await this.prisma.courseRating.findMany({
      where: { sectionId, comment: { not: null } },
      select: { comment: true, rating: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    return rows.map((r) => ({ comment: r.comment!, rating: r.rating, createdAt: r.createdAt }));
  }

  async getSectionRatingSummary(sectionId: string) {
    const ratings = await this.prisma.courseRating.findMany({
      where: { sectionId },
      select: { rating: true, difficulty: true, workload: true, wouldRecommend: true }
    });
    if (ratings.length === 0) return null;
    const avg = (arr: (number | null)[]) => {
      const valid = arr.filter((v): v is number => v !== null);
      return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    const recommend = ratings.filter((r) => r.wouldRecommend === true).length;
    return {
      count: ratings.length,
      avgRating: avg(ratings.map((r) => r.rating)),
      avgDifficulty: avg(ratings.map((r) => r.difficulty)),
      avgWorkload: avg(ratings.map((r) => r.workload)),
      recommendPct: ratings.length > 0 ? Math.round((recommend / ratings.length) * 100) : null
    };
  }

  async listCalendarEvents(termId?: string) {
    return this.prisma.calendarEvent.findMany({
      where: termId ? { termId } : {},
      include: { term: { select: { id: true, name: true } } },
      orderBy: { eventDate: "asc" }
    });
  }
}
