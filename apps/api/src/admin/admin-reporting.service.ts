import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EnrollmentStatus, Modality, Prisma, Role } from "@prisma/client";
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

function toNum(v: bigint | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "bigint" ? Number(v) : v;
}

@Injectable()
export class AdminReportingService {
  private readonly defaultPageSize = 50;
  private readonly maxPageSize = 200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly registrationService: RegistrationService,
    private readonly governanceService: GovernanceService,
    private readonly mailService: MailService
  ) {}

private normalizeAdminActionError(error: unknown): string {
    if (error && typeof error === "object" && "getResponse" in error && typeof error.getResponse === "function") {
      const response = error.getResponse() as unknown;
      if (typeof response === "string") return response;
      if (response && typeof response === "object") {
        const message = (response as { message?: unknown; code?: unknown }).message;
        if (typeof message === "string") return message;
        if (Array.isArray(message)) return message.join(", ");
        const code = (response as { code?: unknown }).code;
        if (typeof code === "string") return code;
      }
    }

    return error instanceof Error ? error.message : "Unknown error";
  }

private normalizeUniqueIds(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  }

private getRegistrationPriorityOffsetDays(cohortYear: number): number {
    if (cohortYear <= 2022) return 0;
    if (cohortYear === 2023) return 2;
    if (cohortYear === 2024) return 4;
    return 6;
  }

private getPriorityWindowsSummary(registrationOpenAt: Date): string[] {
    const cohorts = [
      { label: "大四", year: 2022 },
      { label: "大三", year: 2023 },
      { label: "大二", year: 2024 },
      { label: "大一", year: 2025 }
    ];

    return cohorts.map((cohort) => {
      const openAt = new Date(
        registrationOpenAt.getTime() + this.getRegistrationPriorityOffsetDays(cohort.year) * 24 * 60 * 60 * 1000
      );
      return `${cohort.label}：${openAt.toLocaleString()}`;
    });
  }

private normalizePagination(input?: { page?: number; pageSize?: number }): {
    page: number;
    pageSize: number;
    skip: number;
  } {
    const rawPage = input?.page;
    const rawPageSize = input?.pageSize;

    const page = Number.isFinite(rawPage) && (rawPage as number) > 0 ? Math.floor(rawPage as number) : 1;
    const requestedPageSize =
      Number.isFinite(rawPageSize) && (rawPageSize as number) > 0
        ? Math.floor(rawPageSize as number)
        : this.defaultPageSize;
    const pageSize = Math.min(this.maxPageSize, requestedPageSize);
    const skip = (page - 1) * pageSize;

    return { page, pageSize, skip };
  }

private isSerializationFailure(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return true;
    }

    const message = error instanceof Error ? error.message.toLowerCase() : "";
    return message.includes("serialization") || message.includes("deadlock");
  }

private isIsolationLevelUnsupported(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    return message.includes("isolation") && message.includes("not supported");
  }

private computeStudentGpa(enrollments: StudentGpaEnrollment[]): number | null {
    const gradePoints: Record<string, number> = {
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

    let weighted = 0;
    let credits = 0;
    for (const enrollment of enrollments) {
      if (!enrollment.finalGrade) continue;
      const points = gradePoints[enrollment.finalGrade];
      if (points === undefined) continue;
      weighted += points * enrollment.section.credits;
      credits += enrollment.section.credits;
    }

    if (credits === 0) return null;
    return Math.round((weighted / credits) * 100) / 100;
  }

private async runAdminTransactionWithRetry<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    let useSerializable = true;
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        if (useSerializable) {
          return await this.prisma.$transaction(fn, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable
          });
        }

        return await this.prisma.$transaction(fn);
      } catch (error) {
        lastError = error;

        if (useSerializable && this.isIsolationLevelUnsupported(error)) {
          useSerializable = false;
          attempt -= 1;
          continue;
        }

        if (this.isSerializationFailure(error) && attempt < 3) {
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }

async listEnrollments(params: {
    termId?: string;
    sectionId?: string;
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<Prisma.EnrollmentGetPayload<{
    include: {
      student: { include: { studentProfile: true } };
      term: true;
      section: { include: { course: true; meetingTimes: true } };
    };
  }>>> {
    const { termId, sectionId, status, search, page, pageSize } = params;
    const paging = this.normalizePagination({ page, pageSize });
    const q = search?.trim();

    const where: Prisma.EnrollmentWhereInput = {
      deletedAt: null,
      termId: termId || undefined,
      sectionId: sectionId || undefined,
      student: {
        is: {
          deletedAt: null
        }
      },
      status:
        status && ["ENROLLED", "WAITLISTED", "PENDING_APPROVAL", "DROPPED", "COMPLETED"].includes(status)
          ? (status as EnrollmentStatus)
          : undefined
    };

    if (q) {
      where.OR = [
        { student: { is: { studentId: { contains: q, mode: "insensitive" } } } },
        { student: { is: { email: { contains: q, mode: "insensitive" } } } },
        { student: { is: { studentProfile: { is: { legalName: { contains: q, mode: "insensitive" } } } } } },
        { section: { is: { sectionCode: { contains: q, mode: "insensitive" } } } },
        { section: { is: { course: { is: { code: { contains: q, mode: "insensitive" } } } } } },
        { section: { is: { course: { is: { title: { contains: q, mode: "insensitive" } } } } } }
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.enrollment.count({ where }),
      this.prisma.enrollment.findMany({
        where,
        include: {
          student: { include: { studentProfile: true } },
          term: true,
          section: { include: { course: true, meetingTimes: true } }
        },
        orderBy: { createdAt: "desc" },
        skip: paging.skip,
        take: paging.pageSize
      })
    ]);

    return {
      data,
      total,
      page: paging.page,
      pageSize: paging.pageSize
    };
  }

async bulkApproveEnrollments(ids: string[], actorUserId: string) {
    const targetIds = Array.from(new Set((ids ?? []).filter(Boolean)));
    if (targetIds.length === 0) {
      return { approved: 0 };
    }

    const result = await this.prisma.enrollment.updateMany({
      where: {
        id: { in: targetIds },
        deletedAt: null,
        status: "PENDING_APPROVAL"
      },
      data: { status: "ENROLLED" }
    });

    await this.auditService.log({
      actorUserId,
      action: "BULK_APPROVE",
      entityType: "enrollment",
      entityId: "multiple",
      metadata: { count: result.count, ids: targetIds }
    });

    return { approved: result.count };
  }

async getPendingOverloads() {
    const rows = await this.prisma.enrollment.findMany({
      where: {
        deletedAt: null,
        status: "PENDING_APPROVAL",
        section: {
          is: {
            requireApproval: false
          }
        }
      },
      include: {
        student: {
          select: {
            id: true,
            email: true,
            studentId: true,
            studentProfile: {
              select: {
                legalName: true
              }
            }
          }
        },
        section: {
          include: {
            course: true,
            term: true
          }
        }
      },
      orderBy: [{ createdAt: "asc" }]
    });

    // Batch-fetch enrolled credits for all (studentId, termId) pairs in one query
    // instead of one query per row (N+1 elimination).
    const studentIdList = [...new Set(rows.map((r) => r.studentId))];
    const termIdList = [...new Set(rows.map((r) => r.termId))];
    type CreditRow = { studentId: string; termId: string; totalCredits: number };
    const creditRows = await this.prisma.$queryRaw<CreditRow[]>(Prisma.sql`
      SELECT e."studentId", e."termId", COALESCE(SUM(s.credits), 0)::int AS "totalCredits"
      FROM "Enrollment" e
      JOIN "Section" s ON s.id = e."sectionId"
      WHERE e."deletedAt" IS NULL
        AND e.status = 'ENROLLED'
        AND e."studentId" = ANY(${studentIdList}::text[])
        AND e."termId"   = ANY(${termIdList}::text[])
      GROUP BY e."studentId", e."termId"
    `);
    const creditByPair = new Map<string, number>(
      creditRows.map((r) => [`${r.studentId}::${r.termId}`, toNum(r.totalCredits)])
    );
    const creditMap = new Map<string, number>(
      rows.map((row) => [row.id, creditByPair.get(`${row.studentId}::${row.termId}`) ?? 0])
    );

    return rows.map((row) => ({
      id: row.id,
      studentId: row.studentId,
      studentEmail: row.student.email,
      studentName: row.student.studentProfile?.legalName ?? row.student.email,
      termId: row.termId,
      termName: row.section.term.name,
      sectionId: row.sectionId,
      sectionCode: row.section.sectionCode,
      courseCode: row.section.course.code,
      courseTitle: row.section.course.title,
      currentCredits: creditMap.get(row.id) ?? 0,
      requestedCredits: row.section.credits,
      submittedAt: row.createdAt
    }));
  }

async decidePendingOverload(enrollmentId: string, approve: boolean, actorUserId: string) {
    const result = await this.runAdminTransactionWithRetry(async (tx) => {
      const enrollment = await tx.enrollment.findFirst({
        where: {
          id: enrollmentId,
          deletedAt: null,
          status: "PENDING_APPROVAL",
          section: {
            is: {
              requireApproval: false
            }
          }
        },
        include: {
          student: {
            select: {
              id: true,
              email: true,
              studentProfile: {
                select: {
                  legalName: true
                }
              }
            }
          },
          section: {
            include: {
              course: true,
              term: true
            }
          }
        }
      });

      if (!enrollment) {
        throw new NotFoundException({
          code: "PENDING_OVERLOAD_NOT_FOUND",
          message: "超学分申请不存在"
        });
      }

      if (approve) {
        await tx.$queryRaw(
          Prisma.sql`SELECT id, capacity FROM "Section" WHERE id = ${enrollment.sectionId} FOR UPDATE`
        );

        const enrolledCount = await tx.enrollment.count({
          where: {
            deletedAt: null,
            sectionId: enrollment.sectionId,
            status: "ENROLLED"
          }
        });

        if (enrollment.section.capacity > 0 && enrolledCount >= enrollment.section.capacity) {
          throw new ConflictException({
            code: "SECTION_FULL",
            message: "教学班已满，无法批准超学分申请"
          });
        }
      }

      const updated = await tx.enrollment.update({
        where: { id: enrollmentId },
        data: approve
          ? { status: "ENROLLED" }
          : {
              status: "DROPPED",
              droppedAt: new Date()
            }
      });

      await this.auditService.logInTransaction(tx, {
        actorUserId,
        action: approve ? "ADMIN_APPROVE_OVERLOAD" : "ADMIN_REJECT_OVERLOAD",
        entityType: "enrollment",
        entityId: enrollmentId,
        metadata: {
          studentId: enrollment.studentId,
          sectionId: enrollment.sectionId,
          courseCode: enrollment.section.course.code
        }
      });

      await this.auditService.logInTransaction(tx, {
        actorUserId: enrollment.studentId,
        action: approve ? "CREDIT_OVERLOAD_APPROVED" : "CREDIT_OVERLOAD_REJECTED",
        entityType: "enrollment",
        entityId: enrollmentId,
        metadata: {
          studentId: enrollment.studentId,
          sectionId: enrollment.sectionId,
          courseCode: enrollment.section.course.code,
          courseName: enrollment.section.course.title,
          message: approve
            ? `你的超学分申请已获批准，已选入 ${enrollment.section.course.code} ${enrollment.section.course.title}`
            : `你的超学分申请未获批准，${enrollment.section.course.code} ${enrollment.section.course.title} 未加入课表`
        }
      });

      return {
        updated,
        studentEmail: enrollment.student.email,
        studentName: enrollment.student.studentProfile?.legalName ?? null,
        courseCode: enrollment.section.course.code,
        sectionCode: enrollment.section.sectionCode,
        termName: enrollment.section.term.name
      };
    });

    if (result.studentEmail) {
      void this.mailService.sendOverloadDecision(result.studentEmail, approve);
    }

    return result.updated;
  }

async getPrereqWaivers(adminUserId: string, status?: string) {
    const pending =
      !status || status === "PENDING"
        ? await this.governanceService.listAdminRequests(adminUserId)
        : [];

    const historyStatuses =
      status === "APPROVED" || status === "REJECTED"
        ? [status]
        : ["APPROVED", "REJECTED"];

    const history = await this.prisma.academicRequest.findMany({
      where: {
        type: "PREREQ_OVERRIDE",
        status: { in: historyStatuses as ("APPROVED" | "REJECTED")[] }
      },
      include: {
        student: {
          select: {
            id: true,
            email: true,
            studentId: true,
            studentProfile: {
              select: {
                legalName: true
              }
            }
          }
        },
        section: {
          select: {
            id: true,
            sectionCode: true,
            course: {
              select: {
                code: true,
                title: true
              }
            }
          }
        },
        decidedBy: {
          select: {
            id: true,
            email: true
          }
        },
        steps: {
          orderBy: {
            stepOrder: "asc"
          }
        }
      },
      orderBy: [{ decisionAt: "desc" }, { updatedAt: "desc" }]
    });

    return { pending, history };
  }

async decidePrereqWaiver(
    adminUserId: string,
    requestId: string,
    input: { status: "APPROVED" | "REJECTED"; adminNote?: string | null }
  ) {
    const decided = await this.governanceService.decideAdminRequest(adminUserId, requestId, {
      decision: input.status,
      decisionNote: input.adminNote?.trim() || (input.status === "APPROVED" ? "Approved" : "Rejected")
    });

    await this.auditService.log({
      actorUserId: decided.student.id,
      action: input.status === "APPROVED" ? "PREREQ_WAIVER_APPROVED" : "PREREQ_WAIVER_REJECTED",
      entityType: "academic_request",
      entityId: decided.id,
      metadata: {
        studentId: decided.student.id,
        sectionId: decided.section?.id ?? null,
        courseCode: decided.section?.course.code ?? null,
        courseName: decided.section?.course.title ?? null,
        message:
          input.status === "APPROVED"
            ? `你的先修课豁免申请已获批准：${decided.section?.course.code ?? ""} ${decided.section?.course.title ?? ""}`
            : `你的先修课豁免申请未获批准：${decided.section?.course.code ?? ""} ${decided.section?.course.title ?? ""}`,
        adminNote: input.adminNote ?? null
      }
    });

    if (decided.student.email && decided.section?.course.code) {
      void this.mailService.sendWaiverDecision(
        decided.student.email,
        decided.section.course.code,
        input.status === "APPROVED",
        input.adminNote ?? undefined
      );
    }

    return decided;
  }

async getEnrollmentTrend(days: number) {
    const safeDays = Math.max(1, Math.min(days, 90));
    const since = new Date(Date.now() - safeDays * 86_400_000);
    const logs = await this.prisma.auditLog.findMany({
      where: {
        createdAt: { gte: since },
        OR: [
          { action: "ENROLL" },
          { action: { contains: "enroll", mode: "insensitive" } }
        ]
      },
      select: { createdAt: true }
    });

    const counts: Record<string, number> = {};
    for (let index = 0; index < safeDays; index += 1) {
      const day = new Date(Date.now() - (safeDays - 1 - index) * 86_400_000);
      counts[day.toISOString().slice(0, 10)] = 0;
    }

    for (const log of logs) {
      const key = log.createdAt.toISOString().slice(0, 10);
      counts[key] = (counts[key] ?? 0) + 1;
    }

    return Object.entries(counts).map(([date, count]) => ({ date, count }));
  }

async getTopSections(termId?: string) {
    return apiCache.getOrSet(`admin:top-sections:${termId ?? "all"}`, 120_000, async () => {
      const sections = await this.prisma.section.findMany({
        where: {
          ...(termId ? { termId } : {}),
          course: {
            deletedAt: null
          }
        },
        include: {
          course: true,
          enrollments: {
            where: {
              deletedAt: null,
              status: "ENROLLED"
            }
          }
        }
      });

      return sections
        .map((section) => ({
          sectionId: section.id,
          courseCode: section.course.code,
          title: section.course.title,
          enrolled: section.enrollments.length,
          capacity: section.capacity,
          fillRate: section.capacity > 0 ? Math.round((section.enrollments.length / section.capacity) * 100) : 0
        }))
        .sort((a, b) => b.enrolled - a.enrolled)
        .slice(0, 10);
    });
  }

async getCohortAnalytics() {
    const students = await this.prisma.user.findMany({
      where: { role: "STUDENT", deletedAt: null },
      select: {
        id: true,
        createdAt: true,
        enrollments: {
          where: { deletedAt: null },
          select: { status: true, finalGrade: true, section: { select: { credits: true } } }
        }
      }
    });

    type CohortAcc = {
      count: number;
      activeCount: number;
      completedAtLeastOne: number;
      gpaSum: number;
      gpaCount: number;
    };

    const cohorts = new Map<string, CohortAcc>();

    for (const s of students) {
      const year = new Date(s.createdAt).getFullYear().toString();
      if (!cohorts.has(year)) cohorts.set(year, { count: 0, activeCount: 0, completedAtLeastOne: 0, gpaSum: 0, gpaCount: 0 });
      const c = cohorts.get(year)!;
      c.count++;

      const hasActive = s.enrollments.some((e) => e.status === "ENROLLED" || e.status === "PENDING_APPROVAL");
      if (hasActive) c.activeCount++;

      const completed = s.enrollments.filter((e) => e.status === "COMPLETED" && e.finalGrade != null);
      if (completed.length > 0) c.completedAtLeastOne++;

      let wp = 0, cr = 0;
      for (const e of completed) {
        const pts = GRADE_POINTS[e.finalGrade ?? ""];
        if (pts !== undefined) { wp += pts * e.section.credits; cr += e.section.credits; }
      }
      if (cr > 0) { c.gpaSum += wp / cr; c.gpaCount++; }
    }

    return Array.from(cohorts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, c]) => ({
        year,
        total: c.count,
        active: c.activeCount,
        retentionPct: c.count > 0 ? Math.round((c.activeCount / c.count) * 100) : 0,
        completedPct: c.count > 0 ? Math.round((c.completedAtLeastOne / c.count) * 100) : 0,
        avgGpa: c.gpaCount > 0 ? Math.round((c.gpaSum / c.gpaCount) * 100) / 100 : null
      }));
  }

// ── Section Enrollment Timeline ────────────────────────────────────
  async getSectionEnrollmentTimeline(sectionId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { sectionId, deletedAt: null },
      select: { status: true, createdAt: true, droppedAt: true },
      orderBy: { createdAt: "asc" }
    });

    if (enrollments.length === 0) return { points: [], sectionId };

    const start = enrollments[0].createdAt;
    const end = new Date();
    const dayMs = 86_400_000;
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / dayMs) + 1;

    // Build a day-by-day running count
    const points: Array<{ day: number; date: string; enrolled: number; waitlisted: number }> = [];
    for (let d = 0; d <= Math.min(totalDays, 90); d++) {
      const dayEnd = new Date(start.getTime() + (d + 1) * dayMs);
      const enrolled = enrollments.filter(
        (e) => e.createdAt <= dayEnd && e.status === "ENROLLED" && (!e.droppedAt || e.droppedAt > dayEnd)
      ).length;
      const waitlisted = enrollments.filter(
        (e) => e.createdAt <= dayEnd && e.status === "WAITLISTED" && (!e.droppedAt || e.droppedAt > dayEnd)
      ).length;
      points.push({
        day: d,
        date: new Date(start.getTime() + d * dayMs).toISOString().slice(0, 10),
        enrolled,
        waitlisted
      });
    }

    return { points, sectionId };
  }

