import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EnrollmentStatus, Modality, Prisma } from "@prisma/client";
import argon2 from "argon2";
import { createHash } from "crypto";
import { GRADE_POINTS } from "@sis/shared/constants";
import {
  assignAdvisorSchema,
  createHoldSchema,
  createAdvisorSchema,
  createCourseSchema,
  createFacultySchema,
  createInviteCodeSchema,
  createSectionSchema,
  createTermSchema,
  csvImportSchema,
  promoteWaitlistSchema,
  updateGradeSchema
} from "@sis/shared";
import { z } from "zod";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../common/prisma.service";
import { apiCache } from "../common/cache";
import { maintenanceModeCache } from "../common/maintenance.middleware";
import { getTermStatus } from "../common/term-status";
import { sanitizeHtml } from "../common/sanitize";
import { dispatch } from "../common/webhook";
import { NotificationsService } from "../notifications/notifications.service";
import { GovernanceService } from "../governance/governance.service";
import { RegistrationService } from "../registration/registration.service";
import { MailService } from "../mail/mail.service";

type CreateTermInput = z.infer<typeof createTermSchema>;
type CreateCourseInput = z.infer<typeof createCourseSchema>;
type CreateSectionInput = z.infer<typeof createSectionSchema>;
type CreateFacultyInput = z.infer<typeof createFacultySchema>;
type CreateAdvisorInput = z.infer<typeof createAdvisorSchema>;
type AssignAdvisorInput = z.infer<typeof assignAdvisorSchema>;
type CreateInviteCodeInput = z.infer<typeof createInviteCodeSchema>;
type CreateHoldInput = z.infer<typeof createHoldSchema>;
type PromoteWaitlistInput = z.infer<typeof promoteWaitlistSchema>;
type UpdateGradeInput = z.infer<typeof updateGradeSchema>;
type CsvImportInput = z.infer<typeof csvImportSchema>;

type CsvRowIssue = {
  rowNumber: number;
  field: string;
  message: string;
};

type StudentImportRow = {
  rowNumber: number;
  email: string;
  studentId: string;
  legalName: string;
  password: string;
};

type CourseImportRow = {
  rowNumber: number;
  code: string;
  title: string;
  credits: number;
  description: string | null;
};

type SectionImportMeeting = {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
};

type SectionImportRow = {
  rowNumber: number;
  termName: string;
  courseCode: string;
  sectionCode: string;
  modality: Modality;
  capacity: number;
  credits: number;
  instructorName: string;
  location: string | null;
  requireApproval: boolean;
  meetingTimes: SectionImportMeeting[];
};

type ImportResultPayload = {
  created: number;
  dryRun?: boolean;
  wouldCreate?: number;
  skipped?: number;
  idempotencyReused?: boolean;
};

type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

type AuditIntegrityCheckResult = {
  ok: boolean;
  checked: number;
  brokenAtId: string | null;
  reason: string | null;
};

type StudentGpaEnrollment = {
  finalGrade: string | null;
  section: { credits: number };
};

function extractTagsFromMetadata(metadata: Prisma.JsonValue | null | undefined): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const maybeTags = (metadata as Record<string, unknown>).tags;
  if (!Array.isArray(maybeTags)) return [];
  return maybeTags
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag): tag is string => Boolean(tag));
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldWasQuoted = false;
  let afterQuotedField = false;

  const pushField = () => {
    row.push(fieldWasQuoted ? field : field.trim());
    field = "";
    fieldWasQuoted = false;
    afterQuotedField = false;
  };

  const pushRowIfNotEmpty = () => {
    const hasValue = row.some((cell) => cell.length > 0);
    if (hasValue) {
      rows.push(row);
    }
    row = [];
  };

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];

    if (inQuotes) {
      if (char === "\"") {
        if (csv[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          inQuotes = false;
          afterQuotedField = true;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (afterQuotedField) {
      if (char === " " || char === "\t") {
        continue;
      }

      if (char === ",") {
        pushField();
        continue;
      }

      if (char === "\n") {
        pushField();
        pushRowIfNotEmpty();
        continue;
      }

      if (char === "\r") {
        continue;
      }

      throw new BadRequestException({
        code: "CSV_INVALID",
        message: "CSV格式错误：引号字段后有意外字符"
      });
    }

    if (char === "\"") {
      if (field.trim().length > 0) {
        throw new BadRequestException({
          code: "CSV_INVALID",
          message: "CSV格式错误：非引号字段中出现引号"
        });
      }
      field = "";
      inQuotes = true;
      fieldWasQuoted = true;
      continue;
    }

    if (char === ",") {
      pushField();
      continue;
    }

    if (char === "\n") {
      pushField();
      pushRowIfNotEmpty();
      continue;
    }

    if (char === "\r") {
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new BadRequestException({
      code: "CSV_INVALID",
      message: "CSV格式错误：引号字段未闭合"
    });
  }

  pushField();
  pushRowIfNotEmpty();

  return rows;
}

@Injectable()
export class AdminGradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly registrationService: RegistrationService,
    private readonly governanceService: GovernanceService,
    private readonly mailService: MailService
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
    return this.registrationService.submitSectionGrades(sectionId, grades, actorUserId);
  }

async updateGrade(input: UpdateGradeInput, actorUserId: string) {
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
        finalGrade: input.finalGrade,
        status: enrollment.status === "DROPPED" ? enrollment.status : "COMPLETED"
      }
    });

    await this.auditService.log({
      actorUserId,
      action: "grade_update",
      entityType: "enrollment",
      entityId: input.enrollmentId,
      metadata: { finalGrade: input.finalGrade }
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
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, sectionId, deletedAt: null }
    });

    if (!enrollment) {
      throw new NotFoundException({ code: "ENROLLMENT_NOT_FOUND", message: "注册记录不存在" });
    }

    return this.updateGrade({ enrollmentId: enrollment.id, finalGrade: grade }, actorUserId);
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
