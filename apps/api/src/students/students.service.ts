import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import argon2 from "argon2";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { ChangePasswordInput, UpdateProfileInput } from "@sis/shared";
import { toDateOrNull } from "../common/grade.utils";
import { AuditService } from "../audit/audit.service";
import { apiCache } from "../common/cache";
import { verifyPasswordHash } from "../common/password-hash";

const GRADE_POINTS: Record<string, number> = {
  "A+": 4.0,
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.3,
  C: 2.0,
  "C-": 1.7,
  "D+": 1.3,
  D: 1.0,
  "D-": 0.7,
  F: 0.0
};

type TranscriptEnrollment = Prisma.EnrollmentGetPayload<{
  include: {
    term: true;
    section: {
      include: {
        course: true;
      };
    };
  };
}>;

type TranscriptTermGroup = {
  termId: string;
  termName: string;
  termStartDate: string;
  enrollments: TranscriptEnrollment[];
  semesterGpa: number | null;
  cumulativeGpa: number | null;
};

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  private getInstitutionTimezone(): string {
    return process.env.SIS_TIMEZONE?.trim() || "America/Los_Angeles";
  }

  private isScheduleSharingEnabled(): boolean {
    return process.env.ENABLE_PUBLIC_SCHEDULE_SHARING === "true";
  }

  private computeAcademicStanding(gpa: number | null, completedCredits: number): string {
    if (gpa === null || completedCredits === 0) return "Enrolled";
    if (gpa >= 3.5) return "Dean's List";
    if (gpa >= 2.0) return "Good Standing";
    return "Academic Probation";
  }

  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        studentId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        studentProfile: true,
        enrollments: {
          where: { deletedAt: null },
          select: {
            id: true,
            status: true,
            finalGrade: true,
            waitlistPosition: true,
            section: {
              select: {
                credits: true,
                sectionCode: true,
                course: {
                  select: {
                    id: true,
                    code: true,
                    title: true
                  }
                },
                term: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!user?.studentProfile) {
      throw new NotFoundException({ code: "PROFILE_NOT_FOUND", message: "Student profile not found" });
    }

    const { enrollments, ...rest } = user;
    const completedEnrollments = enrollments.filter((enrollment) => enrollment.status === "COMPLETED" && enrollment.finalGrade !== null);
    const gpa = this.computeGpa(completedEnrollments);
    const completedCredits = completedEnrollments.reduce((sum, e) => sum + (e.section?.credits ?? 0), 0);
    const academicStanding = this.computeAcademicStanding(gpa, completedCredits);

    return {
      ...user.studentProfile,
      user: rest,
      enrollments,
      gpa,
      completedCredits,
      academicStanding
    };
  }

  async getNotifications(studentId: string) {
    try {
      const enrollments = await this.prisma.enrollment.findMany({
        where: { studentId, deletedAt: null },
        include: { section: { include: { course: true } } },
        orderBy: { createdAt: "desc" },
        take: 50
      });

      return enrollments
        .filter((enrollment) => ["ENROLLED", "WAITLISTED", "PENDING_APPROVAL"].includes(enrollment.status))
        .slice(0, 10)
        .map((enrollment) => ({
          id: enrollment.id,
          createdAt: enrollment.createdAt.toISOString(),
          type:
            enrollment.status === "ENROLLED"
              ? "success"
              : enrollment.status === "WAITLISTED"
                ? "warning"
                : "info",
          title:
            enrollment.status === "ENROLLED"
              ? `已选课：${enrollment.section.course.code}`
              : enrollment.status === "WAITLISTED"
                ? `候补队列：${enrollment.section.course.code}`
                : `待审批：${enrollment.section.course.code}`,
          body:
            enrollment.status === "ENROLLED"
              ? enrollment.section.course.title
              : enrollment.status === "WAITLISTED"
                ? "候补中"
                : "等待管理员审批"
        }));
    } catch (error) {
      this.logger.error(
        `Failed to load notifications for student ${studentId}`,
        error instanceof Error ? error.stack : undefined
      );
      throw new InternalServerErrorException({
        code: "NOTIFICATIONS_UNAVAILABLE",
        message: "Unable to load notifications right now"
      });
    }
  }

  async getTranscript(userId: string) {
    try {
      const student = await this.prisma.user.findFirst({
        where: { id: userId, role: "STUDENT", deletedAt: null },
        select: { id: true }
      });

      if (!student) return [];

      const rows = await this.prisma.enrollment.findMany({
        where: {
          studentId: student.id,
          deletedAt: null,
          finalGrade: { not: null }
        },
        include: {
          term: true,
          section: {
            include: {
              course: true
            }
          }
        },
        orderBy: [{ term: { startDate: "desc" } }, { updatedAt: "desc" }]
      });

      const byTerm = new Map<string, { termName: string; termStartDate: string; enrollments: TranscriptEnrollment[] }>();
      for (const row of rows) {
        const bucket = byTerm.get(row.termId) ?? {
          termName: row.term.name,
          termStartDate: row.term.startDate.toISOString(),
          enrollments: []
        };
        bucket.enrollments.push(row);
        byTerm.set(row.termId, bucket);
      }

      const groups = [...byTerm.entries()]
        .map(([termId, value]) => ({ termId, ...value }))
        .sort((a, b) => new Date(a.termStartDate).getTime() - new Date(b.termStartDate).getTime());

      let cumulativeWeighted = 0;
      let cumulativeCredits = 0;

      const transcript = groups.map<TranscriptTermGroup>((group) => {
        const semesterGpa = this.computeGpa(group.enrollments);

        for (const enrollment of group.enrollments) {
          if (!enrollment.finalGrade) continue;
          const points = GRADE_POINTS[enrollment.finalGrade];
          if (points === undefined) continue;
          cumulativeWeighted += points * enrollment.section.credits;
          cumulativeCredits += enrollment.section.credits;
        }

        return {
          termId: group.termId,
          termName: group.termName,
          termStartDate: group.termStartDate,
          enrollments: group.enrollments,
          semesterGpa,
          cumulativeGpa:
            cumulativeCredits > 0 ? Math.round((cumulativeWeighted / cumulativeCredits) * 1000) / 1000 : null
        };
      });

      return transcript.reverse();
    } catch (error) {
      this.logger.error(
        `Failed to load transcript for student ${userId}`,
        error instanceof Error ? error.stack : undefined
      );
      throw new InternalServerErrorException({
        code: "TRANSCRIPT_UNAVAILABLE",
        message: "Unable to load transcript right now"
      });
    }
  }

  async getCart(userId: string) {
    return this.prisma.cartItem.findMany({
      where: { studentId: userId },
      include: {
        section: {
          include: {
            course: true,
            term: true,
            meetingTimes: true
          }
        }
      },
      orderBy: { createdAt: "asc" },
      take: 100
    });
  }

  async getMyRatings(userId: string) {
    const student = await this.prisma.user.findFirst({
      where: { id: userId, role: "STUDENT", deletedAt: null },
      select: { id: true }
    });

    if (!student) return [];

    return this.prisma.courseRating.findMany({
      where: { studentId: student.id },
      include: {
        section: {
          select: {
            sectionCode: true,
            instructorName: true,
            term: { select: { name: true } },
            course: { select: { code: true, title: true } }
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  async getGpaStats(userId: string) {
    const GRADE_POINTS: Record<string, number> = {
      "A+": 4, A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7,
      "C+": 2.3, C: 2, "C-": 1.7, "D+": 1.3, D: 1, "D-": 0.7, F: 0
    };

    // Compute GPA for all students
    const allStudents = await this.prisma.user.findMany({
      where: { role: "STUDENT", deletedAt: null },
      select: {
        id: true,
        enrollments: {
          where: { status: "COMPLETED", deletedAt: null },
          include: { section: { select: { credits: true } } }
        }
      }
    });

    function computeGpa(enrollments: Array<{ finalGrade: string | null; section: { credits: number } }>) {
      let wp = 0, cr = 0;
      for (const e of enrollments) {
        const pts = GRADE_POINTS[e.finalGrade ?? ""];
        if (pts !== undefined && e.section.credits > 0) {
          wp += pts * e.section.credits;
          cr += e.section.credits;
        }
      }
      return cr > 0 ? wp / cr : null;
    }

    const gpas = allStudents
      .map((s) => ({ id: s.id, gpa: computeGpa(s.enrollments as never) }))
      .filter((s): s is { id: string; gpa: number } => s.gpa !== null)
      .sort((a, b) => a.gpa - b.gpa);

    if (gpas.length === 0) return { myGpa: null, count: 0, mean: null, median: null, percentile: null };

    const myGpa = gpas.find((s) => s.id === userId)?.gpa ?? null;
    const mean = Math.round((gpas.reduce((s, g) => s + g.gpa, 0) / gpas.length) * 100) / 100;
    const mid = Math.floor(gpas.length / 2);
    const median = Math.round((gpas.length % 2 === 0 ? (gpas[mid - 1].gpa + gpas[mid].gpa) / 2 : gpas[mid].gpa) * 100) / 100;
    const percentile = myGpa != null
      ? Math.round((gpas.filter((s) => s.gpa < myGpa).length / gpas.length) * 100)
      : null;

    return { myGpa: myGpa != null ? Math.round(myGpa * 1000) / 1000 : null, count: gpas.length, mean, median, percentile };
  }

  async getAnnouncements(role: "STUDENT" | "ADMIN" = "STUDENT") {
    const audiences = role === "ADMIN" ? ["ALL", "ADMIN"] : ["ALL", "STUDENT"];
    return this.prisma.announcement.findMany({
      where: {
        audience: { in: audiences },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }]
    });
  }

  async getPublicAnnouncements(audience?: string) {
    const normalizedAudience = audience?.trim().toUpperCase();
    return this.prisma.announcement.findMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        ...(normalizedAudience ? { audience: { in: [normalizedAudience, "ALL"] } } : {})
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 10
    });
  }

  async getRecommendedSections(userId: string) {
    return apiCache.getOrSet(`student:recommended:${userId}`, 120_000, async () => {
      const existing = await this.prisma.enrollment.findMany({
        where: {
          studentId: userId,
          deletedAt: null,
          status: { in: ["ENROLLED", "WAITLISTED", "COMPLETED"] }
        },
        include: {
          section: {
            include: {
              course: true
            }
          }
        }
      });

      const deptCounts = new Map<string, number>();
      const seenCourseIds = new Set<string>();
      for (const enrollment of existing) {
        seenCourseIds.add(enrollment.section.courseId);
        const dept = enrollment.section.course.code.slice(0, 2).toUpperCase();
        deptCounts.set(dept, (deptCounts.get(dept) ?? 0) + 1);
      }

      const primaryDept = [...deptCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      if (!primaryDept) return [];

      const sections = await this.prisma.section.findMany({
        where: {
          course: {
            deletedAt: null,
            code: {
              startsWith: primaryDept,
              mode: "insensitive"
            }
          },
          enrollments: {
            none: {
              studentId: userId,
              deletedAt: null,
              status: { in: ["ENROLLED", "WAITLISTED", "COMPLETED"] }
            }
          }
        },
        include: {
          course: true,
          meetingTimes: true,
          enrollments: {
            where: {
              deletedAt: null,
              status: "ENROLLED"
            }
          }
        },
        take: 6
      });

      return sections.filter((section) => !seenCourseIds.has(section.courseId)).slice(0, 6);
    });
  }

  async generateIcal(userId: string, termId: string): Promise<string> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId: userId,
        termId,
        deletedAt: null,
        status: "ENROLLED"
      },
      include: {
        section: {
          include: {
            course: true,
            meetingTimes: true
          }
        },
        term: true
      }
    });

    const byDay = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    const timezone = this.getInstitutionTimezone();
    const pad = (value: number) => String(value).padStart(2, "0");
    const minutesToTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`;
    const toIcalDate = (value: Date) =>
      `${value.getFullYear()}${pad(value.getMonth() + 1)}${pad(value.getDate())}`;

    const events: string[] = [];

    for (const enrollment of enrollments) {
      const section = enrollment.section;
      const term = enrollment.term;
      const termStart = term.startDate ?? new Date();
      const termEnd = term.endDate ?? new Date(termStart.getTime() + 120 * 86_400_000);

      for (const meetingTime of section.meetingTimes) {
        const start = new Date(termStart);
        const delta = (meetingTime.weekday - start.getDay() + 7) % 7;
        start.setDate(start.getDate() + delta);

        events.push(
          [
            "BEGIN:VEVENT",
            `UID:${enrollment.id}-${meetingTime.id}@sis-horizon`,
            `SUMMARY:${section.course.code} ${section.course.title}`,
            `LOCATION:${section.location ?? ""}`,
            `DTSTART;TZID=${timezone}:${toIcalDate(start)}T${minutesToTime(meetingTime.startMinutes)}`,
            `DTEND;TZID=${timezone}:${toIcalDate(start)}T${minutesToTime(meetingTime.endMinutes)}`,
            `RRULE:FREQ=WEEKLY;BYDAY=${byDay[meetingTime.weekday]};UNTIL=${toIcalDate(termEnd)}T235959Z`,
            `DESCRIPTION:${section.instructorName ?? ""}`,
            "END:VEVENT"
          ].join("\r\n")
        );
      }
    }

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//地平线 SIS//EN",
      "CALSCALE:GREGORIAN",
      ...events,
      "END:VCALENDAR"
    ].join("\r\n");
  }

  async getEnrollmentReceipt(userId: string, termId?: string) {
    const now = new Date();

    const targetTerm = termId
      ? await this.prisma.term.findUnique({
          where: { id: termId },
          select: { id: true, name: true, startDate: true, endDate: true }
        })
      : (
          await this.prisma.term.findFirst({
            where: {
              startDate: { lte: now },
              endDate: { gte: now }
            },
            orderBy: { startDate: "desc" },
            select: { id: true, name: true, startDate: true, endDate: true }
          })
        ) ??
        (
          await this.prisma.term.findFirst({
            where: {
              registrationOpen: true,
              endDate: { gte: now }
            },
            orderBy: { startDate: "asc" },
            select: { id: true, name: true, startDate: true, endDate: true }
          })
        ) ??
        (
          await this.prisma.term.findFirst({
            orderBy: { startDate: "desc" },
            select: { id: true, name: true, startDate: true, endDate: true }
          })
        );

    if (!targetTerm) {
      return {
        term: null,
        items: [],
        totalCredits: 0
      };
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId: userId,
        termId: targetTerm.id,
        status: "ENROLLED",
        deletedAt: null
      },
      include: {
        section: {
          include: {
            course: {
              select: {
                code: true,
                title: true,
                credits: true
              }
            },
            meetingTimes: {
              select: {
                weekday: true,
                startMinutes: true,
                endMinutes: true
              },
              orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }]
            }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    const items = enrollments.map((enrollment) => ({
      enrollmentId: enrollment.id,
      courseCode: enrollment.section.course.code,
      title: enrollment.section.course.title,
      credits: enrollment.section.course.credits,
      sectionCode: enrollment.section.sectionCode,
      instructorName: enrollment.section.instructorName,
      meetingTimes: enrollment.section.meetingTimes
    }));

    return {
      term: {
        id: targetTerm.id,
        name: targetTerm.name,
        startDate: targetTerm.startDate.toISOString(),
        endDate: targetTerm.endDate.toISOString()
      },
      items,
      totalCredits: items.reduce((sum, item) => sum + item.credits, 0)
    };
  }

  async createScheduleSnapshot(userId: string, termId: string) {
    if (!this.isScheduleSharingEnabled()) {
      throw new ForbiddenException({
        code: "SCHEDULE_SHARING_DISABLED",
        message: "Public schedule sharing is disabled in this deployment"
      });
    }

    if (!termId) {
      throw new BadRequestException({ code: "TERM_REQUIRED", message: "termId is required" });
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId: userId,
        termId,
        deletedAt: null,
        status: "ENROLLED"
      },
      include: {
        section: {
          include: {
            course: true,
            meetingTimes: true
          }
        }
      },
      orderBy: [{ section: { course: { code: "asc" } } }, { section: { sectionCode: "asc" } }]
    });

    const snapshot = await this.prisma.scheduleSnapshot.create({
      data: {
        studentId: userId,
        termId,
        sectionsJson: JSON.stringify(
          enrollments.map((enrollment) => ({
            id: enrollment.section.id,
            sectionCode: enrollment.section.sectionCode,
            instructorName: enrollment.section.instructorName,
            location: enrollment.section.location,
            credits: enrollment.section.credits,
            course: {
              code: enrollment.section.course.code,
              title: enrollment.section.course.title
            },
            meetingTimes: enrollment.section.meetingTimes
          }))
        )
      }
    });

    return { token: snapshot.id };
  }

  async getScheduleSnapshot(token: string) {
    if (!this.isScheduleSharingEnabled()) {
      throw new NotFoundException({ code: "SCHEDULE_SNAPSHOT_DISABLED", message: "Schedule sharing is disabled" });
    }

    const snapshot = await this.prisma.scheduleSnapshot.findUnique({
      where: { id: token },
      select: {
        sectionsJson: true,
        createdAt: true
      }
    });

    if (!snapshot) {
      throw new NotFoundException({ code: "SCHEDULE_SNAPSHOT_NOT_FOUND", message: "Schedule snapshot not found" });
    }

    return snapshot;
  }

  async submitContactMessage(
    userId: string,
    input: { subject?: string; message?: string; category?: string }
  ) {
    const subject = input.subject?.trim() || "Support request";
    const message = input.message?.trim() || "";
    const category = input.category?.trim() || "other";

    if (!message) {
      throw new BadRequestException({ code: "CONTACT_MESSAGE_REQUIRED", message: "Message is required" });
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: "STUDENT", deletedAt: null },
      select: { id: true, email: true }
    });
    if (!user) {
      throw new NotFoundException({ code: "USER_NOT_FOUND", message: "Student not found" });
    }

    const adminRecipients = await this.prisma.user.findMany({
      where: { role: "ADMIN", deletedAt: null },
      select: { id: true, email: true }
    });

    const requestBody = JSON.stringify({
      category,
      subject,
      message,
      studentUserId: user.id,
      studentEmail: user.email
    });

    const writes = [
      this.prisma.notificationLog.create({
        data: {
          userId,
          type: "in-app",
          subject: "Support request received",
          body: JSON.stringify({
            category,
            subject,
            message,
            routedToAdmins: adminRecipients.length
          })
        }
      }),
      ...adminRecipients.map((admin) =>
        this.prisma.notificationLog.create({
          data: {
            userId: admin.id,
            type: "support-request",
            subject: `Student support request: ${subject}`,
            body: requestBody
          }
        })
      )
    ];

    await this.prisma.$transaction(writes);

    await this.auditService.log({
      actorUserId: userId,
      action: "student_support_request",
      entityType: "support_request",
      metadata: { category, subject, routedToAdmins: adminRecipients.length }
    });

    return { ok: true, routedToAdmins: adminRecipients.length };
  }

  async rateSection(
    userId: string,
    sectionId: string,
    rating: number,
    comment?: string,
    difficulty?: number,
    workload?: number,
    wouldRecommend?: boolean
  ) {
    const student = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, role: "STUDENT", deletedAt: null },
      select: { id: true }
    });

    return this.prisma.courseRating.upsert({
      where: {
        studentId_sectionId: {
          studentId: student.id,
          sectionId
        }
      },
      create: {
        studentId: student.id,
        sectionId,
        rating,
        difficulty,
        workload,
        wouldRecommend,
        comment
      },
      update: {
        rating,
        difficulty,
        workload,
        wouldRecommend,
        comment
      }
    });
  }

  private computeGpa(
    enrollments: Array<{ finalGrade: string | null; section: { credits: number } }>
  ): number | null {
    let weighted = 0;
    let credits = 0;

    for (const enrollment of enrollments) {
      if (!enrollment.finalGrade) continue;
      const points = GRADE_POINTS[enrollment.finalGrade];
      if (points === undefined) continue;
      weighted += points * enrollment.section.credits;
      credits += enrollment.section.credits;
    }

    if (credits === 0) return null;
    return Math.round((weighted / credits) * 100) / 100;
  }

  async updateMyProfile(userId: string, input: UpdateProfileInput) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        studentProfile: true
      }
    });
    const existing = user?.studentProfile ?? null;
    if (!existing) {
      throw new NotFoundException({ code: "PROFILE_NOT_FOUND", message: "Student profile not found" });
    }

    const updated = await this.prisma.studentProfile.update({
      where: { userId },
      data: {
        legalName: input.legalName ?? existing.legalName,
        dob: input.dob !== undefined ? toDateOrNull(input.dob) : existing.dob,
        address: input.address !== undefined ? input.address : existing.address,
        emergencyContact: input.emergencyContact !== undefined ? input.emergencyContact : existing.emergencyContact,
        programMajor: input.programMajor !== undefined ? input.programMajor : existing.programMajor,
        enrollmentStatus: input.enrollmentStatus !== undefined ? input.enrollmentStatus : existing.enrollmentStatus,
        academicStatus: input.academicStatus !== undefined ? input.academicStatus : existing.academicStatus
      }
    });

    return updated;
  }

  async adminListStudents(params?: { page?: number; pageSize?: number; search?: string }) {
    const q = params?.search?.trim();
    const usePagination = params?.page !== undefined || params?.pageSize !== undefined || Boolean(q);
    const page = Number.isFinite(params?.page) && (params?.page as number) > 0 ? Math.floor(params?.page as number) : 1;
    const pageSize = Math.min(100, Number.isFinite(params?.pageSize) && (params?.pageSize as number) > 0 ? Math.floor(params?.pageSize as number) : 50);
    const skip = (page - 1) * pageSize;

    const where: Prisma.UserWhereInput = {
      role: "STUDENT",
      deletedAt: null
    };

    if (q) {
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { studentId: { contains: q, mode: "insensitive" } },
        { studentProfile: { is: { legalName: { contains: q, mode: "insensitive" } } } },
        { studentProfile: { is: { programMajor: { contains: q, mode: "insensitive" } } } }
      ];
    }

    const include = {
      studentProfile: true,
      enrollments: {
        where: {
          deletedAt: null,
          status: "COMPLETED",
          finalGrade: { not: null }
        },
        include: {
          section: {
            select: { credits: true }
          }
        }
      }
    } satisfies Prisma.UserInclude;

    if (!usePagination) {
      const students = await this.prisma.user.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" }
      });

      return students.map(({ enrollments, ...student }) => ({
        ...student,
        gpa: this.computeGpa(enrollments)
      }));
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize
      }),
      this.prisma.user.count({ where })
    ]);

    return {
      items: items.map(({ enrollments, ...student }) => ({
        ...student,
        gpa: this.computeGpa(enrollments)
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  }

  async adminGetStudent(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: "STUDENT", deletedAt: null },
      include: {
        studentProfile: true,
        adviseeAssignments: {
          where: { active: true },
          include: {
            advisor: {
              select: {
                id: true,
                email: true,
                advisorProfile: {
                  select: { displayName: true, department: true, officeLocation: true }
                }
              }
            },
            assignedBy: {
              select: { id: true, email: true, role: true }
            }
          },
          orderBy: { assignedAt: "desc" }
        },
        enrollments: {
          where: { deletedAt: null },
          include: {
            section: {
              include: { course: true }
            }
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });
    if (!user) {
      throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "Student not found" });
    }
    const completedEnrollments = user.enrollments.filter(
      (enrollment) => enrollment.status === "COMPLETED" && enrollment.finalGrade
    );

    return {
      ...user,
      gpa: this.computeGpa(completedEnrollments)
    };
  }

  async adminCreateStudent(input: {
    email: string;
    password: string;
    studentId: string;
    legalName: string;
  }, actorUserId: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { studentId: input.studentId }]
      }
    });

    if (existing) {
      throw new BadRequestException({ code: "USER_EXISTS", message: "Student email or ID already exists" });
    }

    const passwordHash = await argon2.hash(input.password);
    const created = await this.prisma.user.create({
      data: {
        email: input.email,
        studentId: input.studentId,
        passwordHash,
        role: "STUDENT",
        emailVerifiedAt: new Date(),
        studentProfile: {
          create: {
            legalName: input.legalName,
            enrollmentStatus: "New",
            academicStatus: "Active"
          }
        }
      },
      include: { studentProfile: true }
    });

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "student",
      entityId: created.id,
      metadata: { op: "create" }
    });

    return created;
  }

  async adminUpdateStudent(
    id: string,
    input: Partial<{
      email: string;
      studentId: string;
      legalName: string;
      programMajor: string;
      enrollmentStatus: string;
      academicStatus: string;
    }>,
    actorUserId: string
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: "STUDENT", deletedAt: null },
      include: { studentProfile: true }
    });
    if (!user) {
      throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "Student not found" });
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        email: input.email ?? user.email,
        studentId: input.studentId ?? user.studentId,
        studentProfile: {
          update: {
            legalName: input.legalName ?? user.studentProfile?.legalName,
            programMajor: input.programMajor ?? user.studentProfile?.programMajor,
            enrollmentStatus: input.enrollmentStatus ?? user.studentProfile?.enrollmentStatus,
            academicStatus: input.academicStatus ?? user.studentProfile?.academicStatus
          }
        }
      },
      include: { studentProfile: true }
    });

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "student",
      entityId: id,
      metadata: { op: "update" }
    });

    return updated;
  }

  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) {
      throw new NotFoundException({ code: "USER_NOT_FOUND", message: "User not found" });
    }

    const valid = await verifyPasswordHash(user.passwordHash, input.currentPassword);
    if (!valid) {
      throw new UnauthorizedException({ code: "INVALID_CURRENT_PASSWORD", message: "Current password is incorrect" });
    }

    const newHash = await argon2.hash(input.newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });

    await this.auditService.log({
      actorUserId: userId,
      action: "password_change",
      entityType: "user",
      entityId: userId,
      metadata: {}
    });

    return { success: true };
  }

  async adminDeleteStudent(id: string, actorUserId: string) {
    const user = await this.prisma.user.findFirst({ where: { id, role: "STUDENT", deletedAt: null } });
    if (!user) {
      throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "Student not found" });
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.user.update({
        where: { id },
        data: { deletedAt: now }
      });
      await tx.enrollment.updateMany({
        where: {
          studentId: id,
          deletedAt: null
        },
        data: {
          deletedAt: now
        }
      });
    });
    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "student",
      entityId: id,
      metadata: { op: "delete" }
    });

    return { id };
  }

  // ── Grade Appeals ──────────────────────────────────────────────────
  async submitGradeAppeal(
    userId: string,
    dto: { enrollmentId: string; contestedGrade: string; requestedGrade?: string; reason: string }
  ) {
    const student = await this.prisma.user.findFirst({
      where: { id: userId, role: "STUDENT", deletedAt: null }
    });
    if (!student) throw new NotFoundException({ code: "STUDENT_NOT_FOUND" });

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: dto.enrollmentId, studentId: student.id }
    });
    if (!enrollment) throw new NotFoundException({ code: "ENROLLMENT_NOT_FOUND" });

    const existing = await this.prisma.gradeAppeal.findFirst({
      where: { enrollmentId: dto.enrollmentId, status: "PENDING" }
    });
    if (existing) return { error: "A pending appeal already exists for this enrollment" };

    return this.prisma.gradeAppeal.create({
      data: {
        studentId: student.id,
        enrollmentId: dto.enrollmentId,
        contestedGrade: dto.contestedGrade,
        requestedGrade: dto.requestedGrade ?? null,
        reason: dto.reason,
        status: "PENDING"
      }
    });
  }

  async getMyGradeAppeals(userId: string) {
    const student = await this.prisma.user.findFirst({
      where: { id: userId, role: "STUDENT", deletedAt: null }
    });
    if (!student) throw new NotFoundException({ code: "STUDENT_NOT_FOUND" });

    return this.prisma.gradeAppeal.findMany({
      where: { studentId: student.id },
      include: {
        enrollment: {
          include: {
            section: {
              include: {
                course: { select: { code: true, title: true } },
                term: { select: { name: true } }
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  /** Returns the set of course codes the student has successfully completed. */
  async getCompletedCourseCodes(userId: string): Promise<string[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId: userId,
        status: "COMPLETED",
        deletedAt: null,
        finalGrade: { not: null }
      },
      select: { finalGrade: true, section: { select: { course: { select: { code: true } } } } }
    });
    // Exclude W (Withdrawal) — those don't count as completed
    const FAILING = new Set(["F", "W"]);
    return enrollments
      .filter((e) => e.finalGrade && !FAILING.has(e.finalGrade))
      .map((e) => e.section.course.code);
  }

  async getMyAdvisor(userId: string) {
    const assignments = await this.prisma.advisorAssignment.findMany({
      where: { studentId: userId, active: true },
      include: {
        advisor: {
          select: {
            id: true,
            email: true,
            advisorProfile: {
              select: {
                displayName: true,
                department: true,
                officeLocation: true
              }
            }
          }
        },
        assignedBy: {
          select: { id: true, email: true, role: true }
        }
      },
      orderBy: { assignedAt: "desc" }
    });

    // Also fetch recent advisor notes visible to the student (public notes)
    const advisorNotes = await this.prisma.advisorNote.findMany({
      where: { studentId: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        body: true,
        createdAt: true,
        advisor: { select: { email: true, advisorProfile: { select: { displayName: true } } } }
      }
    });

    return { assignments, advisorNotes };
  }
}