// ── Term Comparison ─────────────────────────────────────────────────
  private async fetchTermStats(tid: string) {
    const [enrollments, sections] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { termId: tid, deletedAt: null },
        include: { section: { include: { course: { select: { code: true } } } } }
      }),
      this.prisma.section.findMany({
        where: { termId: tid, course: { deletedAt: null } },
        include: { _count: { select: { enrollments: { where: { status: "ENROLLED", deletedAt: null } } } } }
      })
    ]);

    let wp = 0, cr = 0;
    for (const e of enrollments) {
      if (e.status !== "COMPLETED" || !e.finalGrade) continue;
      const pts = GRADE_POINTS[e.finalGrade];
      if (pts !== undefined) { wp += pts * e.section.credits; cr += e.section.credits; }
    }

    const deptMap = new Map<string, number>();
    for (const e of enrollments.filter((e) => e.status === "ENROLLED")) {
      const dept = e.section.course.code.slice(0, 2);
      deptMap.set(dept, (deptMap.get(dept) ?? 0) + 1);
    }

    const totalCapacity = sections.reduce((s, sec) => s + sec.capacity, 0);
    const totalSeatsUsed = sections.reduce((s, sec) => s + sec._count.enrollments, 0);

    return {
      totalEnrolled: enrollments.filter((e) => e.status === "ENROLLED").length,
      totalWaitlisted: enrollments.filter((e) => e.status === "WAITLISTED").length,
      totalDropped: enrollments.filter((e) => e.status === "DROPPED").length,
      totalCompleted: enrollments.filter((e) => e.status === "COMPLETED").length,
      sectionCount: sections.length,
      avgGpa: cr > 0 ? Math.round((wp / cr) * 100) / 100 : null,
      utilizationPct: totalCapacity > 0 ? Math.round((totalSeatsUsed / totalCapacity) * 100) : null,
      topDepts: Array.from(deptMap.entries())
        .sort(([, a], [, b]) => b - a).slice(0, 5)
        .map(([dept, count]) => ({ dept, count }))
    };
  }

async getTermComparison(termAId: string, termBId: string) {
    const [termA, termB] = await Promise.all([
      this.prisma.term.findUnique({ where: { id: termAId }, select: { id: true, name: true } }),
      this.prisma.term.findUnique({ where: { id: termBId }, select: { id: true, name: true } })
    ]);
    if (!termA || !termB) throw new NotFoundException({ code: "TERM_NOT_FOUND" });

    const [statsA, statsB] = await Promise.all([
      this.fetchTermStats(termAId),
      this.fetchTermStats(termBId)
    ]);

    return { termA: { ...termA, ...statsA }, termB: { ...termB, ...statsB } };
  }

// ── Student Notes ────────────────────────────────────────────────────

  async getStudentNotes(studentId: string) {
    const notes = await this.prisma.studentNote.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      include: {
        admin: { select: { email: true } }
      }
    });
    return notes;
  }

async createStudentNote(adminId: string, studentId: string, content: string, flag?: string) {
    const student = await this.prisma.user.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!student) throw new NotFoundException({ code: "STUDENT_NOT_FOUND" });
    const note = await this.prisma.studentNote.create({
      data: { adminId, studentId, content: sanitizeHtml(content), flag: flag ?? null },
      include: { admin: { select: { email: true } } }
    });
    await this.auditService.log({ actorUserId: adminId, action: "NOTE_CREATED", entityType: "StudentNote", entityId: note.id, metadata: { studentId, flag } });
    return note;
  }

async deleteStudentNote(adminId: string, noteId: string) {
    const note = await this.prisma.studentNote.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundException({ code: "NOTE_NOT_FOUND" });
    await this.prisma.studentNote.delete({ where: { id: noteId } });
    await this.auditService.log({ actorUserId: adminId, action: "NOTE_DELETED", entityType: "StudentNote", entityId: noteId, metadata: { studentId: note.studentId } });
    return { deleted: true };
  }

async getAvailableStudentTags() {
    const rows = await this.prisma.$queryRaw<Array<{ tag: string }>>(Prisma.sql`
      SELECT DISTINCT jsonb_array_elements_text(COALESCE(metadata->'tags', '[]'::jsonb)) AS tag
      FROM "AuditLog"
      WHERE action = 'STUDENT_TAGS_SET'
      ORDER BY tag ASC
    `);

    return rows.map((row) => row.tag).filter(Boolean);
  }

async getStudentTags(studentId: string) {
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, role: "STUDENT", deletedAt: null },
      select: { id: true }
    });
    if (!student) throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "学生不存在" });

    const latest = await this.prisma.auditLog.findFirst({
      where: {
        action: "STUDENT_TAGS_SET",
        entityType: "student_tags",
        entityId: studentId
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { metadata: true }
    });

    return { studentId, tags: extractTagsFromMetadata(latest?.metadata) };
  }

async setStudentTags(adminId: string, studentId: string, tags: string[]) {
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, role: "STUDENT", deletedAt: null },
      select: { id: true }
    });
    if (!student) throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "学生不存在" });

    const normalized = normalizeTags(tags);

    await this.auditService.log({
      actorUserId: adminId,
      action: "STUDENT_TAGS_SET",
      entityType: "student_tags",
      entityId: studentId,
      metadata: { tags: normalized }
    });

    return { studentId, tags: normalized };
  }

async getBulkStudentTags(studentIds: string[]): Promise<Record<string, string[]>> {
    if (!studentIds.length) return {};

    // Fetch latest STUDENT_TAGS_SET audit log per student in one query
    type TagRow = { entityId: string; metadata: Prisma.JsonValue };
    const rows = await this.prisma.$queryRaw<TagRow[]>(Prisma.sql`
      SELECT DISTINCT ON ("entityId") "entityId", metadata
      FROM "AuditLog"
      WHERE action = 'STUDENT_TAGS_SET'
        AND "entityType" = 'student_tags'
        AND "entityId" = ANY(${studentIds}::text[])
      ORDER BY "entityId", "createdAt" DESC, id DESC
    `);

    const result: Record<string, string[]> = Object.fromEntries(studentIds.map((id) => [id, []]));
    for (const row of rows) {
      result[row.entityId] = extractTagsFromMetadata(row.metadata);
    }
    return result;
  }

