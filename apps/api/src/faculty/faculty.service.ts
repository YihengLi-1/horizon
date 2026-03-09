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
}
