import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { GRADE_POINTS } from "@sis/shared/constants";
import { updateGradeSchema } from "@sis/shared";
import { z } from "zod";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../common/prisma.service";
import { assertValidGrade, normalizeGradeValue } from "../common/grade-validation";
import { NotificationsService } from "../notifications/notifications.service";
import { RegistrationService } from "../registration/registration.service";
type UpdateGradeInput = z.infer<typeof updateGradeSchema>;

@Injectable()
export class AdminGradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly registrationService: RegistrationService
  ) {}

private readonly superAdminUserIds = new Set(
    (process.env.SUPERADMIN_USER_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

private isSuperAdmin(actorUserId: string): boolean {
    return this.superAdminUserIds.has(actorUserId);
  }

async bulkUpdateGrades(
    sectionId: string,
    grades: Array<{ enrollmentId: string; grade: string; gradePoints?: number }>,
    actorUserId: string
  ) {
    const normalizedGrades = grades.map((item) => {
      const grade = normalizeGradeValue(item.grade);
      assertValidGrade(grade);
      return {
        ...item,
        grade
      };
    });

    return this.registrationService.submitSectionGrades(sectionId, normalizedGrades, actorUserId);
  }

async updateGrade(input: UpdateGradeInput, actorUserId: string) {
    const finalGrade = normalizeGradeValue(input.finalGrade);
    assertValidGrade(finalGrade);

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: input.enrollmentId, deletedAt: null }
    });
    if (!enrollment) {
      throw new NotFoundException({ code: "ENROLLMENT_NOT_FOUND", message: "注册记录不存在" });
    }

    if (enrollment.status === "COMPLETED" && !this.isSuperAdmin(actorUserId)) {
      throw new ForbiddenException({
        code: "COMPLETED_ENROLLMENT_LOCKED",
        message: "已完成的注册记录已锁定，不可修改"
      });
    }

    const updated = await this.prisma.enrollment.update({
      where: { id: input.enrollmentId },
      data: {
        finalGrade,
        status: enrollment.status === "DROPPED" ? enrollment.status : "COMPLETED"
      }
    });

    await this.auditService.log({
      actorUserId,
      action: "grade_update",
      entityType: "enrollment",
      entityId: input.enrollmentId,
      metadata: { finalGrade }
    });

    const enrollmentWithStudent = await this.prisma.enrollment.findFirst({
      where: { id: input.enrollmentId, deletedAt: null },
      include: {
        student: {
          include: {
            studentProfile: {
              select: { legalName: true }
            }
          }
        },
        section: {
          include: {
            course: { select: { code: true } },
            term: { select: { name: true } }
          }
        }
      }
    });

    if (enrollmentWithStudent?.student.email && updated.finalGrade) {
      await this.notificationsService.sendGradePostedEmail({
        to: enrollmentWithStudent.student.email,
        legalName: enrollmentWithStudent.student.studentProfile?.legalName ?? null,
        termName: enrollmentWithStudent.section.term.name,
        courseCode: enrollmentWithStudent.section.course.code,
        sectionCode: enrollmentWithStudent.section.sectionCode,
        finalGrade: updated.finalGrade
      });
    }

    return updated;
  }

async updateEnrollmentGrade(studentId: string, sectionId: string, grade: string, actorUserId: string) {
    const normalizedGrade = normalizeGradeValue(grade);
    assertValidGrade(normalizedGrade);

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, sectionId, deletedAt: null }
    });

    if (!enrollment) {
      throw new NotFoundException({ code: "ENROLLMENT_NOT_FOUND", message: "注册记录不存在" });
    }

    return this.updateGrade({ enrollmentId: enrollment.id, finalGrade: normalizedGrade }, actorUserId);
  }

// ─── Grade Curve Preview Tool ─────────────────────────────────────────────────
  async previewGradeCurve(sectionId: string, steps: number) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { sectionId, deletedAt: null, status: "COMPLETED", finalGrade: { not: null } },
      select: { id: true, finalGrade: true, studentId: true }
    });

    const GRADE_ORDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "W"];

    function boost(grade: string): string {
      const idx = GRADE_ORDER.indexOf(grade);
      if (idx < 0 || grade === "W") return grade;
      return GRADE_ORDER[Math.max(0, idx - steps)] ?? grade;
    }

    const currentGpa = enrollments.length > 0
      ? enrollments.reduce((s, e) => s + (GRADE_POINTS[e.finalGrade ?? ""] ?? 0), 0) / enrollments.length
      : 0;

    const preview = enrollments.map((e) => {
      const orig = e.finalGrade ?? "F";
      const curved = boost(orig);
      return { enrollmentId: e.id, originalGrade: orig, curvedGrade: curved, changed: curved !== orig };
    });

    const newGpa = preview.length > 0
      ? preview.reduce((s, p) => s + (GRADE_POINTS[p.curvedGrade] ?? 0), 0) / preview.length
      : 0;

    return {
      sectionId, steps,
      totalStudents: enrollments.length,
      changedCount: preview.filter((p) => p.changed).length,
      currentGpa: Math.round(currentGpa * 100) / 100,
      newGpa: Math.round(newGpa * 100) / 100,
      preview,
    };
  }
}