// ── Email Digest ─────────────────────────────────────────────────────

  async buildDigestPreview(termId?: string): Promise<{
    enrolledCount: number;
    waitlistedCount: number;
    cartCount: number;
    pendingAppeals: number;
    upcomingDeadline: string | null;
    topSections: Array<{ code: string; title: string; enrolled: number; capacity: number }>;
    htmlPreview: string;
  }> {
    const [enrolledCount, waitlistedCount, cartCount, pendingAppeals, terms, sections] = await Promise.all([
      this.prisma.enrollment.count({ where: { status: "ENROLLED", deletedAt: null } }),
      this.prisma.enrollment.count({ where: { status: "WAITLISTED", deletedAt: null } }),
      this.prisma.cartItem.count(),
      this.prisma.gradeAppeal.count({ where: { status: "PENDING" } }),
      this.prisma.term.findMany({ where: { registrationOpen: true }, orderBy: { dropDeadline: "asc" }, take: 1 }),
      this.prisma.section.findMany({
        where: termId ? { termId } : {},
        include: {
          course: { select: { code: true, title: true } },
          _count: { select: { enrollments: { where: { status: "ENROLLED", deletedAt: null } } } }
        },
        orderBy: { createdAt: "asc" },
        take: 5
      })
    ]);

    const upcomingDeadline = terms[0]?.dropDeadline
      ? new Date(terms[0].dropDeadline).toLocaleDateString()
      : null;

    const topSections = sections.map((s) => ({
      code: s.course.code,
      title: s.course.title,
      enrolled: s._count.enrollments,
      capacity: s.capacity
    }));

    const sectionRows = topSections.map((s) =>
      `<tr><td style="padding:4px 8px;font-family:monospace">${s.code}</td><td style="padding:4px 8px">${s.title}</td><td style="padding:4px 8px;text-align:center">${s.enrolled}/${s.capacity}</td></tr>`
    ).join("");

    const htmlPreview = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:sans-serif;color:#1e293b;max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#4f46e5;color:#fff;padding:24px 32px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;font-size:22px">📊 注册管理周报</h1>
    <p style="margin:6px 0 0;opacity:.8;font-size:13px">University SIS · 管理员摘要</p>
  </div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 12px 12px">
    <h2 style="font-size:15px;color:#475569;margin-bottom:12px">本周概览</h2>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
        <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">已选课人数</p>
        <p style="margin:4px 0 0;font-size:28px;font-weight:800;color:#4f46e5">${enrolledCount}</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
        <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">候补人数</p>
        <p style="margin:4px 0 0;font-size:28px;font-weight:800;color:#f59e0b">${waitlistedCount}</p>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
        <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">购物车中</p>
        <p style="margin:4px 0 0;font-size:28px;font-weight:800;color:#0ea5e9">${cartCount}</p>
      </div>
      <div style="background:#fff;border:1px solid #fef3c7;border-radius:8px;padding:12px;background:#fffbeb">
        <p style="margin:0;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">待审申诉</p>
        <p style="margin:4px 0 0;font-size:28px;font-weight:800;color:#dc2626">${pendingAppeals}</p>
      </div>
    </div>
    ${upcomingDeadline ? `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:20px">
      <p style="margin:0;font-size:13px;font-weight:600;color:#92400e">⏰ 即将到来的退课截止日期：${upcomingDeadline}</p>
    </div>` : ""}
    ${topSections.length > 0 ? `
    <h2 style="font-size:15px;color:#475569;margin-bottom:8px">教学班一览</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <thead><tr style="background:#f1f5f9"><th style="padding:8px;text-align:left">代码</th><th style="padding:8px;text-align:left">课程名</th><th style="padding:8px;text-align:center">选课/容量</th></tr></thead>
      <tbody>${sectionRows}</tbody>
    </table>` : ""}
    <p style="margin-top:20px;font-size:11px;color:#94a3b8;text-align:center">University SIS — 管理员周报</p>
  </div>
</body>
</html>`;

    return { enrolledCount, waitlistedCount, cartCount, pendingAppeals, upcomingDeadline, topSections, htmlPreview };
  }

async sendDigestEmail(adminId: string, recipientEmail: string, termId?: string) {
    const digest = await this.buildDigestPreview(termId);
    await this.notificationsService.sendMail({
      to: recipientEmail,
      subject: "📊 注册管理周报 — University SIS",
      html: digest.htmlPreview,
      text: `注册管理周报\n已选课: ${digest.enrolledCount}\n候补: ${digest.waitlistedCount}\n购物车: ${digest.cartCount}\n待审申诉: ${digest.pendingAppeals}`
    });
    await this.auditService.log({
      actorUserId: adminId,
      action: "DIGEST_SENT",
      entityType: "DigestEmail",
      entityId: recipientEmail,
      metadata: { enrolledCount: digest.enrolledCount }
    });
    return { sent: true, to: recipientEmail };
  }

// ── Section Demand Report ─────────────────────────────────────────────

  async getSectionDemandReport(termId?: string) {
    const sections = await this.prisma.section.findMany({
      where: termId ? { termId } : {},
      include: {
        course: { select: { code: true, title: true, credits: true } },
        term: { select: { id: true, name: true } },
        _count: {
          select: {
            enrollments: { where: { status: "ENROLLED", deletedAt: null } },
            cartItems: true,
            watches: true
          }
        },
        enrollments: {
          where: { status: "WAITLISTED", deletedAt: null },
          select: { id: true }
        }
      }
    });

    const rows = sections.map((s) => {
      const enrolled = s._count.enrollments;
      const inCart = s._count.cartItems;
      const waitlisted = s.enrollments.length;
      const watching = s._count.watches;
      const demand = inCart + waitlisted + watching;
      const utilizationPct = s.capacity > 0 ? Math.round((enrolled / s.capacity) * 100) : null;
      return {
        id: s.id,
        sectionCode: s.sectionCode,
        course: s.course,
        term: s.term,
        instructorName: s.instructorName,
        capacity: s.capacity,
        enrolled,
        inCart,
        waitlisted,
        watching,
        demand,
        utilizationPct
      };
    });

    return rows.sort((a, b) => b.demand - a.demand);
  }

// ── Calendar Events ──────────────────────────────────────────────────

  async createCalendarEvent(adminId: string, data: {
    title: string;
    description?: string;
    eventDate: string;
    endDate?: string;
    type?: string;
    termId?: string;
  }) {
    const event = await this.prisma.calendarEvent.create({
      data: {
        title: sanitizeHtml(data.title),
        description: data.description ? sanitizeHtml(data.description) : null,
        eventDate: new Date(data.eventDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        type: data.type ?? "INFO",
        termId: data.termId ?? null,
        createdById: adminId
      },
      include: { term: { select: { id: true, name: true } } }
    });
    await this.auditService.log({ actorUserId: adminId, action: "CALENDAR_EVENT_CREATED", entityType: "CalendarEvent", entityId: event.id, metadata: { title: event.title } });
    return event;
  }

async updateCalendarEvent(adminId: string, eventId: string, data: {
    title?: string;
    description?: string;
    eventDate?: string;
    endDate?: string;
    type?: string;
    termId?: string | null;
  }) {
    const existing = await this.prisma.calendarEvent.findUnique({ where: { id: eventId } });
    if (!existing) throw new NotFoundException({ code: "EVENT_NOT_FOUND" });
    const updated = await this.prisma.calendarEvent.update({
      where: { id: eventId },
      data: {
        ...(data.title && { title: sanitizeHtml(data.title) }),
        ...(data.description !== undefined && { description: data.description ? sanitizeHtml(data.description) : null }),
        ...(data.eventDate && { eventDate: new Date(data.eventDate) }),
        ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
        ...(data.type && { type: data.type }),
        ...(data.termId !== undefined && { termId: data.termId })
      },
      include: { term: { select: { id: true, name: true } } }
    });
    await this.auditService.log({ actorUserId: adminId, action: "CALENDAR_EVENT_UPDATED", entityType: "CalendarEvent", entityId: eventId, metadata: {} });
    return updated;
  }

async deleteCalendarEvent(adminId: string, eventId: string) {
    const existing = await this.prisma.calendarEvent.findUnique({ where: { id: eventId } });
    if (!existing) throw new NotFoundException({ code: "EVENT_NOT_FOUND" });
    await this.prisma.calendarEvent.delete({ where: { id: eventId } });
    await this.auditService.log({ actorUserId: adminId, action: "CALENDAR_EVENT_DELETED", entityType: "CalendarEvent", entityId: eventId, metadata: {} });
    return { deleted: true };
  }

// ── Unified Search ──────────────────────────────────────────────────

  async unifiedSearch(q: string, type: "all" | "student" | "course" | "section" = "all") {
    const term = q.trim();
    if (!term) return { students: [], courses: [], sections: [] };

    const [students, courses, sections] = await Promise.all([
      type === "all" || type === "student"
        ? this.prisma.user.findMany({
            where: {
              deletedAt: null,
              role: "STUDENT",
              OR: [
                { email: { contains: term, mode: "insensitive" } },
                { studentProfile: { legalName: { contains: term, mode: "insensitive" } } }
              ]
            },
            select: {
              id: true,
              email: true,
              studentProfile: { select: { legalName: true, programMajor: true } }
            },
            take: 10
          })
        : [],
      type === "all" || type === "course"
        ? this.prisma.course.findMany({
            where: {
              deletedAt: null,
              OR: [
                { code: { contains: term, mode: "insensitive" } },
                { title: { contains: term, mode: "insensitive" } }
              ]
            },
            select: { id: true, code: true, title: true, credits: true },
            take: 10
          })
        : [],
      type === "all" || type === "section"
        ? this.prisma.section.findMany({
            where: {
              OR: [
                { sectionCode: { contains: term, mode: "insensitive" } },
                { instructorName: { contains: term, mode: "insensitive" } },
                { course: { code: { contains: term, mode: "insensitive" } } },
                { course: { title: { contains: term, mode: "insensitive" } } }
              ]
            },
            include: {
              course: { select: { code: true, title: true } },
              term: { select: { name: true } },
              _count: { select: { enrollments: { where: { status: "ENROLLED", deletedAt: null } } } }
            },
            take: 10
          })
        : []
    ]);

    return { students, courses, sections };
  }

// ── System Alerts ────────────────────────────────────────────────────────────
  async getSystemAlerts() {
    type SystemAlert = {
      id: string;
      type: string;
      severity: "error" | "warning" | "info";
      title: string;
      description: string;
      actionUrl: string;
      count: number;
    };

    const alerts: SystemAlert[] = [];
    const now = new Date();

    const [
      pendingAppeals,
      pendingEnrollments,
      activeHolds,
      missingGrades,
      futureTerms
    ] = await Promise.all([
      this.prisma.gradeAppeal.count({ where: { status: "PENDING" } }),
      this.prisma.enrollment.count({ where: { status: "PENDING_APPROVAL", deletedAt: null } }),
      this.prisma.studentHold.count({ where: { active: true } }),
      this.prisma.enrollment.count({ where: { status: "COMPLETED", finalGrade: null, deletedAt: null } }),
      this.prisma.term.findMany({
        where: { endDate: { gte: now } },
        select: { id: true }
      })
    ]);

    if (missingGrades > 0) {
      alerts.push({
        id: "missing-grades",
        type: "MISSING_GRADE",
        severity: "error",
        title: `${missingGrades} 个已完成注册缺少成绩`,
        description: "有课程状态为 COMPLETED 但缺少最终成绩，请联系教师补录。",
        actionUrl: "/admin/enrollments",
        count: missingGrades
      });
    }

    if (pendingAppeals > 0) {
      alerts.push({
        id: "grade-appeals",
        type: "GRADE_APPEAL",
        severity: "error",
        title: `${pendingAppeals} 个成绩申诉待审批`,
        description: "学生提交了成绩申诉，等待管理员审核并作出决定。",
        actionUrl: "/admin/appeals",
        count: pendingAppeals
      });
    }

    if (pendingEnrollments > 0) {
      alerts.push({
        id: "pending-enrollments",
        type: "PENDING_ENROLLMENT",
        severity: "warning",
        title: `${pendingEnrollments} 个注册记录待审批`,
        description: "有学生注册记录处于 PENDING_APPROVAL 状态，需要管理员处理。",
        actionUrl: "/admin/enrollments",
        count: pendingEnrollments
      });
    }

    if (activeHolds > 0) {
      alerts.push({
        id: "active-holds",
        type: "ACTIVE_HOLD",
        severity: "warning",
        title: `${activeHolds} 个学生限制生效中`,
        description: "有学生因限制无法正常注册课程，请检查是否需要处理。",
        actionUrl: "/admin/holds",
        count: activeHolds
      });
    }

    if (futureTerms.length > 0) {
      const termIds = futureTerms.map((t) => t.id);
      const sections = await this.prisma.section.findMany({
        where: { termId: { in: termIds }, capacity: { gt: 0 } },
        include: {
          course: { select: { code: true } },
          _count: { select: { enrollments: { where: { status: "ENROLLED", deletedAt: null } } } }
        }
      });
      const nearCapacity = sections.filter(
        (s) => s._count.enrollments / s.capacity >= 0.9
      );
      if (nearCapacity.length > 0) {
        const sampleCodes = nearCapacity
          .slice(0, 3)
          .map((s) => s.course.code)
          .join(", ");
        alerts.push({
          id: "near-capacity",
          type: "NEAR_CAPACITY",
          severity: "info",
          title: `${nearCapacity.length} 个教学班即将满员 (≥90%)`,
          description: `涉及教学班：${sampleCodes}${nearCapacity.length > 3 ? " 等" : ""}，可考虑扩容或开设新班。`,
          actionUrl: "/admin/sections",
          count: nearCapacity.length
        });
      }
    }

    // Past-term ENROLLED enrollments (not closed out)
    const pastTerms = await this.prisma.term.findMany({
      where: { endDate: { lt: now } },
      select: { id: true }
    });
    if (pastTerms.length > 0) {
      const notClosedOut = await this.prisma.enrollment.count({
        where: {
          status: "ENROLLED",
          section: { termId: { in: pastTerms.map((t) => t.id) } },
          deletedAt: null
        }
      });
      if (notClosedOut > 0) {
        alerts.push({
          id: "not-closed-out",
          type: "NOT_CLOSED_OUT",
          severity: "warning",
          title: `${notClosedOut} 个注册未完成结课`,
          description: "有学生注册状态仍为 ENROLLED，但对应学期已结束，请检查并更新状态。",
          actionUrl: "/admin/enrollments",
          count: notClosedOut
        });
      }
    }

    return alerts;
  }

// ── Course Offering History ───────────────────────────────────────────────────
  async getCourseOfferingHistory(filterCourseId?: string) {
    // Fetch raw rows joined with course+term+ratings
    const raw = await this.prisma.$queryRaw<
      Array<{
        sid: string; sectionCode: string; instructorName: string; capacity: number;
        courseId: string; courseCode: string; courseTitle: string; credits: number;
        termId: string; termName: string; termEndDate: Date;
        enrolledCount: bigint; avgRating: number | null;
      }>
    >`
      SELECT
        s.id AS sid,
        s."sectionCode",
        s."instructorName",
        s.capacity,
        c.id AS "courseId", c.code AS "courseCode", c.title AS "courseTitle", c.credits,
        t.id AS "termId", t.name AS "termName", t."endDate" AS "termEndDate",
        COALESCE((
          SELECT COUNT(*) FROM "Enrollment" e
          WHERE e."sectionId" = s.id AND e.status = 'ENROLLED' AND e."deletedAt" IS NULL
        ), 0) AS "enrolledCount",
        (
          SELECT AVG(r.rating) FROM "CourseRating" r WHERE r."sectionId" = s.id
        ) AS "avgRating"
      FROM "Section" s
      JOIN "Course" c ON c.id = s."courseId"
      JOIN "Term" t ON t.id = s."termId"
      WHERE c."deletedAt" IS NULL
        ${filterCourseId ? Prisma.sql`AND s."courseId" = ${filterCourseId}` : Prisma.sql``}
      ORDER BY t."endDate" DESC, c.code ASC
    `;

    type TermOffering = {
      termId: string; termName: string; termEndDate: string;
      sectionId: string; sectionCode: string; instructorName: string;
      capacity: number; enrolled: number; utilizationPct: number; avgRating: number | null;
    };
    type CourseHistory = {
      courseId: string; courseCode: string; courseTitle: string; credits: number;
      termCount: number; avgUtilization: number; offerings: TermOffering[];
    };

    const byCourseMemo = new Map<string, CourseHistory>();

    for (const s of raw) {
      const enrolled = Number(s.enrolledCount);
      const utilizationPct = s.capacity > 0 ? Math.round((enrolled / s.capacity) * 100) : 0;
      const avgRating = s.avgRating !== null ? Math.round(Number(s.avgRating) * 10) / 10 : null;

      if (!byCourseMemo.has(s.courseId)) {
        byCourseMemo.set(s.courseId, {
          courseId: s.courseId, courseCode: s.courseCode,
          courseTitle: s.courseTitle, credits: s.credits,
          termCount: 0, avgUtilization: 0, offerings: []
        });
      }
      byCourseMemo.get(s.courseId)!.offerings.push({
        termId: s.termId, termName: s.termName,
        termEndDate: s.termEndDate instanceof Date ? s.termEndDate.toISOString() : String(s.termEndDate),
        sectionId: s.sid, sectionCode: s.sectionCode, instructorName: s.instructorName,
        capacity: s.capacity, enrolled, utilizationPct, avgRating
      });
    }

    const results: CourseHistory[] = [];
    for (const [, hist] of byCourseMemo) {
      const termIds = new Set(hist.offerings.map((o) => o.termId));
      hist.termCount = termIds.size;
      hist.avgUtilization =
        hist.offerings.length > 0
          ? Math.round(hist.offerings.reduce((a, o) => a + o.utilizationPct, 0) / hist.offerings.length)
          : 0;
      results.push(hist);
    }
    return results.sort((a, b) => a.courseCode.localeCompare(b.courseCode));
  }

// ── Prerequisite Integrity Audit ──────────────────────────────────────────────
  async getPrereqViolations() {
    // Courses that have prerequisites defined
    const courses = await this.prisma.course.findMany({
      where: { prerequisiteLinks: { some: {} }, deletedAt: null },
      include: {
        prerequisiteLinks: {
          include: { prerequisiteCourse: { select: { id: true, code: true } } }
        }
      }
    });

    if (courses.length === 0) return [];

    const violations: Array<{
      courseCode: string;
      courseTitle: string;
      studentId: string;
      studentEmail: string;
      studentName: string | null;
      termName: string;
      enrollmentStatus: string;
      missingPrereqs: string[];
    }> = [];

    for (const course of courses) {
      const prereqCodes = course.prerequisiteLinks.map((l) => l.prerequisiteCourse.code);
      if (prereqCodes.length === 0) continue;

      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          section: { courseId: course.id },
          status: { in: ["ENROLLED", "COMPLETED"] },
          deletedAt: null
        },
        include: {
          student: {
            select: {
              id: true,
              email: true,
              studentProfile: { select: { legalName: true } }
            }
          },
          section: { include: { term: { select: { name: true } } } }
        }
      });

      for (const enrollment of enrollments) {
        // Check which prereqs the student has completed
        const completedPrereqEnrollments = await this.prisma.enrollment.findMany({
          where: {
            studentId: enrollment.studentId,
            status: "COMPLETED",
            finalGrade: { not: null, notIn: ["F", "W"] },
            section: { course: { code: { in: prereqCodes } } },
            deletedAt: null
          },
          select: { section: { select: { course: { select: { code: true } } } } }
        });

        const completedCodes = new Set(
          completedPrereqEnrollments.map((e) => e.section.course.code)
        );
        const missing = prereqCodes.filter((code) => !completedCodes.has(code));

        if (missing.length > 0) {
          violations.push({
            courseCode: course.code,
            courseTitle: course.title,
            studentId: enrollment.studentId,
            studentEmail: enrollment.student.email,
            studentName: enrollment.student.studentProfile?.legalName ?? null,
            termName: enrollment.section.term.name,
            enrollmentStatus: enrollment.status,
            missingPrereqs: missing
          });
        }
      }
    }

    return violations;
  }

// ── Bulk Email by Enrollment Status ──────────────────────────────────────────
  async previewStatusEmail(termId: string, status: string) {
    const enumStatus = status as EnrollmentStatus;
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        status: enumStatus,
        deletedAt: null,
        section: termId ? { termId } : undefined
      },
      include: {
        student: { select: { id: true, email: true, studentProfile: { select: { legalName: true } } } },
        section: { include: { course: { select: { code: true, title: true } }, term: { select: { name: true } } } }
      },
      take: 500
    });

    const uniqueStudents = new Map<string, { email: string; name: string | null }>();
    for (const e of enrollments) {
      if (!uniqueStudents.has(e.studentId)) {
        uniqueStudents.set(e.studentId, {
          email: e.student.email,
          name: e.student.studentProfile?.legalName ?? null
        });
      }
    }

    return {
      recipientCount: uniqueStudents.size,
      enrollmentCount: enrollments.length,
      sampleRecipients: Array.from(uniqueStudents.values()).slice(0, 5)
    };
  }

async sendStatusEmail(
    termId: string,
    status: string,
    subject: string,
    body: string,
    actorUserId: string
  ) {
    const enumStatus = status as EnrollmentStatus;
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        status: enumStatus,
        deletedAt: null,
        section: termId ? { termId } : undefined
      },
      include: {
        student: { select: { id: true, email: true, studentProfile: { select: { legalName: true } } } }
      },
      take: 500
    });

    const uniqueStudents = new Map<string, { id: string; email: string; name: string | null }>();
    for (const e of enrollments) {
      if (!uniqueStudents.has(e.studentId)) {
        uniqueStudents.set(e.studentId, {
          id: e.studentId,
          email: e.student.email,
          name: e.student.studentProfile?.legalName ?? null
        });
      }
    }

    let sent = 0;
    for (const student of uniqueStudents.values()) {
      try {
        await this.notificationsService.sendMail({
          to: student.email,
          subject,
          text: body,
          html: `<div style="font-family:sans-serif;max-width:560px"><p>${body.replace(/\n/g, "<br>")}</p></div>`
        });
        await this.prisma.notificationLog.create({
          data: { userId: student.id, type: "STATUS_EMAIL", subject, body: body.slice(0, 500) }
        });
        sent++;
      } catch { /* skip individual failures */ }
    }

    await this.auditService.log({
      actorUserId,
      action: "BULK_STATUS_EMAIL",
      entityType: "enrollment",
      entityId: "multiple",
      metadata: { status, termId, sent, subject }
    });

    return { sent, total: uniqueStudents.size };
  }

// ── Waitlist Analytics ────────────────────────────────────────────────────
  async getWaitlistAnalytics(termId?: string) {
    // Use raw SQL to avoid Prisma type inference issues with conditional where + include
    type WLRow = {
      enrollmentId: string; studentId: string; sectionId: string; sectionCode: string;
      courseCode: string; courseTitle: string; termName: string; capacity: number;
      enrolledCount: bigint; waitlistPosition: number | null; programMajor: string | null;
    };
    const rows = await this.prisma.$queryRaw<WLRow[]>`
      SELECT e.id AS "enrollmentId", e."studentId", e."sectionId", e."waitlistPosition",
             s."sectionCode", c.code AS "courseCode", c.title AS "courseTitle",
             t.name AS "termName", s.capacity,
             (SELECT COUNT(*) FROM "Enrollment" e2 WHERE e2."sectionId" = s.id AND e2.status = 'ENROLLED' AND e2."deletedAt" IS NULL) AS "enrolledCount",
             sp."programMajor"
      FROM "Enrollment" e
      JOIN "Section" s ON s.id = e."sectionId"
      JOIN "Course" c ON c.id = s."courseId"
      JOIN "Term" t ON t.id = s."termId"
      LEFT JOIN "StudentProfile" sp ON sp."userId" = e."studentId"
      WHERE e.status = 'WAITLISTED' AND e."deletedAt" IS NULL
        ${termId ? Prisma.sql`AND s."termId" = ${termId}` : Prisma.sql``}
      ORDER BY e."waitlistPosition" ASC
    `;

    // Per-section summary
    const sectionMap = new Map<string, {
      sectionId: string; sectionCode: string; courseCode: string; courseTitle: string; termName: string;
      capacity: number; enrolled: number; waitlistCount: number; avgPosition: number; maxPosition: number;
    }>();

    for (const r of rows) {
      const sid = r.sectionId;
      if (!sectionMap.has(sid)) {
        sectionMap.set(sid, {
          sectionId: sid, sectionCode: r.sectionCode, courseCode: r.courseCode,
          courseTitle: r.courseTitle, termName: r.termName, capacity: r.capacity,
          enrolled: toNum(r.enrolledCount), waitlistCount: 0, avgPosition: 0, maxPosition: 0
        });
      }
      const entry = sectionMap.get(sid)!;
      entry.waitlistCount++;
      entry.avgPosition += r.waitlistPosition ?? 0;
      entry.maxPosition = Math.max(entry.maxPosition, r.waitlistPosition ?? 0);
    }

    const sections = Array.from(sectionMap.values()).map((s) => ({
      ...s,
      avgPosition: s.waitlistCount > 0 ? Math.round(s.avgPosition / s.waitlistCount) : 0,
      utilizationPct: s.capacity > 0 ? Math.round((s.enrolled / s.capacity) * 100) : 0
    })).sort((a, b) => b.waitlistCount - a.waitlistCount);

    // Dept-level summary by programMajor
    const deptMap = new Map<string, { dept: string; waitlistCount: number; sections: Set<string> }>();
    for (const r of rows) {
      const dept = r.programMajor ?? "Unknown";
      if (!deptMap.has(dept)) deptMap.set(dept, { dept, waitlistCount: 0, sections: new Set() });
      const d = deptMap.get(dept)!;
      d.waitlistCount++;
      d.sections.add(r.sectionId);
    }
    const byDept = Array.from(deptMap.values())
      .map((d) => ({ dept: d.dept, waitlistCount: d.waitlistCount, sectionsAffected: d.sections.size }))
      .sort((a, b) => b.waitlistCount - a.waitlistCount);

    const uniqueStudents = new Set(rows.map((r) => r.studentId)).size;
    return {
      totalWaitlisted: rows.length,
      uniqueStudents,
      sectionsWithWaitlist: sections.length,
      sections: sections.slice(0, 30),
      byDept: byDept.slice(0, 15)
    };
  }

// ── Graduation Clearance ──────────────────────────────────────────────────
  async getGraduationClearance(minCredits = 120) {
    const [students, appeals] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: "STUDENT", deletedAt: null },
        select: {
          id: true,
          email: true,
          studentProfile: {
            select: {
              legalName: true,
              programMajor: true
            }
          },
          enrollments: {
            where: { deletedAt: null },
            select: {
              status: true,
              finalGrade: true,
              section: {
                select: {
                  credits: true
                }
              }
            }
          }
        }
      }),
      this.prisma.gradeAppeal.findMany({
        where: { status: "PENDING" },
        select: { studentId: true }
      })
    ]);

    const appealsByStudent = new Map<string, number>();
    for (const a of appeals) {
      appealsByStudent.set(a.studentId, (appealsByStudent.get(a.studentId) ?? 0) + 1);
    }

    return students
      .map((student) => {
        let creditsDone = 0;
        let creditsInProgress = 0;
        let missingGrades = 0;
        let pendingApproval = 0;

        for (const enrollment of student.enrollments) {
          const credits = enrollment.section.credits ?? 0;
          if (enrollment.status === "COMPLETED") {
            creditsDone += credits;
            if (!enrollment.finalGrade) missingGrades += 1;
          } else if (enrollment.status === "ENROLLED") {
            creditsInProgress += credits;
          } else if (enrollment.status === "PENDING_APPROVAL") {
            pendingApproval += 1;
          }
        }

        const openAppeals = appealsByStudent.get(student.id) ?? 0;
        const eligible =
          creditsDone >= minCredits &&
          missingGrades === 0 &&
          openAppeals === 0 &&
          pendingApproval === 0;

        return {
          userId: student.id,
          email: student.email,
          name: student.studentProfile?.legalName ?? null,
          department: student.studentProfile?.programMajor ?? null,
          creditsDone,
          creditsInProgress,
          creditsNeeded: Math.max(0, minCredits - creditsDone),
          missingGrades,
          openAppeals,
          pendingApproval,
          eligible
        };
      })
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.creditsDone - a.creditsDone);
  }

// ── Registration Activity Heatmap ─────────────────────────────────────────
  async getRegistrationHeatmap(termId?: string) {
    // Use raw SQL to extract weekday + hour from createdAt
    const rows = await this.prisma.$queryRaw<Array<{ dow: number; hour: number; count: bigint }>>`
      SELECT
        EXTRACT(DOW FROM e."createdAt")::int AS dow,
        EXTRACT(HOUR FROM e."createdAt")::int AS hour,
        COUNT(*) AS count
      FROM "Enrollment" e
      JOIN "Section" s ON s.id = e."sectionId"
      WHERE e."deletedAt" IS NULL
        ${termId ? Prisma.sql`AND s."termId" = ${termId}` : Prisma.sql``}
      GROUP BY dow, hour
      ORDER BY dow, hour
    `;

    // Build a 7×24 grid (dow 0=Sunday..6=Saturday, hour 0..23)
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let maxCount = 0;
    for (const row of rows) {
      const count = toNum(row.count);
      grid[row.dow][row.hour] = count;
      if (count > maxCount) maxCount = count;
    }

    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const totalRegistrations = rows.reduce((s, r) => s + toNum(r.count), 0);

    // Top slots
    const slots = rows
      .map((r) => ({ day: dayLabels[r.dow], hour: r.hour, count: toNum(r.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { grid, dayLabels, maxCount, totalRegistrations, topSlots: slots };
  }

// ── Student Credit Load Distribution ─────────────────────────────────────
  async getCreditLoadDistribution(termId?: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        status: EnrollmentStatus.ENROLLED,
        deletedAt: null,
        section: termId ? { termId } : undefined
      },
      include: { section: { include: { course: { select: { credits: true } } } } }
    });

    // Sum credits per student
    const studentCredits = new Map<string, number>();
    for (const e of enrollments) {
      const prev = studentCredits.get(e.studentId) ?? 0;
      studentCredits.set(e.studentId, prev + (e.section.course.credits ?? 0));
    }

    const counts = { lt9: 0, n9to11: 0, n12to15: 0, n16to18: 0, gt18: 0 };
    for (const credits of studentCredits.values()) {
      if (credits < 9) counts.lt9++;
      else if (credits <= 11) counts.n9to11++;
      else if (credits <= 15) counts.n12to15++;
      else if (credits <= 18) counts.n16to18++;
      else counts.gt18++;
    }

    const mean = studentCredits.size > 0
      ? Math.round((Array.from(studentCredits.values()).reduce((s, v) => s + v, 0) / studentCredits.size) * 10) / 10
      : 0;

    return {
      totalStudents: studentCredits.size,
      mean,
      distribution: [
        { label: "< 9", count: counts.lt9, tag: "underload" },
        { label: "9–11", count: counts.n9to11, tag: "light" },
        { label: "12–15", count: counts.n12to15, tag: "normal" },
        { label: "16–18", count: counts.n16to18, tag: "heavy" },
        { label: "> 18", count: counts.gt18, tag: "overload" }
      ]
    };
  }

async getFacultySchedule(termId?: string) {
    const normalizedTermId = termId?.trim() ? termId : null;
    const sectionRows = await this.prisma.$queryRaw<
      Array<{
        instructorId: string;
        instructorName: string;
        email: string;
        sectionId: string;
        sectionCode: string;
        courseCode: string;
        courseTitle: string;
        capacity: number;
        enrolled: number;
        waitlisted: number;
      }>
    >(Prisma.sql`
      SELECT
        u.id AS "instructorId",
        COALESCE(fp."displayName", s."instructorName", u.email) AS "instructorName",
        u.email AS "email",
        s.id AS "sectionId",
        s."sectionCode" AS "sectionCode",
        c.code AS "courseCode",
        c.title AS "courseTitle",
        s.capacity::int AS "capacity",
        COALESCE(SUM(CASE WHEN e.status = 'ENROLLED' AND e."deletedAt" IS NULL THEN 1 ELSE 0 END), 0)::int AS "enrolled",
        COALESCE(SUM(CASE WHEN e.status = 'WAITLISTED' AND e."deletedAt" IS NULL THEN 1 ELSE 0 END), 0)::int AS "waitlisted"
      FROM "Section" s
      JOIN "User" u
        ON u.id = s."instructorUserId"
      LEFT JOIN "FacultyProfile" fp
        ON fp."userId" = u.id
      JOIN "Course" c
        ON c.id = s."courseId"
      LEFT JOIN "Enrollment" e
        ON e."sectionId" = s.id
      WHERE s."instructorUserId" IS NOT NULL
        AND (${normalizedTermId}::text IS NULL OR s."termId" = ${normalizedTermId})
      GROUP BY
        u.id,
        fp."displayName",
        s."instructorName",
        u.email,
        s.id,
        s."sectionCode",
        c.code,
        c.title,
        s.capacity
      ORDER BY
        COALESCE(fp."displayName", s."instructorName", u.email) ASC,
        c.code ASC,
        s."sectionCode" ASC
    `);

    const sectionIds = sectionRows.map((row) => row.sectionId);
    const meetingTimes = sectionIds.length
      ? await this.prisma.meetingTime.findMany({
          where: { sectionId: { in: sectionIds } },
          select: {
            sectionId: true,
            weekday: true,
            startMinutes: true,
            endMinutes: true
          },
          orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }]
        })
      : [];

    const meetingTimesBySection = new Map<string, Array<{ weekday: number; startMinutes: number; endMinutes: number }>>();
    for (const meetingTime of meetingTimes) {
      const rows = meetingTimesBySection.get(meetingTime.sectionId) ?? [];
      rows.push({
        weekday: meetingTime.weekday,
        startMinutes: meetingTime.startMinutes,
        endMinutes: meetingTime.endMinutes
      });
      meetingTimesBySection.set(meetingTime.sectionId, rows);
    }

    const byInstructor = new Map<
      string,
      {
        instructorId: string;
        instructorName: string;
        email: string;
        totalSections: number;
        totalEnrolled: number;
        totalCapacity: number;
        sections: Array<{
          sectionId: string;
          sectionCode: string;
          courseCode: string;
          courseTitle: string;
          capacity: number;
          enrolled: number;
          waitlisted: number;
          meetingTimes: Array<{ weekday: number; startMinutes: number; endMinutes: number }>;
        }>;
      }
    >();

    for (const row of sectionRows) {
      const bucket = byInstructor.get(row.instructorId) ?? {
        instructorId: row.instructorId,
        instructorName: row.instructorName,
        email: row.email,
        totalSections: 0,
        totalEnrolled: 0,
        totalCapacity: 0,
        sections: []
      };
      bucket.totalSections += 1;
      bucket.totalEnrolled += toNum(row.enrolled);
      bucket.totalCapacity += toNum(row.capacity);
      bucket.sections.push({
        sectionId: row.sectionId,
        sectionCode: row.sectionCode,
        courseCode: row.courseCode,
        courseTitle: row.courseTitle,
        capacity: toNum(row.capacity),
        enrolled: toNum(row.enrolled),
        waitlisted: toNum(row.waitlisted),
        meetingTimes: meetingTimesBySection.get(row.sectionId) ?? []
      });
      byInstructor.set(row.instructorId, bucket);
    }

    return [...byInstructor.values()];
  }

async getCapacityPlan(termId?: string) {
    const normalizedTermId = termId?.trim() ? termId : null;
    const rows = await this.prisma.$queryRaw<
      Array<{
        sectionId: string;
        courseCode: string;
        courseTitle: string;
        sectionCode: string;
        capacity: number;
        enrolled: number;
        waitlisted: number;
        utilizationPct: number;
        projectedDemand: number;
      }>
    >(Prisma.sql`
      SELECT
        s.id AS "sectionId",
        c.code AS "courseCode",
        c.title AS "courseTitle",
        s."sectionCode" AS "sectionCode",
        s.capacity::int AS "capacity",
        COALESCE(SUM(CASE WHEN e.status = 'ENROLLED' AND e."deletedAt" IS NULL THEN 1 ELSE 0 END), 0)::int AS "enrolled",
        COALESCE(SUM(CASE WHEN e.status = 'WAITLISTED' AND e."deletedAt" IS NULL THEN 1 ELSE 0 END), 0)::int AS "waitlisted",
        CASE
          WHEN s.capacity > 0 THEN ROUND(
            (
              COALESCE(SUM(CASE WHEN e.status = 'ENROLLED' AND e."deletedAt" IS NULL THEN 1 ELSE 0 END), 0)::numeric
              / s.capacity::numeric
            ) * 100,
            1
          )
          ELSE 0
        END AS "utilizationPct",
        (
          COALESCE(SUM(CASE WHEN e.status = 'ENROLLED' AND e."deletedAt" IS NULL THEN 1 ELSE 0 END), 0)
          +
          COALESCE(SUM(CASE WHEN e.status = 'WAITLISTED' AND e."deletedAt" IS NULL THEN 1 ELSE 0 END), 0)
        )::int AS "projectedDemand"
      FROM "Section" s
      JOIN "Course" c
        ON c.id = s."courseId"
      LEFT JOIN "Enrollment" e
        ON e."sectionId" = s.id
      WHERE (${normalizedTermId}::text IS NULL OR s."termId" = ${normalizedTermId})
      GROUP BY s.id, c.code, c.title, s."sectionCode", s.capacity
      ORDER BY "utilizationPct" DESC, "projectedDemand" DESC, c.code ASC, s."sectionCode" ASC
    `);

    return rows.map((row) => ({
      sectionId: row.sectionId,
      courseCode: row.courseCode,
      courseTitle: row.courseTitle,
      sectionCode: row.sectionCode,
      capacity: toNum(row.capacity),
      enrolled: toNum(row.enrolled),
      waitlisted: toNum(row.waitlisted),
      utilizationPct: Number(row.utilizationPct),
      projectedDemand: Number(row.projectedDemand)
    }));
  }

async getStudentProgress(termId?: string, dept?: string) {
    const normalizedTermId = termId?.trim() ? termId : null;
    const normalizedDept = dept?.trim() ? dept : null;

    const rows = await this.prisma.$queryRaw<
      Array<{
        userId: string;
        name: string;
        email: string;
        dept: string;
        creditsCompleted: number;
        creditsEnrolled: number;
        gpa: number;
        enrollmentStatus: "Active" | "AtRisk" | "Inactive";
      }>
    >(Prisma.sql`
      WITH completed AS (
        SELECT
          e."studentId" AS "studentId",
          COALESCE(
            SUM(
              CASE
                WHEN e."finalGrade" IS NOT NULL AND LEFT(e."finalGrade", 1) NOT IN ('F', 'W')
                  THEN c.credits
                ELSE 0
              END
            ),
            0
          )::int AS "creditsCompleted",
          COALESCE(
            SUM(
              CASE e."finalGrade"
                WHEN 'A+' THEN 4.0 * c.credits
                WHEN 'A' THEN 4.0 * c.credits
                WHEN 'A-' THEN 3.7 * c.credits
                WHEN 'B+' THEN 3.3 * c.credits
                WHEN 'B' THEN 3.0 * c.credits
                WHEN 'B-' THEN 2.7 * c.credits
                WHEN 'C+' THEN 2.3 * c.credits
                WHEN 'C' THEN 2.0 * c.credits
                WHEN 'C-' THEN 1.7 * c.credits
                WHEN 'D+' THEN 1.3 * c.credits
                WHEN 'D' THEN 1.0 * c.credits
                WHEN 'D-' THEN 0.7 * c.credits
                WHEN 'F' THEN 0.0 * c.credits
                ELSE 0
              END
            ),
            0
          )::numeric AS "weightedPoints",
          COALESCE(
            SUM(
              CASE
                WHEN e."finalGrade" IN ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F')
                  THEN c.credits
                ELSE 0
              END
            ),
            0
          )::numeric AS "gradedCredits"
        FROM "Enrollment" e
        JOIN "Section" s
          ON s.id = e."sectionId"
        JOIN "Course" c
          ON c.id = s."courseId"
        WHERE e."deletedAt" IS NULL
          AND e.status = 'COMPLETED'
        GROUP BY e."studentId"
      ),
      enrolled AS (
        SELECT
          e."studentId" AS "studentId",
          COALESCE(SUM(c.credits), 0)::int AS "creditsEnrolled"
        FROM "Enrollment" e
        JOIN "Section" s
          ON s.id = e."sectionId"
        JOIN "Course" c
          ON c.id = s."courseId"
        WHERE e."deletedAt" IS NULL
          AND e.status = 'ENROLLED'
          AND (${normalizedTermId}::text IS NULL OR e."termId" = ${normalizedTermId})
        GROUP BY e."studentId"
      )
      SELECT
        u.id AS "userId",
        COALESCE(sp."legalName", u.email) AS "name",
        u.email AS "email",
        COALESCE(NULLIF(sp."programMajor", ''), 'Undeclared') AS "dept",
        COALESCE(completed."creditsCompleted", 0)::int AS "creditsCompleted",
        COALESCE(enrolled."creditsEnrolled", 0)::int AS "creditsEnrolled",
        CASE
          WHEN COALESCE(completed."gradedCredits", 0) > 0
            THEN ROUND((completed."weightedPoints" / completed."gradedCredits")::numeric, 2)
          ELSE 0
        END::numeric AS "gpa",
        CASE
          WHEN (
            CASE
              WHEN COALESCE(completed."gradedCredits", 0) > 0
                THEN ROUND((completed."weightedPoints" / completed."gradedCredits")::numeric, 2)
              ELSE 0
            END
          ) < 2.0
            OR (COALESCE(completed."creditsCompleted", 0) < 30 AND COALESCE(enrolled."creditsEnrolled", 0) = 0)
            THEN 'AtRisk'
          WHEN COALESCE(enrolled."creditsEnrolled", 0) = 0
            THEN 'Inactive'
          ELSE 'Active'
        END AS "enrollmentStatus"
      FROM "User" u
      JOIN "StudentProfile" sp
        ON sp."userId" = u.id
      LEFT JOIN completed
        ON completed."studentId" = u.id
      LEFT JOIN enrolled
        ON enrolled."studentId" = u.id
      WHERE u.role = 'STUDENT'
        AND u."deletedAt" IS NULL
        AND (${normalizedDept}::text IS NULL OR sp."programMajor" = ${normalizedDept})
      ORDER BY
        CASE
          WHEN (
            CASE
              WHEN COALESCE(completed."gradedCredits", 0) > 0
                THEN ROUND((completed."weightedPoints" / completed."gradedCredits")::numeric, 2)
              ELSE 0
            END
          ) < 2.0
            OR (COALESCE(completed."creditsCompleted", 0) < 30 AND COALESCE(enrolled."creditsEnrolled", 0) = 0)
            THEN 0
          WHEN COALESCE(enrolled."creditsEnrolled", 0) = 0
            THEN 1
          ELSE 2
        END,
        "gpa" ASC,
        "name" ASC
    `);

    return rows.map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      dept: row.dept,
      creditsCompleted: Number(row.creditsCompleted),
      creditsEnrolled: Number(row.creditsEnrolled),
      gpa: Number(row.gpa),
      enrollmentStatus: row.enrollmentStatus
    }));
  }

async getGradeDistribution(termId?: string, courseId?: string) {
    const normalizedTermId = termId?.trim() ? termId : null;
    const normalizedCourseId = courseId?.trim() ? courseId : null;

    if (!normalizedTermId || !normalizedCourseId) {
      return {
        courseCode: "",
        courseTitle: "",
        termName: "",
        gradeBreakdown: [] as Array<{ grade: string; count: number }>,
        meanGpa: 0,
        passRate: 0
      };
    }

    const breakdown = await this.prisma.$queryRaw<Array<{ grade: string; count: number }>>(Prisma.sql`
      SELECT
        COALESCE(e."finalGrade", 'N/A') AS "grade",
        COUNT(*)::int AS "count"
      FROM "Enrollment" e
      JOIN "Section" s
        ON s.id = e."sectionId"
      WHERE e."deletedAt" IS NULL
        AND e.status = 'COMPLETED'
        AND e."termId" = ${normalizedTermId}
        AND s."courseId" = ${normalizedCourseId}
        AND e."finalGrade" IS NOT NULL
      GROUP BY COALESCE(e."finalGrade", 'N/A')
    `);

    const summary = await this.prisma.$queryRaw<
      Array<{
        courseCode: string;
        courseTitle: string;
        termName: string;
        meanGpa: number;
        passRate: number;
      }>
    >(Prisma.sql`
      SELECT
        c.code AS "courseCode",
        c.title AS "courseTitle",
        t.name AS "termName",
        COALESCE(
          ROUND(AVG(
            CASE e."finalGrade"
              WHEN 'A+' THEN 4.0
              WHEN 'A' THEN 4.0
              WHEN 'A-' THEN 3.7
              WHEN 'B+' THEN 3.3
              WHEN 'B' THEN 3.0
              WHEN 'B-' THEN 2.7
              WHEN 'C+' THEN 2.3
              WHEN 'C' THEN 2.0
              WHEN 'C-' THEN 1.7
              WHEN 'D+' THEN 1.3
              WHEN 'D' THEN 1.0
              WHEN 'D-' THEN 0.7
              WHEN 'F' THEN 0.0
              ELSE NULL
            END
          )::numeric, 2),
          0
        )::numeric AS "meanGpa",
        COALESCE(
          ROUND(
            (
              SUM(
                CASE
                  WHEN e."finalGrade" IS NOT NULL AND LEFT(e."finalGrade", 1) NOT IN ('F', 'W') THEN 1
                  ELSE 0
                END
              )::numeric
              / NULLIF(COUNT(*), 0)::numeric
            ) * 100,
            1
          ),
          0
        )::numeric AS "passRate"
      FROM "Enrollment" e
      JOIN "Section" s
        ON s.id = e."sectionId"
      JOIN "Course" c
        ON c.id = s."courseId"
      JOIN "Term" t
        ON t.id = e."termId"
      WHERE e."deletedAt" IS NULL
        AND e.status = 'COMPLETED'
        AND e."termId" = ${normalizedTermId}
        AND s."courseId" = ${normalizedCourseId}
        AND e."finalGrade" IS NOT NULL
      GROUP BY c.code, c.title, t.name
    `);

    const orderedGrades = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "W"];
    const counts = new Map(breakdown.map((row) => [row.grade, toNum(row.count)]));

    return {
      courseCode: summary[0]?.courseCode ?? "",
      courseTitle: summary[0]?.courseTitle ?? "",
      termName: summary[0]?.termName ?? "",
      gradeBreakdown: orderedGrades
        .map((grade) => ({
          grade,
          count: counts.get(grade) ?? 0
        }))
        .filter((row) => row.count > 0),
      meanGpa: Number(summary[0]?.meanGpa ?? 0),
      passRate: Number(summary[0]?.passRate ?? 0)
    };
  }

async getDropoutRisk() {
    const rows = await this.prisma.$queryRaw<
      Array<{
        userId: string;
        name: string;
        email: string;
        programMajor: string;
        dropCount: number;
        gpa: number;
        enrolledCredits: number;
        riskScore: number;
      }>
    >(Prisma.sql`
      WITH dropped AS (
        SELECT
          e."studentId" AS "studentId",
          COUNT(*)::int AS "dropCount"
        FROM "Enrollment" e
        WHERE e."deletedAt" IS NULL
          AND (e.status = 'DROPPED' OR e."finalGrade" = 'W')
        GROUP BY e."studentId"
      ),
      completed AS (
        SELECT
          e."studentId" AS "studentId",
          COALESCE(
            SUM(
              CASE e."finalGrade"
                WHEN 'A+' THEN 4.0 * s.credits
                WHEN 'A' THEN 4.0 * s.credits
                WHEN 'A-' THEN 3.7 * s.credits
                WHEN 'B+' THEN 3.3 * s.credits
                WHEN 'B' THEN 3.0 * s.credits
                WHEN 'B-' THEN 2.7 * s.credits
                WHEN 'C+' THEN 2.3 * s.credits
                WHEN 'C' THEN 2.0 * s.credits
                WHEN 'C-' THEN 1.7 * s.credits
                WHEN 'D+' THEN 1.3 * s.credits
                WHEN 'D' THEN 1.0 * s.credits
                WHEN 'D-' THEN 0.7 * s.credits
                WHEN 'F' THEN 0.0 * s.credits
                ELSE 0
              END
            ),
            0
          )::numeric AS "weightedPoints",
          COALESCE(
            SUM(
              CASE
                WHEN e."finalGrade" IN ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F')
                  THEN s.credits
                ELSE 0
              END
            ),
            0
          )::numeric AS "gradedCredits"
        FROM "Enrollment" e
        JOIN "Section" s
          ON s.id = e."sectionId"
        WHERE e."deletedAt" IS NULL
          AND e.status = 'COMPLETED'
        GROUP BY e."studentId"
      ),
      enrolled AS (
        SELECT
          e."studentId" AS "studentId",
          COALESCE(SUM(s.credits), 0)::int AS "enrolledCredits"
        FROM "Enrollment" e
        JOIN "Section" s
          ON s.id = e."sectionId"
        WHERE e."deletedAt" IS NULL
          AND e.status = 'ENROLLED'
        GROUP BY e."studentId"
      )
      SELECT
        u.id AS "userId",
        COALESCE(sp."legalName", u.email) AS "name",
        u.email AS "email",
        COALESCE(NULLIF(sp."programMajor", ''), 'Undeclared') AS "programMajor",
        COALESCE(dropped."dropCount", 0)::int AS "dropCount",
        CASE
          WHEN COALESCE(completed."gradedCredits", 0) > 0
            THEN ROUND((completed."weightedPoints" / completed."gradedCredits")::numeric, 2)
          ELSE 0
        END::numeric AS "gpa",
        COALESCE(enrolled."enrolledCredits", 0)::int AS "enrolledCredits",
        LEAST(
          100,
          COALESCE(dropped."dropCount", 0) * 30
          + CASE
              WHEN (
                CASE
                  WHEN COALESCE(completed."gradedCredits", 0) > 0
                    THEN ROUND((completed."weightedPoints" / completed."gradedCredits")::numeric, 2)
                  ELSE 0
                END
              ) < 2.0 THEN 40 ELSE 0
            END
          + CASE WHEN COALESCE(enrolled."enrolledCredits", 0) = 0 THEN 30 ELSE 0 END
        )::int AS "riskScore"
      FROM "User" u
      JOIN "StudentProfile" sp
        ON sp."userId" = u.id
      LEFT JOIN dropped
        ON dropped."studentId" = u.id
      LEFT JOIN completed
        ON completed."studentId" = u.id
      LEFT JOIN enrolled
        ON enrolled."studentId" = u.id
      WHERE u.role = 'STUDENT'
        AND u."deletedAt" IS NULL
      ORDER BY "riskScore" DESC, "gpa" ASC, "name" ASC
    `);

    return rows
      .map((row) => ({
        userId: row.userId,
        name: row.name,
        email: row.email,
        programMajor: row.programMajor,
        dropCount: Number(row.dropCount),
        gpa: Number(row.gpa),
        enrolledCredits: Number(row.enrolledCredits),
        riskScore: Number(row.riskScore)
      }))
      .filter((row) => row.riskScore >= 30);
  }

async getSectionAnalytics(sectionId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: {
        course: true,
        term: true,
        enrollments: {
          where: { deletedAt: null },
          select: {
            status: true,
            finalGrade: true
          }
        }
      }
    });

    if (!section) {
      throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "教学班不存在" });
    }

    const gradeRows = await this.prisma.$queryRaw<Array<{ grade: string; count: number }>>(Prisma.sql`
      SELECT
        e."finalGrade" AS "grade",
        COUNT(*)::int AS "count"
      FROM "Enrollment" e
      WHERE e."deletedAt" IS NULL
        AND e.status = 'COMPLETED'
        AND e."sectionId" = ${sectionId}
        AND e."finalGrade" IS NOT NULL
      GROUP BY e."finalGrade"
    `);

    const summaryRows = await this.prisma.$queryRaw<Array<{ avgGpa: number }>>(Prisma.sql`
      SELECT
        COALESCE(
          ROUND(AVG(
            CASE e."finalGrade"
              WHEN 'A+' THEN 4.0
              WHEN 'A' THEN 4.0
              WHEN 'A-' THEN 3.7
              WHEN 'B+' THEN 3.3
              WHEN 'B' THEN 3.0
              WHEN 'B-' THEN 2.7
              WHEN 'C+' THEN 2.3
              WHEN 'C' THEN 2.0
              WHEN 'C-' THEN 1.7
              WHEN 'D+' THEN 1.3
              WHEN 'D' THEN 1.0
              WHEN 'D-' THEN 0.7
              WHEN 'F' THEN 0.0
              ELSE NULL
            END
          )::numeric, 2),
          0
        )::numeric AS "avgGpa"
      FROM "Enrollment" e
      WHERE e."deletedAt" IS NULL
        AND e.status = 'COMPLETED'
        AND e."sectionId" = ${sectionId}
        AND e."finalGrade" IS NOT NULL
    `);

    const timeline = await this.getSectionEnrollmentTimeline(sectionId);
    const enrolled = section.enrollments.filter((item) => item.status === "ENROLLED").length;
    const waitlisted = section.enrollments.filter((item) => item.status === "WAITLISTED").length;
    const dropCount = section.enrollments.filter((item) => item.status === "DROPPED" || item.finalGrade === "W").length;
    const orderedGrades = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "W"];
    const counts = new Map(gradeRows.map((row) => [row.grade, toNum(row.count)]));

    return {
      sectionId: section.id,
      sectionCode: section.sectionCode,
      courseCode: section.course.code,
      courseTitle: section.course.title,
      termName: section.term.name,
      capacity: section.capacity,
      enrolled,
      waitlisted,
      dropCount,
      avgGpa: Number(summaryRows[0]?.avgGpa ?? 0),
      gradeBreakdown: orderedGrades
        .map((grade) => ({
          grade,
          count: counts.get(grade) ?? 0
        }))
        .filter((row) => row.count > 0),
      enrollmentTimeline: timeline.points
    };
  }

// ─── Course Demand Comparison (cross-term) ──────────────────────────────────
  async getCourseDemandComparison(courseId?: string) {
    // Returns per-term enrollment counts for each course (or a specific course)
    const courseFilter = courseId ? Prisma.sql`AND c.id = ${courseId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<{
      courseId: string;
      courseCode: string;
      courseTitle: string;
      credits: number;
      termId: string;
      termName: string;
      termStart: Date;
      enrolled: bigint;
      completed: bigint;
      dropped: bigint;
      waitlisted: bigint;
      capacity: bigint;
    }[]>`
      SELECT
        c.id AS "courseId",
        c.code AS "courseCode",
        c.title AS "courseTitle",
        c.credits,
        t.id AS "termId",
        t.name AS "termName",
        t."startDate" AS "termStart",
        COUNT(CASE WHEN e.status = 'ENROLLED' THEN 1 END) AS "enrolled",
        COUNT(CASE WHEN e.status = 'COMPLETED' THEN 1 END) AS "completed",
        COUNT(CASE WHEN e.status = 'DROPPED' THEN 1 END) AS "dropped",
        COUNT(CASE WHEN e.status = 'WAITLISTED' THEN 1 END) AS "waitlisted",
        COALESCE(SUM(s.capacity), 0) AS "capacity"
      FROM "Course" c
      JOIN "Section" s ON s."courseId" = c.id
      JOIN "Term" t ON t.id = s."termId"
      LEFT JOIN "Enrollment" e ON e."sectionId" = s.id AND e."deletedAt" IS NULL
      WHERE c."deletedAt" IS NULL
        ${courseFilter}
      GROUP BY c.id, c.code, c.title, c.credits, t.id, t.name, t."startDate"
      ORDER BY c.code ASC, t."startDate" ASC
    `;

    // Group by course
    const courseMap = new Map<string, {
      courseId: string; courseCode: string; courseTitle: string; credits: number;
      terms: { termId: string; termName: string; enrolled: number; completed: number; dropped: number; waitlisted: number; capacity: number; total: number }[];
    }>();

    for (const r of rows) {
      if (!courseMap.has(r.courseId)) {
        courseMap.set(r.courseId, { courseId: r.courseId, courseCode: r.courseCode, courseTitle: r.courseTitle, credits: r.credits, terms: [] });
      }
      const total = toNum(r.enrolled) + toNum(r.completed) + toNum(r.dropped) + toNum(r.waitlisted);
      courseMap.get(r.courseId)!.terms.push({
        termId: r.termId, termName: r.termName,
        enrolled: toNum(r.enrolled), completed: toNum(r.completed),
        dropped: toNum(r.dropped), waitlisted: toNum(r.waitlisted),
        capacity: toNum(r.capacity), total,
      });
    }

    return Array.from(courseMap.values());
  }

// ─── Student Academic Standing (for admin) ───────────────────────────────────
  async getStudentAcademicStanding(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        studentProfile: true,
        enrollments: {
          where: { deletedAt: null },
          include: {
            section: {
              include: {
                course: { select: { code: true, title: true, credits: true } },
                term: { select: { id: true, name: true } }
              }
            }
          },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!user) throw new Error("Student not found");

    const completed = user.enrollments.filter((e) => e.status === "COMPLETED" && e.finalGrade);
    const graded = completed.filter((e) => GRADE_POINTS[e.finalGrade!] !== undefined);
    const totalCredits = completed.reduce((s, e) => s + e.section.course.credits, 0);
    const totalPoints = graded.reduce((s, e) => s + (GRADE_POINTS[e.finalGrade!] ?? 0) * e.section.course.credits, 0);
    const totalGradedCredits = graded.reduce((s, e) => s + e.section.course.credits, 0);
    const cumulativeGpa = totalGradedCredits > 0 ? Math.round((totalPoints / totalGradedCredits) * 100) / 100 : null;

    const standing =
      !cumulativeGpa ? "UNKNOWN" :
      cumulativeGpa >= 3.5 ? "DEAN_LIST" :
      cumulativeGpa >= 2.0 ? "GOOD_STANDING" :
      cumulativeGpa >= 1.5 ? "ACADEMIC_PROBATION" : "ACADEMIC_SUSPENSION";

    // Term-by-term GPA
    const termMap = new Map<string, { termName: string; credits: number; points: number; gradedCredits: number; courses: number }>();
    for (const e of completed) {
      const tid = e.section.term.id;
      if (!termMap.has(tid)) termMap.set(tid, { termName: e.section.term.name, credits: 0, points: 0, gradedCredits: 0, courses: 0 });
      const t = termMap.get(tid)!;
      t.credits += e.section.course.credits;
      t.courses++;
      const pts = GRADE_POINTS[e.finalGrade!];
      if (pts !== undefined) { t.points += pts * e.section.course.credits; t.gradedCredits += e.section.course.credits; }
    }

    const termHistory = Array.from(termMap.entries()).map(([, t]) => ({
      termName: t.termName,
      credits: t.credits,
      courses: t.courses,
      termGpa: t.gradedCredits > 0 ? Math.round((t.points / t.gradedCredits) * 100) / 100 : null,
    }));

    return {
      userId: user.id,
      name: user.email,
      email: user.email,
      major: user.studentProfile?.programMajor ?? null,
      enrollmentStatus: user.studentProfile?.enrollmentStatus ?? null,
      cumulativeGpa,
      totalCredits,
      standing,
      termHistory,
    };
  }

// ─── Section Swap Tool ───────────────────────────────────────────────────────
  async previewSectionSwap(enrollmentId: string, targetSectionId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        student: { select: { id: true, email: true } },
        section: {
          include: {
            course: { select: { id: true, code: true, title: true, credits: true } },
            term: { select: { id: true, name: true } },
          }
        }
      }
    });
    if (!enrollment) throw new Error("Enrollment not found");

    const targetSection = await this.prisma.section.findUnique({
      where: { id: targetSectionId },
      include: {
        course: { select: { id: true, code: true, title: true, credits: true } },
        term: { select: { id: true, name: true } },
        enrollments: { where: { status: "ENROLLED", deletedAt: null }, select: { id: true } }
      }
    });
    if (!targetSection) throw new Error("Target section not found");

    const targetEnrolled = targetSection.enrollments.length;
    const targetAvailable = targetSection.capacity - targetEnrolled;
    const sameCourse = enrollment.section.course.id === targetSection.course.id;

    return {
      enrollment: { id: enrollmentId, status: enrollment.status },
      student: { id: enrollment.student.id, name: enrollment.student.email, email: enrollment.student.email },
      fromSection: {
        id: enrollment.section.id,
        sectionCode: enrollment.section.sectionCode,
        courseCode: enrollment.section.course.code,
        courseTitle: enrollment.section.course.title,
        termName: enrollment.section.term.name,
        termId: enrollment.section.term.id,
      },
      toSection: {
        id: targetSection.id,
        sectionCode: targetSection.sectionCode,
        courseCode: targetSection.course.code,
        courseTitle: targetSection.course.title,
        termName: targetSection.term.name,
        capacity: targetSection.capacity,
        enrolled: targetEnrolled,
        available: targetAvailable,
        termId: targetSection.term.id,
      },
      warnings: [
        ...(!sameCourse ? ["⚠️ 目标班级属于不同课程"] : []),
        ...(targetAvailable <= 0 ? ["⚠️ 目标班级已满员，将加入候补"] : []),
        ...(enrollment.section.term.id !== targetSection.term.id ? ["⚠️ 目标班级属于不同学期"] : []),
      ],
      canSwap: true,
    };
  }

