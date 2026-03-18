import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../common/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

const VALID_FINAL_GRADES = new Set(["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F", "W"]);

@Injectable()
export class FacultyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService
  ) {}

  async listOwnedSections(facultyUserId: string) {
    return this.prisma.section.findMany({
      where: {
        instructorUserId: facultyUserId
      },
      include: {
        term: true,
        course: true,
        meetingTimes: true,
        _count: {
          select: {
            enrollments: {
              where: {
                deletedAt: null,
                status: { in: ["ENROLLED", "COMPLETED"] }
              }
            }
          }
        }
      },
      orderBy: [{ term: { startDate: "desc" } }, { sectionCode: "asc" }]
    });
  }

  private async getOwnedSection(facultyUserId: string, sectionId: string) {
    const section = await this.prisma.section.findFirst({
      where: {
        id: sectionId,
        instructorUserId: facultyUserId
      },
      include: {
        course: true,
        term: true,
        meetingTimes: true
      }
    });

    if (!section) {
      const exists = await this.prisma.section.findUnique({
        where: { id: sectionId },
        select: { id: true }
      });
      if (!exists) {
        throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "Section not found" });
      }

      throw new ForbiddenException({
        code: "FACULTY_SECTION_FORBIDDEN",
        message: "You do not own this section"
      });
    }

    return section;
  }

  async getSectionRoster(facultyUserId: string, sectionId: string) {
    const section = await this.getOwnedSection(facultyUserId, sectionId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        sectionId,
        deletedAt: null,
        status: { in: ["ENROLLED", "COMPLETED", "DROPPED", "WAITLISTED"] }
      },
      include: {
        student: {
          select: {
            id: true,
            email: true,
            studentId: true,
            studentProfile: {
              select: { legalName: true, programMajor: true, academicStatus: true }
            }
          }
        }
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }]
    });

    await this.auditService.log({
      actorUserId: facultyUserId,
      action: "faculty_roster_view",
      entityType: "section",
      entityId: sectionId,
      metadata: {
        sectionCode: section.sectionCode
      }
    });

    return { section, enrollments };
  }

  async submitGrade(facultyUserId: string, sectionId: string, enrollmentId: string, finalGrade: string) {
    const section = await this.getOwnedSection(facultyUserId, sectionId);
    const normalizedGrade = finalGrade.trim().toUpperCase();
    if (!VALID_FINAL_GRADES.has(normalizedGrade)) {
      throw new BadRequestException({
        code: "FINAL_GRADE_INVALID",
        message: "Final grade must be one of A, A-, B+, B, B-, C+, C, C-, D, F, or W"
      });
    }
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        sectionId,
        deletedAt: null
      },
      include: {
        student: {
          include: {
            studentProfile: {
              select: { legalName: true }
            }
          }
        }
      }
    });

    if (!enrollment) {
      throw new NotFoundException({ code: "ENROLLMENT_NOT_FOUND", message: "Enrollment not found" });
    }

    if (!["ENROLLED", "COMPLETED"].includes(enrollment.status)) {
      throw new ForbiddenException({
        code: "GRADE_STATUS_INVALID",
        message: "Only enrolled or completed records can be graded"
      });
    }

    const updated = await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        finalGrade: normalizedGrade,
        status: "COMPLETED"
      }
    });

    await this.auditService.log({
      actorUserId: facultyUserId,
      action: "faculty_grade_submit",
      entityType: "enrollment",
      entityId: enrollmentId,
      metadata: {
        sectionId,
        sectionCode: section.sectionCode,
        finalGrade: normalizedGrade
      }
    });

    if (enrollment.student.email) {
      await this.notificationsService.sendGradePostedEmail({
        to: enrollment.student.email,
        legalName: enrollment.student.studentProfile?.legalName ?? null,
        termName: section.term.name,
        courseCode: section.course.code,
        sectionCode: section.sectionCode,
        finalGrade: normalizedGrade
      });
    }

    return updated;
  }

  async getGradeStats(facultyUserId: string) {
    const sections = await this.prisma.section.findMany({
      where: { instructorUserId: facultyUserId },
      include: {
        term: { select: { id: true, name: true } },
        course: { select: { code: true, title: true, credits: true } },
        enrollments: {
          where: { deletedAt: null, status: "COMPLETED" },
          select: { finalGrade: true }
        }
      },
      orderBy: [{ term: { startDate: "desc" } }, { sectionCode: "asc" }]
    });

    const GRADE_POINTS: Record<string, number> = {
      "A+": 4.0, "A": 4.0, "A-": 3.7,
      "B+": 3.3, "B": 3.0, "B-": 2.7,
      "C+": 2.3, "C": 2.0, "C-": 1.7,
      "D+": 1.3, "D": 1.0, "D-": 0.7, "F": 0.0
    };
    const GRADE_ORDER = ["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F","W"];

    return sections.map((s) => {
      const gradeCounts: Record<string, number> = {};
      let pts = 0, creditHours = 0;
      for (const e of s.enrollments) {
        if (!e.finalGrade) continue;
        gradeCounts[e.finalGrade] = (gradeCounts[e.finalGrade] ?? 0) + 1;
        if (GRADE_POINTS[e.finalGrade] !== undefined) {
          pts += GRADE_POINTS[e.finalGrade] * (s.course.credits ?? 3);
          creditHours += s.course.credits ?? 3;
        }
      }
      const completed = s.enrollments.length;
      const passCount = s.enrollments.filter((e) => e.finalGrade && !["F","W"].includes(e.finalGrade)).length;
      const distribution = GRADE_ORDER
        .filter((g) => gradeCounts[g])
        .map((g) => ({ grade: g, count: gradeCounts[g] }));
      return {
        sectionId: s.id,
        sectionCode: s.sectionCode,
        termId: s.termId,
        termName: s.term.name,
        courseCode: s.course.code,
        courseTitle: s.course.title,
        completed,
        avgGpa: creditHours > 0 ? Math.round((pts / creditHours) * 100) / 100 : null,
        passRate: completed > 0 ? Math.round((passCount / completed) * 100) : null,
        distribution
      };
    });
  }
}