async executeSectionSwap(enrollmentId: string, targetSectionId: string, adminUserId: string) {
    const preview = await this.previewSectionSwap(enrollmentId, targetSectionId);
    const targetEnrolled = preview.toSection.enrolled;
    const newStatus = targetEnrolled >= preview.toSection.capacity ? "WAITLISTED" : "ENROLLED";

    const updated = await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { sectionId: targetSectionId, status: newStatus as import("@prisma/client").EnrollmentStatus }
    });

    await this.prisma.auditLog.create({
      data: {
        action: "ADMIN_SECTION_SWAP",
        entityType: "Enrollment",
        entityId: enrollmentId,
        actorUserId: adminUserId,
        metadata: { fromSection: preview.fromSection.id, toSection: targetSectionId, newStatus }
      }
    });

    return { success: true, newStatus, enrollmentId: updated.id };
  }

// ─── Cohort By Major Analytics ───────────────────────────────────────────────
  async getCohortByMajor(termId?: string) {
    const termFilter = termId ? Prisma.sql`AND s."termId" = ${termId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<{
      major: string;
      studentCount: bigint;
      avgGpa: string;
      totalCredits: bigint;
      activeCount: bigint;
      completedCount: bigint;
    }[]>`
      SELECT
        COALESCE(sp."programMajor", '未分配') AS "major",
        COUNT(DISTINCT u.id) AS "studentCount",
        ROUND(AVG(CASE
          WHEN e.status = 'COMPLETED' AND e."finalGrade" IS NOT NULL THEN
            CASE e."finalGrade"
              WHEN 'A+' THEN 4.0 WHEN 'A' THEN 4.0 WHEN 'A-' THEN 3.7
              WHEN 'B+' THEN 3.3 WHEN 'B' THEN 3.0 WHEN 'B-' THEN 2.7
              WHEN 'C+' THEN 2.3 WHEN 'C' THEN 2.0 WHEN 'C-' THEN 1.7
              WHEN 'D+' THEN 1.3 WHEN 'D' THEN 1.0 WHEN 'D-' THEN 0.7
              ELSE 0
            END
        END)::numeric, 2) AS "avgGpa",
        COALESCE(SUM(CASE WHEN e.status = 'COMPLETED' THEN c.credits ELSE 0 END), 0) AS "totalCredits",
        COUNT(DISTINCT CASE WHEN e.status = 'ENROLLED' THEN u.id END) AS "activeCount",
        COUNT(DISTINCT CASE WHEN e.status = 'COMPLETED' THEN u.id END) AS "completedCount"
      FROM "User" u
      JOIN "StudentProfile" sp ON sp."userId" = u.id
      LEFT JOIN "Enrollment" e ON e."studentId" = u.id AND e."deletedAt" IS NULL
      LEFT JOIN "Section" s ON s.id = e."sectionId"
      LEFT JOIN "Course" c ON c.id = s."courseId"
      WHERE u.role = 'STUDENT'
        ${termFilter}
      GROUP BY COALESCE(sp."programMajor", '未分配')
      ORDER BY "studentCount" DESC
    `;

    return rows.map((r) => ({
      major: r.major,
      studentCount: toNum(r.studentCount),
      avgGpa: Number(r.avgGpa ?? 0),
      totalCredits: toNum(r.totalCredits),
      activeCount: toNum(r.activeCount),
      completedCount: toNum(r.completedCount),
    }));
  }

// ─── Term Enrollment Forecast ────────────────────────────────────────────────
  async getTermEnrollmentForecast() {
    // Pull enrollment counts per term to show historical + simple linear trend
    const rows = await this.prisma.$queryRaw<{
      termId: string;
      termName: string;
      startDate: Date;
      enrolled: bigint;
      completed: bigint;
      dropped: bigint;
      waitlisted: bigint;
    }[]>`
      SELECT
        t.id AS "termId",
        t.name AS "termName",
        t."startDate",
        COUNT(CASE WHEN e.status = 'ENROLLED' THEN 1 END) AS "enrolled",
        COUNT(CASE WHEN e.status = 'COMPLETED' THEN 1 END) AS "completed",
        COUNT(CASE WHEN e.status = 'DROPPED' THEN 1 END) AS "dropped",
        COUNT(CASE WHEN e.status = 'WAITLISTED' THEN 1 END) AS "waitlisted"
      FROM "Term" t
      LEFT JOIN "Section" s ON s."termId" = t.id
      LEFT JOIN "Enrollment" e ON e."sectionId" = s.id AND e."deletedAt" IS NULL
      GROUP BY t.id, t.name, t."startDate"
      ORDER BY t."startDate" ASC
    `;

    const terms = rows.map((r) => ({
      termId: r.termId,
      termName: r.termName,
      startDate: r.startDate.toISOString().slice(0, 10),
      enrolled: toNum(r.enrolled),
      completed: toNum(r.completed),
      dropped: toNum(r.dropped),
      waitlisted: toNum(r.waitlisted),
      total: toNum(r.enrolled) + toNum(r.completed) + toNum(r.dropped) + toNum(r.waitlisted),
    }));

    // Simple linear regression on total enrollments
    if (terms.length < 2) return { terms, forecast: null };
    const n = terms.length;
    const xs = terms.map((_, i) => i);
    const ys = terms.map((t) => t.total);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    const slope = xs.reduce((s, x, i) => s + (x - meanX) * (ys[i] - meanY), 0) /
      xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
    const intercept = meanY - slope * meanX;
    const forecast = Math.round(intercept + slope * n);
    const trend = slope > 0 ? "up" : slope < 0 ? "down" : "flat";

    return { terms, forecast: { value: Math.max(0, forecast), trend, slope: Math.round(slope * 10) / 10 } };
  }

// ─── Enrollment Audit Report ─────────────────────────────────────────────────
  async getEnrollmentAudit(termId?: string, status?: string) {
    const where: Prisma.EnrollmentWhereInput = { deletedAt: null };
    if (status) {
      where.status = status as EnrollmentStatus;
    }
    if (termId) {
      where.section = { termId };
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where,
      select: {
        id: true,
        status: true,
        finalGrade: true,
        createdAt: true,
        droppedAt: true,
        student: {
          select: {
            email: true,
            studentId: true
          }
        },
        section: {
          select: {
            sectionCode: true,
            course: {
              select: {
                code: true,
                title: true
              }
            },
            term: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 500
    });

    const rows = enrollments.map((enrollment) => ({
      enrollmentId: enrollment.id,
      studentEmail: enrollment.student.email,
      studentId: enrollment.student.studentId ?? "—",
      courseCode: enrollment.section.course.code,
      courseTitle: enrollment.section.course.title,
      sectionCode: enrollment.section.sectionCode,
      termName: enrollment.section.term.name,
      status: enrollment.status,
      finalGrade: enrollment.finalGrade,
      enrolledAt: enrollment.createdAt,
      droppedAt: enrollment.droppedAt
    }));

    const summary = {
      total: rows.length,
      enrolled: rows.filter((r) => r.status === "ENROLLED").length,
      completed: rows.filter((r) => r.status === "COMPLETED").length,
      dropped: rows.filter((r) => r.status === "DROPPED").length,
      waitlisted: rows.filter((r) => r.status === "WAITLISTED").length,
    };

    return {
      summary,
      rows: rows.map((r) => ({
        ...r,
        enrolledAt: r.enrolledAt.toISOString().slice(0, 10),
        droppedAt: r.droppedAt?.toISOString().slice(0, 10) ?? null,
      })),
    };
  }

// ─── Top Performers Report ────────────────────────────────────────────────────
  async getTopPerformers(termId?: string, limit = 20) {
    const termFilter = termId ? Prisma.sql`AND s."termId" = ${termId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<{
      studentId: string;
      email: string;
      major: string | null;
      totalCredits: bigint;
      gpa: string;
      completedCourses: bigint;
    }[]>`
      SELECT
        u.id AS "studentId",
        u.email,
        sp."programMajor" AS "major",
        SUM(c.credits) AS "totalCredits",
        ROUND(
          SUM(
            CASE e."finalGrade"
              WHEN 'A+' THEN 4.0 WHEN 'A' THEN 4.0 WHEN 'A-' THEN 3.7
              WHEN 'B+' THEN 3.3 WHEN 'B' THEN 3.0 WHEN 'B-' THEN 2.7
              WHEN 'C+' THEN 2.3 WHEN 'C' THEN 2.0 WHEN 'C-' THEN 1.7
              WHEN 'D+' THEN 1.3 WHEN 'D' THEN 1.0 WHEN 'D-' THEN 0.7
              ELSE 0
            END * c.credits
          ) / NULLIF(SUM(c.credits), 0)::numeric, 2
        ) AS "gpa",
        COUNT(*) AS "completedCourses"
      FROM "Enrollment" e
      JOIN "User" u ON u.id = e."studentId"
      LEFT JOIN "StudentProfile" sp ON sp."userId" = u.id
      JOIN "Section" s ON s.id = e."sectionId"
      JOIN "Course" c ON c.id = s."courseId"
      WHERE e."deletedAt" IS NULL
        AND e.status = 'COMPLETED'
        AND e."finalGrade" IS NOT NULL
        AND e."finalGrade" NOT IN ('W', 'F')
        ${termFilter}
      GROUP BY u.id, u.email, sp."programMajor"
      HAVING COUNT(*) >= 1
      ORDER BY "gpa" DESC, "totalCredits" DESC
      LIMIT ${limit}
    `;

    return rows.map((r, i) => ({
      rank: i + 1,
      studentId: r.studentId,
      email: r.email,
      major: r.major ?? "未分配",
      totalCredits: toNum(r.totalCredits),
      gpa: Number(r.gpa ?? 0),
      completedCourses: toNum(r.completedCourses),
    }));
  }

// ─── Department Workload Overview ─────────────────────────────────────────────
  async getDeptWorkload(termId?: string) {
    const termFilter = termId ? Prisma.sql`AND t.id = ${termId}` : Prisma.sql``;
    // Instead group by course category prefix (first 2-4 chars of code)
    const rowsByPrefix = await this.prisma.$queryRaw<{
      prefix: string;
      instructorCount: bigint;
      sectionCount: bigint;
      totalCapacity: bigint;
      totalEnrolled: bigint;
    }[]>`
      SELECT
        SUBSTRING(c.code FROM 1 FOR 4) AS "prefix",
        COUNT(DISTINCT COALESCE(s."instructorUserId", s."instructorName")) AS "instructorCount",
        COUNT(DISTINCT s.id) AS "sectionCount",
        COALESCE(SUM(s.capacity), 0) AS "totalCapacity",
        COUNT(CASE WHEN e.status = 'ENROLLED' AND e."deletedAt" IS NULL THEN 1 END) AS "totalEnrolled"
      FROM "Section" s
      JOIN "Term" t ON t.id = s."termId"
      JOIN "Course" c ON c.id = s."courseId"
      LEFT JOIN "Enrollment" e ON e."sectionId" = s.id
      WHERE c."deletedAt" IS NULL
        ${termFilter}
      GROUP BY SUBSTRING(c.code FROM 1 FOR 4)
      ORDER BY "sectionCount" DESC
    `;

    return rowsByPrefix.map((r) => ({
      prefix: r.prefix,
      instructorCount: toNum(r.instructorCount),
      sectionCount: toNum(r.sectionCount),
      totalCapacity: toNum(r.totalCapacity),
      totalEnrolled: toNum(r.totalEnrolled),
      utilization: toNum(r.totalCapacity) > 0 ? Math.round((toNum(r.totalEnrolled) / toNum(r.totalCapacity)) * 100) : 0,
    }));
  }

// ─── Enrollment Velocity ──────────────────────────────────────────────────────
  async getEnrollmentVelocity(termId?: string) {
    // Shows day-by-day enrollment count within a term (based on createdAt)
    const termFilter = termId ? Prisma.sql`AND s."termId" = ${termId}` : Prisma.sql``;
    const rows = await this.prisma.$queryRaw<{
      day: Date;
      newEnrollments: bigint;
      newDrops: bigint;
      cumulative: bigint;
    }[]>`
      WITH daily AS (
        SELECT
          DATE(e."createdAt") AS "day",
          COUNT(CASE WHEN e.status IN ('ENROLLED', 'WAITLISTED') THEN 1 END) AS "newEnrollments",
          COUNT(CASE WHEN e.status = 'DROPPED' THEN 1 END) AS "newDrops"
        FROM "Enrollment" e
        JOIN "Section" s ON s.id = e."sectionId"
        WHERE e."deletedAt" IS NULL
          ${termFilter}
        GROUP BY DATE(e."createdAt")
        ORDER BY DATE(e."createdAt") ASC
      )
      SELECT
        "day",
        "newEnrollments",
        "newDrops",
        SUM("newEnrollments" - "newDrops") OVER (ORDER BY "day" ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "cumulative"
      FROM daily
      ORDER BY "day" ASC
    `;

    const points = rows.map((r) => ({
      date: r.day.toISOString().slice(0, 10),
      newEnrollments: toNum(r.newEnrollments),
      newDrops: toNum(r.newDrops),
      cumulative: toNum(r.cumulative),
      net: toNum(r.newEnrollments) - toNum(r.newDrops),
    }));

    const totalNew = points.reduce((s, p) => s + p.newEnrollments, 0);
    const totalDrops = points.reduce((s, p) => s + p.newDrops, 0);
    const peakDay = points.reduce((best, p) => p.newEnrollments > best.newEnrollments ? p : best, { date: "", newEnrollments: 0, newDrops: 0, cumulative: 0, net: 0 });

    return { points, summary: { totalNew, totalDrops, peakDay: peakDay.date, peakCount: peakDay.newEnrollments } };
  }

// ─── Prerequisite Map ─────────────────────────────────────────────────────────
  async getPrereqMap() {
    const courses = await this.prisma.course.findMany({
      where: { deletedAt: null },
      select: {
        id: true, code: true, title: true, credits: true,
        prerequisiteLinks: {
          select: {
            prerequisiteCourse: { select: { id: true, code: true, title: true } }
          }
        }
      },
      orderBy: { code: "asc" }
    });

    // prerequisiteLinks[].prerequisiteCourse is the actual prerequisite course
    const nodes = courses.map((c) => ({ id: c.id, code: c.code, title: c.title, credits: c.credits, prereqCount: c.prerequisiteLinks.length }));
    const edges = courses.flatMap((c) => c.prerequisiteLinks.map((link) => ({
      from: link.prerequisiteCourse.id, to: c.id,
      fromCode: link.prerequisiteCourse.code, toCode: c.code
    })));
    const inDegreeMap = new Map<string, number>();
    for (const c of courses) inDegreeMap.set(c.id, 0);
    for (const e of edges) inDegreeMap.set(e.to, (inDegreeMap.get(e.to) ?? 0) + 1);

    return {
      nodes: nodes.map((n) => ({ ...n, inDegree: inDegreeMap.get(n.id) ?? 0 })),
      edges,
      summary: {
        totalCourses: courses.length,
        coursesWithPrereqs: courses.filter((c) => c.prerequisiteLinks.length > 0).length,
        totalPrereqRelations: edges.length,
      }
    };
  }

// ─── Section Roster Export ─────────────────────────────────────────────────
  async getSectionRoster(sectionId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      select: {
        id: true,
        credits: true,
        capacity: true,
        instructorName: true,
        course: { select: { code: true, title: true, credits: true } },
        term: { select: { name: true } },
        instructorUser: { select: { email: true } },
        enrollments: {
          where: { deletedAt: null },
          select: {
            id: true,
            status: true,
            finalGrade: true,
            createdAt: true,
            student: { select: { email: true, studentProfile: { select: { legalName: true } } } }
          },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!section) throw new Error("Section not found");

    const rows = section.enrollments.map((e, idx) => ({
      no: idx + 1,
      email: e.student.email,
      name: e.student.studentProfile?.legalName ?? e.student.email,
      status: e.status,
      finalGrade: e.finalGrade ?? "—",
      enrolledAt: e.createdAt.toISOString().slice(0, 10),
    }));

    const graded = rows.filter((r) => r.finalGrade !== "—");
    const avgGpa = graded.length > 0
      ? Math.round((graded.reduce((s, r) => s + (GRADE_POINTS[r.finalGrade] ?? 0), 0) / graded.length) * 100) / 100
      : null;

    return {
      sectionId: section.id,
      courseCode: section.course.code,
      courseTitle: section.course.title,
      credits: section.course.credits,
      termName: section.term.name,
      instructorEmail: section.instructorUser?.email ?? section.instructorName ?? "—",
      capacity: section.capacity,
      enrolled: rows.filter((r) => r.status === "ENROLLED").length,
      completed: rows.filter((r) => r.status === "COMPLETED").length,
      dropped: rows.filter((r) => r.status === "DROPPED").length,
      avgGpa,
      roster: rows,
    };
  }

// ─── Term Capacity Summary ─────────────────────────────────────────────────
  async getTermCapacitySummary(termId?: string) {
    const termFilter = termId ? Prisma.sql`AND s."termId" = ${termId}` : Prisma.sql``;
    type CapRow = {
      termId: string; termName: string; courseCode: string; courseTitle: string;
      sectionId: string; capacity: bigint; enrolled: bigint; completed: bigint;
      dropped: bigint; waitlisted: bigint;
    };
    const rows = await this.prisma.$queryRaw<CapRow[]>`
      SELECT
        t.id AS "termId",
        t.name AS "termName",
        c.code AS "courseCode",
        c.title AS "courseTitle",
        s.id AS "sectionId",
        s.capacity::bigint AS "capacity",
        COUNT(*) FILTER (WHERE e.status = 'ENROLLED' AND e."deletedAt" IS NULL) AS "enrolled",
        COUNT(*) FILTER (WHERE e.status = 'COMPLETED' AND e."deletedAt" IS NULL) AS "completed",
        COUNT(*) FILTER (WHERE e.status = 'DROPPED' AND e."deletedAt" IS NULL) AS "dropped",
        COUNT(*) FILTER (WHERE e.status = 'WAITLISTED' AND e."deletedAt" IS NULL) AS "waitlisted"
      FROM "Section" s
      JOIN "Term" t ON t.id = s."termId"
      JOIN "Course" c ON c.id = s."courseId"
      LEFT JOIN "Enrollment" e ON e."sectionId" = s.id
      WHERE c."deletedAt" IS NULL
        ${termFilter}
      GROUP BY t.id, t.name, c.code, c.title, s.id, s.capacity
      ORDER BY t.name DESC, c.code ASC
    `;

    const sections = rows.map((r) => {
      const cap = toNum(r.capacity);
      const enrolled = toNum(r.enrolled);
      const completed = toNum(r.completed);
      const utilization = cap > 0 ? Math.round(((enrolled + completed) / cap) * 100) : 0;
      return {
        termId: r.termId, termName: r.termName,
        courseCode: r.courseCode, courseTitle: r.courseTitle,
        sectionId: r.sectionId, capacity: cap,
        enrolled, completed,
        dropped: toNum(r.dropped), waitlisted: toNum(r.waitlisted),
        utilization,
      };
    });

    // Group by term
    const termMap = new Map<string, { termId: string; termName: string; totalCapacity: number; totalEnrolled: number; sections: typeof sections }>();
    for (const s of sections) {
      if (!termMap.has(s.termId)) termMap.set(s.termId, { termId: s.termId, termName: s.termName, totalCapacity: 0, totalEnrolled: 0, sections: [] });
      const t = termMap.get(s.termId)!;
      t.totalCapacity += s.capacity;
      t.totalEnrolled += s.enrolled + s.completed;
      t.sections.push(s);
    }

    const terms = Array.from(termMap.values()).map((t) => ({
      ...t,
      overallUtilization: t.totalCapacity > 0 ? Math.round((t.totalEnrolled / t.totalCapacity) * 100) : 0,
    }));

    return {
      terms,
      summary: {
        totalSections: sections.length,
        totalCapacity: sections.reduce((s, r) => s + r.capacity, 0),
        totalEnrolled: sections.reduce((s, r) => s + r.enrolled + r.completed, 0),
        overCapacitySections: sections.filter((s) => s.utilization > 100).length,
        fullSections: sections.filter((s) => s.utilization >= 90).length,
      }
    };
  }

// ─── Enrollment Trends by Major ────────────────────────────────────────────
  async getMajorEnrollmentTrends(termId?: string) {
    const termFilter = termId ? Prisma.sql`AND t.id = ${termId}` : Prisma.sql``;
    type TrendRow = {
      major: string; termName: string;
      enrolled: bigint; completed: bigint; dropped: bigint; total: bigint;
    };
    const rows = await this.prisma.$queryRaw<TrendRow[]>`
      SELECT
        COALESCE(sp."programMajor", '(未指定)') AS major,
        t.name AS "termName",
        COUNT(*) FILTER (WHERE e.status = 'ENROLLED') AS "enrolled",
        COUNT(*) FILTER (WHERE e.status = 'COMPLETED') AS "completed",
        COUNT(*) FILTER (WHERE e.status = 'DROPPED') AS "dropped",
        COUNT(*) AS "total"
      FROM "Enrollment" e
      JOIN "Section" s ON s.id = e."sectionId"
      JOIN "Term" t ON t.id = s."termId"
      JOIN "User" u ON u.id = e."studentId"
      LEFT JOIN "StudentProfile" sp ON sp."userId" = u.id
      WHERE e."deletedAt" IS NULL
        ${termFilter}
      GROUP BY sp."programMajor", t.name
      ORDER BY t.name DESC, "total" DESC
    `;

    const majorMap = new Map<string, { major: string; terms: { termName: string; enrolled: number; completed: number; dropped: number; total: number }[] }>();
    for (const r of rows) {
      if (!majorMap.has(r.major)) majorMap.set(r.major, { major: r.major, terms: [] });
      majorMap.get(r.major)!.terms.push({
        termName: r.termName,
        enrolled: toNum(r.enrolled), completed: toNum(r.completed),
        dropped: toNum(r.dropped), total: toNum(r.total),
      });
    }

    const majors = Array.from(majorMap.values()).map((m) => ({
      ...m,
      totalEnrollments: m.terms.reduce((s, t) => s + t.total, 0),
      dropRate: m.terms.reduce((s, t) => s + t.dropped, 0) /
        Math.max(1, m.terms.reduce((s, t) => s + t.total, 0)),
    }));

    const termNames = Array.from(new Set(rows.map((r) => r.termName)));
    return { majors, termNames, totalRows: rows.length };
  }

// ─── Late Drop Report ──────────────────────────────────────────────────────
  async getLateDropReport(termId?: string, minWeek?: number) {
    const week = minWeek ?? 8;
    const termFilter = termId ? Prisma.sql`AND t.id = ${termId}` : Prisma.sql``;
    type DropRow = {
      enrollmentId: string; studentEmail: string; studentName: string | null;
      courseCode: string; courseTitle: string; termName: string;
      droppedAt: Date; weeksIntoCourse: number;
    };
    const rows = await this.prisma.$queryRaw<DropRow[]>`
      SELECT
        e.id AS "enrollmentId",
        u.email AS "studentEmail",
        sp."legalName" AS "studentName",
        c.code AS "courseCode",
        c.title AS "courseTitle",
        t.name AS "termName",
        e."updatedAt" AS "droppedAt",
        GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM (e."updatedAt" - COALESCE(t."startDate", e."createdAt"))) / 604800)
        )::int AS "weeksIntoCourse"
      FROM "Enrollment" e
      JOIN "Section" s ON s.id = e."sectionId"
      JOIN "Term" t ON t.id = s."termId"
      JOIN "Course" c ON c.id = s."courseId"
      JOIN "User" u ON u.id = e."studentId"
      LEFT JOIN "StudentProfile" sp ON sp."userId" = u.id
      WHERE e.status = 'DROPPED'
        AND e."deletedAt" IS NULL
        AND GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM (e."updatedAt" - COALESCE(t."startDate", e."createdAt"))) / 604800)
        ) >= ${week}
        ${termFilter}
      ORDER BY e."updatedAt" DESC
      LIMIT 500
    `;

    const data = rows.map((r) => ({
      enrollmentId: r.enrollmentId,
      studentEmail: r.studentEmail,
      studentName: r.studentName ?? r.studentEmail,
      courseCode: r.courseCode,
      courseTitle: r.courseTitle,
      termName: r.termName,
      droppedAt: r.droppedAt.toISOString().slice(0, 10),
      weeksIntoCourse: Number(r.weeksIntoCourse),
    }));

    return {
      rows: data,
      summary: {
        total: data.length,
        minWeek: week,
        avgWeek: data.length > 0 ? Math.round(data.reduce((s, r) => s + r.weeksIntoCourse, 0) / data.length) : 0,
      }
    };
  }

// ─── Instructor Performance Report ────────────────────────────────────────
  async getInstructorPerformance(termId?: string) {
    const termFilter = termId ? Prisma.sql`AND t.id = ${termId}` : Prisma.sql``;
    type PerfRow = {
      instructorName: string; instructorEmail: string | null;
      sections: bigint; totalStudents: bigint; completedStudents: bigint;
      droppedStudents: bigint; avgGpa: number | null;
    };
    const rows = await this.prisma.$queryRaw<PerfRow[]>`
      SELECT
        s."instructorName",
        u.email AS "instructorEmail",
        COUNT(DISTINCT s.id) AS "sections",
        COUNT(e.id) AS "totalStudents",
        COUNT(e.id) FILTER (WHERE e.status = 'COMPLETED') AS "completedStudents",
        COUNT(e.id) FILTER (WHERE e.status = 'DROPPED') AS "droppedStudents",
        ROUND(
          AVG(CASE
            WHEN e."finalGrade" = 'A+' THEN 4.0
            WHEN e."finalGrade" = 'A' THEN 4.0
            WHEN e."finalGrade" = 'A-' THEN 3.7
            WHEN e."finalGrade" = 'B+' THEN 3.3
            WHEN e."finalGrade" = 'B' THEN 3.0
            WHEN e."finalGrade" = 'B-' THEN 2.7
            WHEN e."finalGrade" = 'C+' THEN 2.3
            WHEN e."finalGrade" = 'C' THEN 2.0
            WHEN e."finalGrade" = 'C-' THEN 1.7
            WHEN e."finalGrade" = 'D+' THEN 1.3
            WHEN e."finalGrade" = 'D' THEN 1.0
            WHEN e."finalGrade" = 'D-' THEN 0.7
            WHEN e."finalGrade" = 'F' THEN 0.0
            ELSE NULL
          END)::numeric, 2
        ) AS "avgGpa"
      FROM "Section" s
      JOIN "Term" t ON t.id = s."termId"
      LEFT JOIN "User" u ON u.id = s."instructorUserId"
      LEFT JOIN "Enrollment" e ON e."sectionId" = s.id AND e."deletedAt" IS NULL
      WHERE 1 = 1
        ${termFilter}
      GROUP BY s."instructorName", u.email
      ORDER BY "sections" DESC, "totalStudents" DESC
    `;

    return rows.map((r) => ({
      instructorName: r.instructorName,
      instructorEmail: r.instructorEmail ?? "—",
      sections: toNum(r.sections),
      totalStudents: toNum(r.totalStudents),
      completedStudents: toNum(r.completedStudents),
      droppedStudents: toNum(r.droppedStudents),
      avgGpa: r.avgGpa !== null ? Number(r.avgGpa) : null,
      dropRate: toNum(r.totalStudents) > 0
        ? Math.round((toNum(r.droppedStudents) / toNum(r.totalStudents)) * 100)
        : 0,
    }));
  }

// ─── Department GPA Comparison ─────────────────────────────────────────────
  async getDeptGpaComparison(termId?: string) {
    const termFilter = termId ? Prisma.sql`AND t.id = ${termId}` : Prisma.sql``;
    type DeptGpaRow = {
      dept: string; termName: string;
      students: bigint; avgGpa: number | null; passRate: number | null;
    };
    const rows = await this.prisma.$queryRaw<DeptGpaRow[]>`
      SELECT
        SUBSTRING(c.code, 1, 4) AS dept,
        t.name AS "termName",
        COUNT(DISTINCT e."studentId") AS "students",
        ROUND(
          AVG(CASE
            WHEN e."finalGrade" IN ('A+','A') THEN 4.0
            WHEN e."finalGrade" = 'A-' THEN 3.7
            WHEN e."finalGrade" = 'B+' THEN 3.3
            WHEN e."finalGrade" = 'B' THEN 3.0
            WHEN e."finalGrade" = 'B-' THEN 2.7
            WHEN e."finalGrade" = 'C+' THEN 2.3
            WHEN e."finalGrade" = 'C' THEN 2.0
            WHEN e."finalGrade" = 'C-' THEN 1.7
            WHEN e."finalGrade" = 'D+' THEN 1.3
            WHEN e."finalGrade" = 'D' THEN 1.0
            WHEN e."finalGrade" = 'D-' THEN 0.7
            WHEN e."finalGrade" = 'F' THEN 0.0
            ELSE NULL
          END)::numeric, 2
        ) AS "avgGpa",
        ROUND(
          100.0 * COUNT(e.id) FILTER (WHERE e."finalGrade" NOT IN ('D+','D','D-','F','W') AND e."finalGrade" IS NOT NULL)
          / NULLIF(COUNT(e.id) FILTER (WHERE e."finalGrade" IS NOT NULL), 0)
        ) AS "passRate"
      FROM "Enrollment" e
      JOIN "Section" s ON s.id = e."sectionId"
      JOIN "Course" c ON c.id = s."courseId"
      JOIN "Term" t ON t.id = s."termId"
      WHERE e.status = 'COMPLETED' AND e."deletedAt" IS NULL
        ${termFilter}
      GROUP BY SUBSTRING(c.code, 1, 4), t.name
      ORDER BY dept ASC, t.name DESC
    `;

    // Group by dept
    const deptMap = new Map<string, { dept: string; terms: { termName: string; students: number; avgGpa: number | null; passRate: number | null }[] }>();
    for (const r of rows) {
      if (!deptMap.has(r.dept)) deptMap.set(r.dept, { dept: r.dept, terms: [] });
      deptMap.get(r.dept)!.terms.push({
        termName: r.termName,
        students: toNum(r.students),
        avgGpa: r.avgGpa !== null ? Number(r.avgGpa) : null,
        passRate: r.passRate !== null ? Number(r.passRate) : null,
      });
    }

    return Array.from(deptMap.values()).map((d) => ({
      ...d,
      latestGpa: d.terms[0]?.avgGpa ?? null,
      avgPassRate: d.terms.reduce((s, t) => s + (t.passRate ?? 0), 0) / Math.max(1, d.terms.filter((t) => t.passRate !== null).length),
    }));
  }

// ─── Course Pairing Analysis ───────────────────────────────────────────────
  async getCoursePairings() {
    type PairingRow = {
      courseAId: string;
      courseACode: string;
      courseATitle: string;
      courseBId: string;
      courseBCode: string;
      courseBTitle: string;
      termId: string;
      termName: string;
      termStartDate: Date;
      coCount: bigint;
    };

    const rows = await this.prisma.$queryRaw<PairingRow[]>`
      WITH active_enrollments AS (
        SELECT DISTINCT
          e."studentId",
          s."termId",
          s."courseId",
          c.code AS "courseCode",
          c.title AS "courseTitle"
        FROM "Enrollment" e
        JOIN "Section" s
          ON s.id = e."sectionId"
        JOIN "Course" c
          ON c.id = s."courseId"
        WHERE e."deletedAt" IS NULL
          AND e.status IN ('ENROLLED', 'COMPLETED', 'PENDING_APPROVAL')
      )
      SELECT
        a."courseId" AS "courseAId",
        a."courseCode" AS "courseACode",
        a."courseTitle" AS "courseATitle",
        b."courseId" AS "courseBId",
        b."courseCode" AS "courseBCode",
        b."courseTitle" AS "courseBTitle",
        t.id AS "termId",
        t.name AS "termName",
        t."startDate" AS "termStartDate",
        COUNT(*)::bigint AS "coCount"
      FROM active_enrollments a
      JOIN active_enrollments b
        ON a."studentId" = b."studentId"
       AND a."termId" = b."termId"
       AND a."courseId" < b."courseId"
      JOIN "Term" t
        ON t.id = a."termId"
      GROUP BY
        a."courseId",
        a."courseCode",
        a."courseTitle",
        b."courseId",
        b."courseCode",
        b."courseTitle",
        t.id,
        t.name,
        t."startDate"
      ORDER BY "coCount" DESC, "termStartDate" DESC, "courseACode" ASC, "courseBCode" ASC
    `;

    const pairings = new Map<string, {
      pairKey: string;
      courseAId: string;
      courseACode: string;
      courseATitle: string;
      courseBId: string;
      courseBCode: string;
      courseBTitle: string;
      coCount: number;
      terms: { termId: string; termName: string; coCount: number }[];
    }>();

    for (const row of rows) {
      const pairKey = `${row.courseAId}|${row.courseBId}`;
      if (!pairings.has(pairKey)) {
        pairings.set(pairKey, {
          pairKey,
          courseAId: row.courseAId,
          courseACode: row.courseACode,
          courseATitle: row.courseATitle,
          courseBId: row.courseBId,
          courseBCode: row.courseBCode,
          courseBTitle: row.courseBTitle,
          coCount: 0,
          terms: []
        });
      }

      const pairing = pairings.get(pairKey)!;
      const termCount = toNum(row.coCount);
      pairing.coCount += termCount;
      pairing.terms.push({
        termId: row.termId,
        termName: row.termName,
        coCount: termCount
      });
    }

    return Array.from(pairings.values())
      .map((pairing) => ({
        ...pairing,
        termCount: pairing.terms.length,
        terms: pairing.terms.sort((a, b) => b.coCount - a.coCount || a.termName.localeCompare(b.termName))
      }))
      .sort((a, b) => b.coCount - a.coCount || b.termCount - a.termCount || a.courseACode.localeCompare(b.courseACode))
      .slice(0, 150);
  }

// ─── Student Retention Cohort ──────────────────────────────────────────────
  async getRetentionCohort() {
    type CohortRow = {
      cohortTermId: string;
      cohortTermName: string;
      activeTermId: string;
      activeTermName: string;
      offset: number;
      cohortSize: bigint;
      activeStudents: bigint;
    };

    const rows = await this.prisma.$queryRaw<CohortRow[]>`
      WITH ranked_terms AS (
        SELECT
          t.id,
          t.name,
          t."startDate",
          ROW_NUMBER() OVER (ORDER BY t."startDate", t.name) - 1 AS term_index
        FROM "Term" t
      ),
      active_enrollments AS (
        SELECT DISTINCT
          e."studentId",
          rt.id AS term_id,
          rt.term_index
        FROM "Enrollment" e
        JOIN "Section" s
          ON s.id = e."sectionId"
        JOIN ranked_terms rt
          ON rt.id = s."termId"
        WHERE e."deletedAt" IS NULL
          AND e.status IN ('ENROLLED', 'COMPLETED', 'PENDING_APPROVAL')
      ),
      first_terms AS (
        SELECT
          ae."studentId",
          MIN(ae.term_index) AS cohort_index
        FROM active_enrollments ae
        GROUP BY ae."studentId"
      ),
      student_activity AS (
        SELECT
          ft."studentId",
          ft.cohort_index,
          ae.term_index,
          ae.term_index - ft.cohort_index AS offset
        FROM first_terms ft
        JOIN active_enrollments ae
          ON ae."studentId" = ft."studentId"
        WHERE ae.term_index >= ft.cohort_index
      ),
      cohort_sizes AS (
        SELECT
          cohort_index,
          COUNT(*)::bigint AS cohort_size
        FROM first_terms
        GROUP BY cohort_index
      )
      SELECT
        cohort_term.id AS "cohortTermId",
        cohort_term.name AS "cohortTermName",
        active_term.id AS "activeTermId",
        active_term.name AS "activeTermName",
        sa.offset::int AS offset,
        cs.cohort_size AS "cohortSize",
        COUNT(DISTINCT sa."studentId")::bigint AS "activeStudents"
      FROM student_activity sa
      JOIN cohort_sizes cs
        ON cs.cohort_index = sa.cohort_index
      JOIN ranked_terms cohort_term
        ON cohort_term.term_index = sa.cohort_index
      JOIN ranked_terms active_term
        ON active_term.term_index = sa.term_index
      GROUP BY
        cohort_term.id,
        cohort_term.name,
        cohort_term."startDate",
        active_term.id,
        active_term.name,
        active_term."startDate",
        sa.offset,
        cs.cohort_size
      ORDER BY cohort_term."startDate" ASC, sa.offset ASC
    `;

    const offsetSet = new Set<number>();
    const cohorts = new Map<string, {
      cohortTermId: string;
      cohortTermName: string;
      cohortSize: number;
      retention: {
        offset: number;
        activeTermId: string;
        activeTermName: string;
        activeStudents: number;
        retentionPct: number;
      }[];
    }>();

    for (const row of rows) {
      offsetSet.add(Number(row.offset));
      if (!cohorts.has(row.cohortTermId)) {
        cohorts.set(row.cohortTermId, {
          cohortTermId: row.cohortTermId,
          cohortTermName: row.cohortTermName,
          cohortSize: toNum(row.cohortSize),
          retention: []
        });
      }

      const cohort = cohorts.get(row.cohortTermId)!;
      const activeStudents = toNum(row.activeStudents);
      const cohortSize = toNum(row.cohortSize);
      cohort.retention.push({
        offset: Number(row.offset),
        activeTermId: row.activeTermId,
        activeTermName: row.activeTermName,
        activeStudents,
        retentionPct: cohortSize > 0 ? Math.round((activeStudents / cohortSize) * 100) : 0
      });
    }

    return {
      offsets: Array.from(offsetSet).sort((a, b) => a - b),
      cohorts: Array.from(cohorts.values()).map((cohort) => ({
        ...cohort,
        retention: cohort.retention.sort((a, b) => a.offset - b.offset)
      }))
    };
  }

async bulkEnroll(studentIds: string[], sectionId: string, actorUserId: string) {
    const uniqueStudentIds = this.normalizeUniqueIds(studentIds);
    const normalizedSectionId = sectionId.trim();

    if (!normalizedSectionId || uniqueStudentIds.length === 0) {
      throw new BadRequestException({
        code: "BULK_INPUT_INVALID",
        message: "sectionId 和至少一个 studentId 为必填项"
      });
    }

    const succeeded: string[] = [];
    const failed: Array<{ studentId: string; reason: string }> = [];

    for (const studentId of uniqueStudentIds) {
      try {
        await this.registrationService.enroll(studentId, normalizedSectionId);
        succeeded.push(studentId);
      } catch (error) {
        failed.push({
          studentId,
          reason: this.normalizeAdminActionError(error)
        });
      }
    }

    await this.auditService.log({
      actorUserId,
      action: "ADMIN_BULK_ENROLL",
      entityType: "section",
      entityId: normalizedSectionId,
      metadata: {
        requestedCount: uniqueStudentIds.length,
        succeededCount: succeeded.length,
        failedCount: failed.length
      }
    });

    return { succeeded, failed };
  }

async bulkDrop(enrollmentIds: string[], actorUserId: string) {
    const uniqueEnrollmentIds = this.normalizeUniqueIds(enrollmentIds);

    if (uniqueEnrollmentIds.length === 0) {
      throw new BadRequestException({
        code: "BULK_INPUT_INVALID",
        message: "至少需要一个注册记录ID"
      });
    }

    const failed: Array<{ enrollmentId: string; reason: string }> = [];
    let succeeded = 0;

    for (const enrollmentId of uniqueEnrollmentIds) {
      try {
        const enrollment = await this.prisma.enrollment.findUnique({
          where: { id: enrollmentId },
          select: { id: true, studentId: true }
        });

        if (!enrollment) {
          failed.push({ enrollmentId, reason: "Enrollment not found" });
          continue;
        }

        await this.registrationService.dropEnrollment(enrollment.studentId, { enrollmentId }, undefined as never);
        succeeded += 1;
      } catch (error) {
        failed.push({
          enrollmentId,
          reason: this.normalizeAdminActionError(error)
        });
      }
    }

    await this.auditService.log({
      actorUserId,
      action: "ADMIN_BULK_DROP",
      entityType: "enrollment",
      metadata: {
        requestedCount: uniqueEnrollmentIds.length,
        succeededCount: succeeded,
        failedCount: failed.length
      }
    });

    return { succeeded, failed };
  }

async bulkUpdateStudentStatus(studentIds: string[], status: string, actorUserId: string) {
    const uniqueStudentIds = this.normalizeUniqueIds(studentIds);
    const normalized = status.trim().toUpperCase();
    const statusMap: Record<string, string> = {
      ACTIVE: "Active",
      INACTIVE: "Inactive",
      SUSPENDED: "Suspended"
    };
    const mappedStatus = statusMap[normalized];

    if (!mappedStatus || uniqueStudentIds.length === 0) {
      throw new BadRequestException({
        code: "BULK_INPUT_INVALID",
        message: "studentIds 和有效状态为必填项"
      });
    }

    const result = await this.prisma.studentProfile.updateMany({
      where: {
        userId: { in: uniqueStudentIds }
      },
      data: {
        academicStatus: mappedStatus
      }
    });

    await this.auditService.log({
      actorUserId,
      action: "ADMIN_BULK_UPDATE_STUDENT_STATUS",
      entityType: "student_profile",
      metadata: {
        requestedCount: uniqueStudentIds.length,
        updated: result.count,
        status: mappedStatus
      }
    });

    return { updated: result.count };
  }

async getRegistrationWindows() {
    const now = Date.now();
    const terms = await this.prisma.term.findMany({
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        registrationOpenAt: true,
        registrationCloseAt: true
      }
    });

    return terms.map((term) => {
      const status = getTermStatus(term, new Date(now));
      return {
        ...term,
        status,
        priorityWindows: this.getPriorityWindowsSummary(term.registrationOpenAt)
      };
    });
  }

async updateRegistrationWindow(termId: string, openAt: string, closeAt: string, actorUserId: string) {
    if (!termId.trim() || !openAt || !closeAt) {
      throw new BadRequestException({
        code: "WINDOW_INPUT_INVALID",
        message: "termId、openAt 和 closeAt 为必填项"
      });
    }

    const updated = await this.prisma.term.update({
      where: { id: termId },
      data: {
        registrationOpenAt: new Date(openAt),
        registrationCloseAt: new Date(closeAt)
      },
      select: {
        id: true,
        name: true,
        registrationOpenAt: true,
        registrationCloseAt: true
      }
    });

    await this.auditService.log({
      actorUserId,
      action: "ADMIN_UPDATE_REG_WINDOW",
      entityType: "term",
      entityId: termId,
      metadata: {
        registrationOpenAt: updated.registrationOpenAt,
        registrationCloseAt: updated.registrationCloseAt
      }
    });

    return updated;
  }

async getSystemHealth() {
    const now = new Date();

    // DB connectivity ping
    let dbOk = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbOk = false;
    }

    const activeTerm =
      (await this.prisma.term.findFirst({
        where: {
          startDate: { lte: now },
          endDate: { gte: now }
        },
        orderBy: { startDate: "desc" },
        select: { id: true, name: true }
      })) ??
      (await this.prisma.term.findFirst({
        orderBy: { startDate: "desc" },
        select: { id: true, name: true }
      }));

    const oneHourAgo = new Date(Date.now() - 3_600_000);
    const [totalStudents, totalEnrollments, recentErrors] = await Promise.all([
      this.prisma.user.count({
        where: { role: "STUDENT", deletedAt: null }
      }),
      activeTerm
        ? this.prisma.enrollment.count({
            where: {
              deletedAt: null,
              termId: activeTerm.id,
              status: { in: ["ENROLLED", "WAITLISTED", "PENDING_APPROVAL", "COMPLETED"] as EnrollmentStatus[] }
            }
          })
        : Promise.resolve(0),
      this.prisma.auditLog.count({
        where: {
          createdAt: { gte: oneHourAgo },
          action: { contains: "ERROR" }
        }
      })
    ]);

    return {
      uptime: process.uptime(),
      memUsed: process.memoryUsage().heapUsed,
      memTotal: process.memoryUsage().heapTotal,
      timestamp: new Date(),
      dbOk,
      totalStudents,
      totalEnrollments,
      activeTermName: activeTerm?.name ?? null,
      recentErrors
    };
  }

async getScheduleConflicts(termId?: string) {
    type ConflictRow = {
      studentId: string;
      email: string;
      legalName: string | null;
      ea: string; eb: string;
      codeA: string; codeB: string;
      titleA: string; titleB: string;
      secA: string; secB: string;
      weekday: number;
      startA: number; endA: number;
      startB: number; endB: number;
    };

    const rows = await this.prisma.$queryRaw<ConflictRow[]>`
      SELECT
        u.id                                         AS "studentId",
        u.email,
        sp."legalName",
        e1.id                                        AS ea,
        e2.id                                        AS eb,
        c1.code                                      AS "codeA",
        c2.code                                      AS "codeB",
        c1.title                                     AS "titleA",
        c2.title                                     AS "titleB",
        s1."sectionCode"                             AS "secA",
        s2."sectionCode"                             AS "secB",
        mt1.weekday,
        mt1."startMinutes"                           AS "startA",
        mt1."endMinutes"                             AS "endA",
        mt2."startMinutes"                           AS "startB",
        mt2."endMinutes"                             AS "endB"
      FROM "Enrollment" e1
      JOIN "Enrollment" e2
        ON  e1."studentId" = e2."studentId"
        AND e1.id < e2.id
        AND e1.status = 'ENROLLED'
        AND e2.status = 'ENROLLED'
        AND e1."deletedAt" IS NULL
        AND e2."deletedAt" IS NULL
      JOIN "Section" s1 ON s1.id = e1."sectionId"
      JOIN "Section" s2 ON s2.id = e2."sectionId"
      JOIN "Course"  c1 ON c1.id = s1."courseId"
      JOIN "Course"  c2 ON c2.id = s2."courseId"
      JOIN "MeetingTime" mt1 ON mt1."sectionId" = s1.id
      JOIN "MeetingTime" mt2 ON mt2."sectionId" = s2.id
        AND mt1.weekday = mt2.weekday
        AND mt1."startMinutes" < mt2."endMinutes"
        AND mt2."startMinutes" < mt1."endMinutes"
      JOIN "User" u ON u.id = e1."studentId"
      LEFT JOIN "StudentProfile" sp ON sp."userId" = u.id
      WHERE s1."termId" = s2."termId"
        AND (${termId ?? null}::text IS NULL OR s1."termId" = ${termId ?? ''})
      ORDER BY u.email, mt1.weekday, mt1."startMinutes"
      LIMIT 500
    `;

    const byStudent = new Map<string, {
      studentId: string; email: string; legalName: string | null;
      conflicts: Array<{ codeA: string; codeB: string; titleA: string; titleB: string; secA: string; secB: string; weekday: number; startA: number; endA: number; startB: number; endB: number }>
    }>();

    for (const r of rows) {
      if (!byStudent.has(r.studentId)) {
        byStudent.set(r.studentId, { studentId: r.studentId, email: r.email, legalName: r.legalName, conflicts: [] });
      }
      byStudent.get(r.studentId)!.conflicts.push({
        codeA: r.codeA, codeB: r.codeB,
        titleA: r.titleA, titleB: r.titleB,
        secA: r.secA, secB: r.secB,
        weekday: Number(r.weekday),
        startA: Number(r.startA), endA: Number(r.endA),
        startB: Number(r.startB), endB: Number(r.endB),
      });
    }

    return {
      total: byStudent.size,
      students: [...byStudent.values()],
    };
  }

// ── User Management ────────────────────────────────────────────────────────
  async listUsers(opts: { search?: string; role?: string; page: number; limit: number }) {
    const { search, role, page, limit } = opts;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      deletedAt: null
    };

    if (role) {
      where.role = role as Role;
    }

    if (search?.trim()) {
      const keyword = search.trim();
      where.OR = [
        { email: { contains: keyword, mode: "insensitive" } },
        { studentId: { contains: keyword, mode: "insensitive" } }
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          studentId: true,
          role: true,
          emailVerifiedAt: true,
          lastLoginAt: true,
          loginAttempts: true,
          lockedUntil: true,
          createdAt: true
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip
      })
    ]);

    const users = rows.map((r) => ({
      id: r.id,
      email: r.email,
      studentId: r.studentId,
      role: r.role,
      emailVerifiedAt: r.emailVerifiedAt,
      lastLoginAt: r.lastLoginAt,
      loginAttempts: r.loginAttempts,
      lockedUntil: r.lockedUntil,
      createdAt: r.createdAt
    }));
    return { total, page, limit, users };
  }

async setUserLock(userId: string, lock: boolean, actorUserId: string) {
    const lockedUntil = lock ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { lockedUntil },
      select: { id: true, email: true, lockedUntil: true },
    });
    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action: lock ? "USER_LOCKED" : "USER_UNLOCKED",
        entityType: "User",
        entityId: userId,
        metadata: {},
      },
    });
    return user;
  }
}
