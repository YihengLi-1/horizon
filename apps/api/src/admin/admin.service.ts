import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EnrollmentStatus, Modality, Prisma } from "@prisma/client";
import argon2 from "argon2";
import { createHash } from "crypto";
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
import { sanitizeHtml } from "../common/sanitize";
import { dispatch } from "../common/webhook";
import { NotificationsService } from "../notifications/notifications.service";
import { GovernanceService } from "../governance/governance.service";
import { RegistrationService } from "../registration/registration.service";

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
        message: "Invalid CSV format: unexpected character after quoted field"
      });
    }

    if (char === "\"") {
      if (field.trim().length > 0) {
        throw new BadRequestException({
          code: "CSV_INVALID",
          message: "Invalid CSV format: unexpected quote in unquoted field"
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
      message: "Invalid CSV format: unterminated quoted field"
    });
  }

  pushField();
  pushRowIfNotEmpty();

  return rows;
}

@Injectable()
export class AdminService {
  private readonly defaultPageSize = 50;
  private readonly maxPageSize = 200;
  private readonly importIdempotencyStore = new Map<string, { storedAt: number; result: ImportResultPayload }>();
  private readonly importIdempotencyTtlMs = Number(process.env.IMPORT_IDEMPOTENCY_TTL_MS || 24 * 60 * 60 * 1000);
  private readonly superAdminUserIds = new Set(
    (process.env.SUPERADMIN_USER_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly registrationService: RegistrationService,
    private readonly governanceService: GovernanceService
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

  private getImportCacheKey(scope: string, actorUserId: string, idempotencyKey: string): string {
    return `${scope}::${actorUserId}::${idempotencyKey}`;
  }

  private pruneImportIdempotency(now: number): void {
    for (const [key, value] of this.importIdempotencyStore.entries()) {
      if (now - value.storedAt > this.importIdempotencyTtlMs) {
        this.importIdempotencyStore.delete(key);
      }
    }
  }

  private getImportIdempotentResult(cacheKey: string): ImportResultPayload | null {
    const now = Date.now();
    this.pruneImportIdempotency(now);
    const cached = this.importIdempotencyStore.get(cacheKey);
    if (!cached) return null;
    return { ...cached.result, idempotencyReused: true };
  }

  private setImportIdempotentResult(cacheKey: string, result: ImportResultPayload): void {
    this.importIdempotencyStore.set(cacheKey, {
      storedAt: Date.now(),
      result
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

  private isSuperAdmin(actorUserId: string): boolean {
    return this.superAdminUserIds.has(actorUserId);
  }

  private buildAuditIntegrityHash(input: {
    prevIntegrityHash: string | null;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata: unknown;
    ip: string | null;
    userAgent: string | null;
  }): string {
    const canonical = JSON.stringify({
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? null,
      ip: input.ip,
      userAgent: input.userAgent
    });
    return createHash("sha256")
      .update(`${input.prevIntegrityHash ?? "GENESIS"}|${canonical}`)
      .digest("hex");
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

  async dashboard() {
    const now = new Date();

    const [
      students,
      terms,
      courses,
      sections,
      enrolledCount,
      waitlistCount,
      pendingCount,
      completedCount,
      droppedCount,
      activeTerm,
      recentLogs
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: "STUDENT", deletedAt: null } }),
      this.prisma.term.count(),
      this.prisma.course.count(),
      this.prisma.section.count(),
      this.prisma.enrollment.count({ where: { deletedAt: null, status: "ENROLLED" } }),
      this.prisma.enrollment.count({ where: { deletedAt: null, status: "WAITLISTED" } }),
      this.prisma.enrollment.count({ where: { deletedAt: null, status: "PENDING_APPROVAL" } }),
      this.prisma.enrollment.count({ where: { deletedAt: null, status: "COMPLETED" } }),
      this.prisma.enrollment.count({ where: { deletedAt: null, status: "DROPPED" } }),
      this.prisma.term.findFirst({
        where: {
          startDate: { lte: now },
          endDate: { gte: now }
        },
        include: {
          _count: { select: { sections: true, enrollments: true } }
        }
      }),
      this.prisma.auditLog.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          actor: { select: { email: true, role: true } }
        }
      })
    ]);

    const enrollments = enrolledCount + waitlistCount + pendingCount + completedCount + droppedCount;

    return {
      students,
      terms,
      courses,
      sections,
      enrollments,
      waitlist: waitlistCount,
      breakdown: {
        enrolled: enrolledCount,
        waitlisted: waitlistCount,
        pendingApproval: pendingCount,
        completed: completedCount,
        dropped: droppedCount
      },
      activeTerm: activeTerm
        ? {
            id: activeTerm.id,
            name: activeTerm.name,
            registrationOpenAt: activeTerm.registrationOpenAt,
            registrationCloseAt: activeTerm.registrationCloseAt,
            registrationOpen: activeTerm.registrationOpen,
            dropDeadline: activeTerm.dropDeadline,
            sectionCount: activeTerm._count.sections,
            enrollmentCount: activeTerm._count.enrollments
          }
        : null,
      recentActivity: recentLogs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        actorEmail: log.actor?.email ?? "system",
        actorRole: log.actor?.role ?? "SYSTEM",
        createdAt: log.createdAt
      }))
    };
  }

  private async resolveInstructorAssignment(input: {
    instructorName?: string | null;
    instructorUserId?: string | null;
  }, fallback?: { instructorName: string; instructorUserId?: string | null }) {
    if (input.instructorUserId !== undefined) {
      if (!input.instructorUserId) {
        return {
          instructorUserId: null,
          instructorName: input.instructorName?.trim() || fallback?.instructorName || ""
        };
      }

      const instructor = await this.prisma.user.findFirst({
        where: {
          id: input.instructorUserId,
          role: "FACULTY",
          deletedAt: null
        },
        include: {
          facultyProfile: {
            select: { displayName: true, department: true, title: true }
          }
        }
      });

      if (!instructor) {
        throw new BadRequestException({
          code: "FACULTY_NOT_FOUND",
          message: "Assigned instructor must be an active faculty account"
        });
      }

      return {
        instructorUserId: instructor.id,
        instructorName:
          input.instructorName?.trim() ||
          instructor.facultyProfile?.displayName ||
          fallback?.instructorName ||
          instructor.email
      };
    }

    return {
      instructorUserId: fallback?.instructorUserId ?? null,
      instructorName: input.instructorName?.trim() || fallback?.instructorName || ""
    };
  }

  private async ensureUniqueStaffIdentity(email: string, employeeId?: string | null) {
    const existingEmail = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });
    if (existingEmail) {
      throw new ConflictException({
        code: "USER_EXISTS",
        message: "A user with this email already exists"
      });
    }

    if (!employeeId) return;

    const [facultyEmployee, advisorEmployee] = await Promise.all([
      this.prisma.facultyProfile.findUnique({
        where: { employeeId },
        select: { id: true }
      }),
      this.prisma.advisorProfile.findUnique({
        where: { employeeId },
        select: { id: true }
      })
    ]);

    if (facultyEmployee || advisorEmployee) {
      throw new ConflictException({
        code: "EMPLOYEE_ID_EXISTS",
        message: "A staff account with this employee ID already exists"
      });
    }
  }

  async getPaginatedStudents(params?: { page?: number; pageSize?: number; search?: string }) {
    const paging = this.normalizePagination({
      page: params?.page,
      pageSize: params?.pageSize
    });
    const q = params?.search?.trim();

    const where: Prisma.UserWhereInput = {
      role: "STUDENT",
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { studentId: { contains: q, mode: "insensitive" } },
              { studentProfile: { is: { legalName: { contains: q, mode: "insensitive" } } } }
            ]
          }
        : {})
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: paging.skip,
        take: paging.pageSize,
        orderBy: { createdAt: "desc" },
        include: {
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
        }
      }),
      this.prisma.user.count({ where })
    ]);

    return {
      data: data.map(({ enrollments, ...student }) => ({
        ...student,
        gpa: this.computeStudentGpa(enrollments)
      })),
      total,
      page: paging.page,
      pageSize: paging.pageSize
    };
  }

  async listTerms() {
    const cached = apiCache.get("terms");
    if (cached) return cached as any;

    const [terms, enrollmentCounts] = await Promise.all([
      this.prisma.term.findMany({
        orderBy: { startDate: "desc" },
        include: {
          _count: {
            select: {
              sections: true
            }
          }
        }
      }),
      this.prisma.enrollment.groupBy({
        by: ["termId"],
        where: { deletedAt: null },
        _count: { id: true }
      })
    ]);

    const enrollmentCountByTerm = new Map(
      enrollmentCounts.map((item) => [item.termId, item._count.id ?? 0] as const)
    );
    const result = terms.map((term) => ({
      ...term,
      sectionCount: term._count.sections,
      enrollmentCount: enrollmentCountByTerm.get(term.id) ?? 0
    }));
    apiCache.set("terms", result, 30_000);
    return result;
  }

  async listFaculty() {
    return this.prisma.user.findMany({
      where: { role: "FACULTY", deletedAt: null },
      include: {
        facultyProfile: true,
        _count: {
          select: { instructedSections: true }
        }
      },
      orderBy: { email: "asc" }
    });
  }

  async createFaculty(input: CreateFacultyInput, actorUserId: string) {
    await this.ensureUniqueStaffIdentity(input.email, input.employeeId ?? null);
    const passwordHash = await argon2.hash(input.password);

    const created = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: "FACULTY",
        emailVerifiedAt: new Date(),
        facultyProfile: {
          create: {
            displayName: input.displayName,
            employeeId: input.employeeId ?? null,
            department: input.department ?? null,
            title: input.title ?? null
          }
        }
      },
      include: { facultyProfile: true }
    });

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "faculty",
      entityId: created.id,
      metadata: { op: "create" }
    });

    return created;
  }

  async listAdvisors() {
    return this.prisma.user.findMany({
      where: { role: "ADVISOR", deletedAt: null },
      include: {
        advisorProfile: true,
        advisorAssignments: {
          where: { active: true },
          select: { id: true }
        }
      },
      orderBy: { email: "asc" }
    });
  }

  async createAdvisor(input: CreateAdvisorInput, actorUserId: string) {
    await this.ensureUniqueStaffIdentity(input.email, input.employeeId ?? null);
    const passwordHash = await argon2.hash(input.password);

    const created = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: "ADVISOR",
        emailVerifiedAt: new Date(),
        advisorProfile: {
          create: {
            displayName: input.displayName,
            employeeId: input.employeeId ?? null,
            department: input.department ?? null,
            officeLocation: input.officeLocation ?? null
          }
        }
      },
      include: { advisorProfile: true }
    });

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "advisor",
      entityId: created.id,
      metadata: { op: "create" }
    });

    return created;
  }

  async assignAdvisor(input: AssignAdvisorInput, actorUserId: string) {
    const [student, advisor] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: input.studentId, role: "STUDENT", deletedAt: null },
        select: { id: true, email: true, studentProfile: { select: { legalName: true } } }
      }),
      this.prisma.user.findFirst({
        where: { id: input.advisorId, role: "ADVISOR", deletedAt: null },
        include: { advisorProfile: { select: { displayName: true } } }
      })
    ]);

    if (!student) {
      throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "Student not found" });
    }

    if (!advisor) {
      throw new NotFoundException({ code: "ADVISOR_NOT_FOUND", message: "Advisor not found" });
    }

    const assignment = await this.prisma.$transaction(async (tx) => {
      await tx.advisorAssignment.updateMany({
        where: { studentId: input.studentId, active: true },
        data: { active: false, endedAt: new Date() }
      });

      return tx.advisorAssignment.create({
        data: {
          studentId: input.studentId,
          advisorId: input.advisorId,
          assignedByUserId: actorUserId,
          notes: input.notes ?? null
        },
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
          student: {
            select: {
              id: true,
              email: true,
              studentProfile: {
                select: { legalName: true, programMajor: true }
              }
            }
          }
        }
      });
    });

    await this.auditService.log({
      actorUserId,
      action: "advisor_assignment",
      entityType: "student",
      entityId: input.studentId,
      metadata: {
        advisorId: input.advisorId,
        advisorDisplayName: advisor.advisorProfile?.displayName ?? advisor.email,
        notes: input.notes ?? null
      }
    });

    return assignment;
  }

  async createTerm(input: CreateTermInput, actorUserId: string) {
    apiCache.del("terms");
    const term = await this.prisma.term.create({
      data: {
        name: input.name,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        registrationOpenAt: new Date(input.registrationOpenAt),
        registrationCloseAt: new Date(input.registrationCloseAt),
        registrationOpen: input.registrationOpen ?? true,
        dropDeadline: new Date(input.dropDeadline),
        maxCredits: input.maxCredits,
        timezone: input.timezone
      }
    });

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "term",
      entityId: term.id,
      metadata: { op: "create" }
    });

    return term;
  }

  async updateTerm(id: string, input: Partial<CreateTermInput>, actorUserId: string) {
    apiCache.del("terms");
    const term = await this.prisma.term.findUnique({ where: { id } });
    if (!term) {
      throw new NotFoundException({ code: "TERM_NOT_FOUND", message: "Term not found" });
    }

    const updated = await this.prisma.term.update({
      where: { id },
      data: {
        name: input.name ?? term.name,
        startDate: input.startDate ? new Date(input.startDate) : term.startDate,
        endDate: input.endDate ? new Date(input.endDate) : term.endDate,
        registrationOpenAt: input.registrationOpenAt ? new Date(input.registrationOpenAt) : term.registrationOpenAt,
        registrationCloseAt: input.registrationCloseAt ? new Date(input.registrationCloseAt) : term.registrationCloseAt,
        registrationOpen: input.registrationOpen ?? term.registrationOpen,
        dropDeadline: input.dropDeadline ? new Date(input.dropDeadline) : term.dropDeadline,
        maxCredits: input.maxCredits ?? term.maxCredits,
        timezone: input.timezone ?? term.timezone
      }
    });

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "term",
      entityId: id,
      metadata: { op: "update" }
    });

    return updated;
  }

  async deleteTerm(id: string, actorUserId: string) {
    apiCache.del("terms");
    const activeSectionCount = await this.prisma.section.count({
      where: {
        termId: id,
        enrollments: {
          some: {
            deletedAt: null,
            status: { in: ["ENROLLED", "WAITLISTED"] }
          }
        }
      }
    });
    if (activeSectionCount > 0) {
      throw new ConflictException({
        code: "TERM_HAS_ACTIVE_ENROLLMENTS",
        message: "This term still has active student enrollments"
      });
    }
    await this.prisma.term.delete({ where: { id } });
    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "term",
      entityId: id,
      metadata: { op: "delete" }
    });
    return { id };
  }

  async toggleTermRegistration(id: string, actorUserId: string) {
    apiCache.del("terms");
    const term = await this.prisma.term.findUnique({ where: { id } });
    if (!term) {
      throw new NotFoundException({ code: "TERM_NOT_FOUND", message: "Term not found" });
    }

    const updated = await this.prisma.term.update({
      where: { id },
      data: { registrationOpen: !term.registrationOpen }
    });

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "term",
      entityId: id,
      metadata: { op: "toggle_registration", registrationOpen: updated.registrationOpen }
    });

    return updated;
  }

  async listCourses() {
    return this.prisma.course.findMany({
      where: { deletedAt: null },
      include: {
        prerequisiteLinks: { include: { prerequisiteCourse: true } }
      },
      orderBy: { code: "asc" }
    });
  }

  async createCourse(input: CreateCourseInput, actorUserId: string) {
    const course = await this.prisma.course.create({
      data: {
        code: input.code,
        title: input.title,
        description: input.description ?? null,
        credits: input.credits,
        weeklyHours: input.weeklyHours ?? null
      }
    });

    if (input.prerequisiteCourseIds && input.prerequisiteCourseIds.length > 0) {
      await this.prisma.coursePrerequisite.createMany({
        data: input.prerequisiteCourseIds.map((prerequisiteCourseId: string) => ({
          courseId: course.id,
          prerequisiteCourseId
        })),
        skipDuplicates: true
      });
    }

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "course",
      entityId: course.id,
      metadata: { op: "create" }
    });

    return this.prisma.course.findUnique({
      where: { id: course.id },
      include: { prerequisiteLinks: { include: { prerequisiteCourse: true } } }
    });
  }

  async updateCourse(id: string, input: Partial<CreateCourseInput>, actorUserId: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) {
      throw new NotFoundException({ code: "COURSE_NOT_FOUND", message: "Course not found" });
    }

    await this.prisma.course.update({
      where: { id },
      data: {
        code: input.code ?? course.code,
        title: input.title ?? course.title,
        description: input.description !== undefined ? input.description : course.description,
        credits: input.credits ?? course.credits,
        weeklyHours: input.weeklyHours !== undefined ? input.weeklyHours : course.weeklyHours
      }
    });

    if (input.prerequisiteCourseIds) {
      await this.prisma.coursePrerequisite.deleteMany({ where: { courseId: id } });
      if (input.prerequisiteCourseIds.length > 0) {
        await this.prisma.coursePrerequisite.createMany({
          data: input.prerequisiteCourseIds.map((prerequisiteCourseId: string) => ({
            courseId: id,
            prerequisiteCourseId
          })),
          skipDuplicates: true
        });
      }
    }

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "course",
      entityId: id,
      metadata: { op: "update" }
    });

    return this.prisma.course.findUnique({
      where: { id },
      include: { prerequisiteLinks: { include: { prerequisiteCourse: true } } }
    });
  }

  async deleteCourse(id: string, actorUserId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      select: { id: true, deletedAt: true }
    });

    if (!course || course.deletedAt) {
      throw new NotFoundException({ code: "COURSE_NOT_FOUND", message: "Course not found" });
    }

    const sectionCount = await this.prisma.section.count({
      where: { courseId: id }
    });

    if (sectionCount > 0) {
      throw new ConflictException({
        code: "COURSE_HAS_SECTIONS",
        message: `此课程有 ${sectionCount} 个教学班，请先删除教学班`
      });
    }

    await this.prisma.course.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "course",
      entityId: id,
      metadata: { op: "delete" }
    });
    return { id };
  }

  async listSections() {
    const rows = await this.prisma.section.findMany({
      take: 500,
      include: {
        term: true,
        course: true,
        instructorUser: {
          select: {
            id: true,
            email: true,
            facultyProfile: {
              select: { displayName: true, department: true, title: true }
            }
          }
        },
        meetingTimes: true,
        ratings: {
          select: { rating: true }
        },
        enrollments: {
          where: { deletedAt: null }
        }
      },
      orderBy: [{ term: { startDate: "desc" } }, { sectionCode: "asc" }]
    });

    return rows.map((section) => ({
      ...section,
      avgRating:
        section.ratings.length > 0
          ? section.ratings.reduce((sum, item) => sum + item.rating, 0) / section.ratings.length
          : null
    }));
  }

  async createSection(input: CreateSectionInput, actorUserId: string) {
    const instructor = await this.resolveInstructorAssignment({
      instructorName: input.instructorName,
      instructorUserId: input.instructorUserId
    });

    const section = await this.prisma.section.create({
      data: {
        termId: input.termId,
        courseId: input.courseId,
        sectionCode: input.sectionCode,
        modality: input.modality,
        capacity: input.capacity,
        credits: input.credits,
        instructorName: instructor.instructorName,
        instructorUserId: instructor.instructorUserId,
        location: input.location ?? null,
        requireApproval: input.requireApproval,
        startDate: input.startDate ? new Date(input.startDate) : null,
        meetingTimes: {
          create: input.meetingTimes
        }
      },
      include: {
        term: true,
        course: true,
        instructorUser: {
          select: {
            id: true,
            email: true,
            facultyProfile: {
              select: { displayName: true, department: true, title: true }
            }
          }
        },
        meetingTimes: true
      }
    });

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "section",
      entityId: section.id,
      metadata: { op: "create" }
    });

    return section;
  }

  async updateSection(id: string, input: Partial<CreateSectionInput>, actorUserId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id },
      include: {
        meetingTimes: true,
        instructorUser: {
          select: {
            id: true,
            facultyProfile: { select: { displayName: true } }
          }
        }
      }
    });
    if (!section) {
      throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "Section not found" });
    }

    const instructor = await this.resolveInstructorAssignment(
      {
        instructorName: input.instructorName,
        instructorUserId: input.instructorUserId
      },
      {
        instructorName: section.instructorName,
        instructorUserId: section.instructorUser?.id ?? null
      }
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.meetingTimes) {
        await tx.meetingTime.deleteMany({ where: { sectionId: id } });
      }

      return tx.section.update({
        where: { id },
        data: {
          termId: input.termId ?? section.termId,
          courseId: input.courseId ?? section.courseId,
          sectionCode: input.sectionCode ?? section.sectionCode,
          modality: input.modality ?? section.modality,
          capacity: input.capacity ?? section.capacity,
          credits: input.credits ?? section.credits,
          instructorName: instructor.instructorName,
          instructorUserId: instructor.instructorUserId,
          location: input.location !== undefined ? input.location : section.location,
          requireApproval: input.requireApproval ?? section.requireApproval,
          startDate: input.startDate ? new Date(input.startDate) : section.startDate,
          meetingTimes: input.meetingTimes
            ? {
                create: input.meetingTimes
              }
            : undefined
        },
        include: {
          term: true,
          course: true,
          instructorUser: {
            select: {
              id: true,
              email: true,
              facultyProfile: {
                select: { displayName: true, department: true, title: true }
              }
            }
          },
          meetingTimes: true,
          ratings: {
            select: { rating: true }
          },
          enrollments: {
            where: { deletedAt: null }
          }
        }
      });
    });

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "section",
      entityId: id,
      metadata: { op: "update" }
    });

    return updated;
  }

  async deleteSection(id: string, actorUserId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id },
      select: {
        id: true,
        _count: {
          select: {
            enrollments: {
              where: {
                deletedAt: null,
                status: "ENROLLED"
              }
            }
          }
        }
      }
    });

    if (!section) {
      throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "Section not found" });
    }

    if (section._count.enrollments > 0) {
      throw new ConflictException({
        code: "SECTION_HAS_ACTIVE_ENROLLMENTS",
        message: "Cannot delete section with active students"
      });
    }

    await this.prisma.section.delete({ where: { id } });
    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "section",
      entityId: id,
      metadata: { op: "delete" }
    });
    return { id };
  }

  async notifySection(sectionId: string, subject: string, message: string, actorUserId: string) {
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();
    if (!cleanSubject || !cleanMessage) {
      throw new BadRequestException({
        code: "SECTION_NOTIFY_INVALID",
        message: "Subject and message are required"
      });
    }

    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { course: true }
    });
    if (!section) {
      throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "Section not found" });
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        sectionId,
        status: "ENROLLED",
        deletedAt: null,
        student: {
          is: {
            deletedAt: null
          }
        }
      },
      include: {
        student: {
          include: {
            studentProfile: true
          }
        },
        section: {
          include: {
            course: true
          }
        }
      }
    });

    const results = await Promise.allSettled(
      enrollments.map((enrollment) =>
        this.notificationsService.sendMail({
          to: enrollment.student.email,
          subject: `[SIS] ${cleanSubject}`,
          text: `Dear ${enrollment.student.studentProfile?.legalName ?? "Student"},\n\n${cleanMessage}\n\n— 地平线 SIS`,
          html: `<p>Dear ${enrollment.student.studentProfile?.legalName ?? "Student"},</p><p>${cleanMessage.replace(/\n/g, "<br>")}</p><p>— 地平线 SIS</p>`
        })
      )
    );

    const sent = results.filter((result) => result.status === "fulfilled" && result.value).length;
    const failed = results.length - sent;

    await this.auditService.log({
      actorUserId,
      action: "NOTIFY_SECTION",
      entityType: "section",
      entityId: sectionId,
      metadata: {
        subject: cleanSubject,
        sent,
        failed,
        total: results.length,
        courseCode: section.course.code,
        sectionCode: section.sectionCode
      }
    });

    return { sent, failed, total: results.length };
  }

  async cloneSection(sectionId: string, actorUserId: string, targetTermId?: string) {
    const src = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { meetingTimes: true }
    });
    if (!src) {
      throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "Section not found" });
    }

    const clone = await this.prisma.section.create({
      data: {
        courseId: src.courseId,
        termId: targetTermId ?? src.termId,
        instructorName: src.instructorName,
        location: src.location,
        capacity: src.capacity,
        modality: src.modality,
        credits: src.credits,
        requireApproval: src.requireApproval,
        startDate: src.startDate,
        sectionCode: `${src.sectionCode}-COPY-${Date.now().toString().slice(-4)}`,
        meetingTimes: {
          create: src.meetingTimes.map((mt) => ({
            weekday: mt.weekday,
            startMinutes: mt.startMinutes,
            endMinutes: mt.endMinutes
          }))
        }
      },
      include: {
        term: true,
        course: true,
        meetingTimes: true,
        ratings: {
          select: { rating: true }
        },
        enrollments: {
          where: { deletedAt: null }
        }
      }
    });

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "section",
      entityId: clone.id,
      metadata: { op: "clone", sourceSectionId: sectionId }
    });

    return clone;
  }

  async listSectionEnrollments(sectionId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      select: { id: true }
    });

    if (!section) {
      throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "Section not found" });
    }

    return this.prisma.enrollment.findMany({
      where: {
        deletedAt: null,
        sectionId,
        student: {
          is: {
            deletedAt: null
          }
        }
      },
      include: {
        student: {
          include: {
            studentProfile: true
          }
        },
        term: true,
        section: {
          include: {
            course: true
          }
        }
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }]
    });
  }

  async bulkUpdateGrades(
    sectionId: string,
    grades: Array<{ enrollmentId: string; grade: string; gradePoints?: number }>,
    actorUserId: string
  ) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { course: true, term: true }
    });

    if (!section) {
      throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "Section not found" });
    }

    const normalized = grades
      .map((item) => ({
        enrollmentId: item.enrollmentId,
        grade: item.grade.trim().toUpperCase()
      }))
      .filter((item) => item.enrollmentId && item.grade);

    if (normalized.length === 0) {
      throw new BadRequestException({ code: "NO_GRADES_SUBMITTED", message: "No grades submitted" });
    }

    const succeeded: string[] = [];
    const failed: Array<{ enrollmentId: string; reason: string }> = [];

    for (const item of normalized) {
      try {
        const enrollment = await this.prisma.enrollment.findFirst({
          where: { id: item.enrollmentId, sectionId, deletedAt: null },
          select: { id: true }
        });

        if (!enrollment) {
          failed.push({ enrollmentId: item.enrollmentId, reason: "Enrollment not found in this section" });
          continue;
        }

        await this.updateGrade({ enrollmentId: item.enrollmentId, finalGrade: item.grade }, actorUserId);
        succeeded.push(item.enrollmentId);
      } catch (error) {
        failed.push({
          enrollmentId: item.enrollmentId,
          reason:
            error && typeof error === "object" && "message" in error && typeof error.message === "string"
              ? error.message
              : "Unable to update grade"
        });
      }
    }

    await this.auditService.log({
      actorUserId,
      action: "GRADE_BULK_UPDATE",
      entityType: "section",
      entityId: sectionId,
      metadata: {
        sectionCode: section.sectionCode,
        courseCode: section.course.code,
        termName: section.term.name,
        count: succeeded.length,
        failed: failed.length
      }
    });

    return {
      updated: succeeded.length,
      succeeded,
      failed
    };
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

  // ── Term Closeout ────────────────────────────────────────────────────────────
  async getTermCloseoutPreview(termId: string) {
    const term = await this.prisma.term.findUnique({ where: { id: termId } });
    if (!term) throw new NotFoundException({ code: "TERM_NOT_FOUND", message: "Term not found" });

    const [enrolled, waitlisted, pendingApproval, completed] = await Promise.all([
      this.prisma.enrollment.count({ where: { section: { termId }, status: "ENROLLED", deletedAt: null } }),
      this.prisma.enrollment.count({ where: { section: { termId }, status: "WAITLISTED", deletedAt: null } }),
      this.prisma.enrollment.count({ where: { section: { termId }, status: "PENDING_APPROVAL", deletedAt: null } }),
      this.prisma.enrollment.count({ where: { section: { termId }, status: "COMPLETED", deletedAt: null } })
    ]);

    return { termId, termName: term.name, enrolled, waitlisted, pendingApproval, completed };
  }

  async bulkCloseOutTerm(termId: string, actorUserId: string, action: "enroll_to_completed" | "waitlist_to_dropped" | "pending_to_dropped") {
    const term = await this.prisma.term.findUnique({ where: { id: termId } });
    if (!term) throw new NotFoundException({ code: "TERM_NOT_FOUND", message: "Term not found" });

    let updated = 0;

    if (action === "enroll_to_completed") {
      const result = await this.prisma.enrollment.updateMany({
        where: { section: { termId }, status: "ENROLLED", deletedAt: null },
        data: { status: "COMPLETED" }
      });
      updated = result.count;
    } else if (action === "waitlist_to_dropped") {
      const result = await this.prisma.enrollment.updateMany({
        where: { section: { termId }, status: "WAITLISTED", deletedAt: null },
        data: { status: "DROPPED" }
      });
      updated = result.count;
    } else if (action === "pending_to_dropped") {
      const result = await this.prisma.enrollment.updateMany({
        where: { section: { termId }, status: "PENDING_APPROVAL", deletedAt: null },
        data: { status: "DROPPED" }
      });
      updated = result.count;
    }

    await this.auditService.log({
      actorUserId,
      action: `TERM_CLOSEOUT_${action.toUpperCase()}`,
      entityType: "term",
      entityId: termId,
      metadata: { termName: term.name, updated, action }
    });

    return { termId, termName: term.name, action, updated };
  }

  async adminDropEnrollment(id: string, actorUserId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id, deletedAt: null },
      include: {
        term: true,
        student: {
          include: {
            studentProfile: true
          }
        },
        section: {
          include: {
            course: true
          }
        }
      }
    });

    if (!enrollment) {
      throw new NotFoundException({ code: "ENROLLMENT_NOT_FOUND", message: "Enrollment not found" });
    }

    if (enrollment.status === "DROPPED") {
      return { dropped: enrollment, seatFreed: false };
    }

    const previousStatus = enrollment.status;
    const seatFreed = previousStatus === "ENROLLED";

    const dropped = await this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "DROPPED",
        droppedAt: new Date(),
        waitlistPosition: null
      }
    });

    if (previousStatus === "WAITLISTED" && enrollment.waitlistPosition !== null) {
      await this.prisma.$transaction([
        this.prisma.enrollment.updateMany({
          where: {
            deletedAt: null,
            sectionId: enrollment.sectionId,
            status: "WAITLISTED",
            waitlistPosition: { gt: enrollment.waitlistPosition }
          },
          data: {
            waitlistPosition: { increment: 10000 }
          }
        }),
        this.prisma.enrollment.updateMany({
          where: {
            deletedAt: null,
            sectionId: enrollment.sectionId,
            status: "WAITLISTED",
            waitlistPosition: { gt: enrollment.waitlistPosition + 10000 }
          },
          data: {
            waitlistPosition: { decrement: 9999 }
          }
        })
      ]);
    }

    await this.auditService.log({
      actorUserId,
      action: "ADMIN_DROP",
      entityType: "enrollment",
      entityId: enrollment.id,
      metadata: {
        previousStatus,
        sectionId: enrollment.sectionId,
        studentId: enrollment.studentId,
        seatFreed
      }
    });

    void dispatch({
      type: "enrollment.updated",
      payload: {
        id: enrollment.id,
        oldStatus: previousStatus,
        newStatus: "DROPPED"
      }
    }).catch(() => {});

    if (!seatFreed) {
      return { dropped, seatFreed };
    }

    const nextWaiting = await this.prisma.enrollment.findFirst({
      where: {
        deletedAt: null,
        sectionId: enrollment.sectionId,
        status: "WAITLISTED"
      },
      orderBy: { waitlistPosition: "asc" },
      include: {
        student: {
          include: {
            studentProfile: true
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

    if (!nextWaiting) {
      return { dropped, seatFreed };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.update({
        where: { id: nextWaiting.id },
        data: {
          status: "ENROLLED",
          waitlistPosition: null
        }
      });

      if (nextWaiting.waitlistPosition !== null) {
        await tx.enrollment.updateMany({
          where: {
            deletedAt: null,
            sectionId: nextWaiting.sectionId,
            status: "WAITLISTED",
            waitlistPosition: { gt: nextWaiting.waitlistPosition }
          },
          data: {
            waitlistPosition: { increment: 10000 }
          }
        });

        await tx.enrollment.updateMany({
          where: {
            deletedAt: null,
            sectionId: nextWaiting.sectionId,
            status: "WAITLISTED",
            waitlistPosition: { gt: nextWaiting.waitlistPosition + 10000 }
          },
          data: {
            waitlistPosition: { decrement: 9999 }
          }
        });
      }
    });

    await this.auditService.log({
      actorUserId,
      action: "AUTO_PROMOTE_WAITLIST",
      entityType: "enrollment",
      entityId: nextWaiting.id,
      metadata: {
        studentId: nextWaiting.studentId,
        sectionId: nextWaiting.sectionId,
        courseCode: nextWaiting.section.course.code
      }
    });

    void dispatch({
      type: "enrollment.updated",
      payload: {
        id: nextWaiting.id,
        oldStatus: "WAITLISTED",
        newStatus: "ENROLLED"
      }
    }).catch(() => {});

    await this.notificationsService.sendWaitlistPromotionEmail({
      to: nextWaiting.student.email,
      legalName: nextWaiting.student.studentProfile?.legalName ?? null,
      termName: nextWaiting.section.term.name,
      courseCode: nextWaiting.section.course.code,
      sectionCode: nextWaiting.section.sectionCode
    });

    return { dropped, seatFreed, promotedEnrollmentId: nextWaiting.id };
  }

  async updateEnrollment(id: string, input: { status?: string; finalGrade?: string }, actorUserId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id, deletedAt: null }
    });
    if (!enrollment) {
      throw new NotFoundException({ code: "ENROLLMENT_NOT_FOUND", message: "Enrollment not found" });
    }

    if (enrollment.status === "COMPLETED" && !this.isSuperAdmin(actorUserId)) {
      throw new ForbiddenException({
        code: "COMPLETED_ENROLLMENT_LOCKED",
        message: "Completed enrollments are locked and cannot be modified"
      });
    }

    const updated = await this.prisma.enrollment.update({
      where: { id },
      data: {
        status: (input.status as never) ?? enrollment.status,
        finalGrade: input.finalGrade ?? enrollment.finalGrade
      }
    });

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "enrollment",
      entityId: id,
      metadata: { op: "update" }
    });

    return updated;
  }

  async listWaitlist(sectionId?: string) {
    return this.prisma.enrollment.findMany({
      where: {
        deletedAt: null,
        status: "WAITLISTED",
        sectionId: sectionId || undefined,
        student: {
          is: {
            deletedAt: null
          }
        }
      },
      include: {
        student: { include: { studentProfile: true } },
        section: { include: { course: true, term: true } }
      },
      orderBy: [{ sectionId: "asc" }, { waitlistPosition: "asc" }]
    });
  }

  async promoteWaitlist(input: PromoteWaitlistInput, actorUserId: string) {
    const requestedCount = input.count ?? 1;
    const result = await this.runAdminTransactionWithRetry(async (tx) => {
      const section = await tx.section.findUnique({
        where: { id: input.sectionId },
        select: { id: true, capacity: true }
      });

      if (!section) {
        throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "Section not found" });
      }

      const enrolledCount = await tx.enrollment.count({
        where: { deletedAt: null, sectionId: input.sectionId, status: "ENROLLED" }
      });

      const availableSeatsBefore = Math.max(0, section.capacity - enrolledCount);
      const promoteN = Math.min(availableSeatsBefore, requestedCount);

      const waitlistedToPromote = await tx.enrollment.findMany({
        where: {
          deletedAt: null,
          sectionId: input.sectionId,
          status: "WAITLISTED"
        },
        orderBy: [{ waitlistPosition: "asc" }, { createdAt: "asc" }],
        take: promoteN
      });

      const promotedEnrollmentIds = waitlistedToPromote.map((item) => item.id);

      if (promotedEnrollmentIds.length > 0) {
        await tx.enrollment.updateMany({
          where: { id: { in: promotedEnrollmentIds } },
          data: {
            status: "ENROLLED",
            waitlistPosition: null
          }
        });
      }

      await tx.enrollment.updateMany({
        where: {
          deletedAt: null,
          sectionId: input.sectionId,
          status: "WAITLISTED",
          waitlistPosition: { not: null }
        },
        data: {
          waitlistPosition: { increment: 10000 }
        }
      });

      const remainingWaitlisted = await tx.enrollment.findMany({
        where: {
          deletedAt: null,
          sectionId: input.sectionId,
          status: "WAITLISTED",
          waitlistPosition: { not: null }
        },
        orderBy: [{ waitlistPosition: "asc" }, { createdAt: "asc" }],
        select: {
          id: true
        }
      });

      for (let index = 0; index < remainingWaitlisted.length; index += 1) {
        await tx.enrollment.update({
          where: { id: remainingWaitlisted[index].id },
          data: { waitlistPosition: index + 1 }
        });
      }

      const promotedCount = promotedEnrollmentIds.length;
      const availableSeatsAfter = Math.max(0, section.capacity - (enrolledCount + promotedCount));

      await this.auditService.logInTransaction(tx, {
        actorUserId,
        action: "promote_waitlist",
        entityType: "section",
        entityId: input.sectionId,
        metadata: {
          promotedCount,
          promotedEnrollmentIds,
          availableSeatsBefore,
          availableSeatsAfter
        }
      });

      return {
        promoted: waitlistedToPromote.map((item) => ({
          enrollmentId: item.id,
          studentId: item.studentId,
          sectionId: item.sectionId
        })),
        promotedCount,
        remainingWaitlistCount: remainingWaitlisted.length,
        availableSeatsBefore,
        availableSeatsAfter
      };
    });

    if (result.promotedCount > 0) {
      const promotedRecords = await this.prisma.enrollment.findMany({
        where: {
          deletedAt: null,
          id: { in: result.promoted.map((item) => item.enrollmentId) }
        },
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

      await Promise.all(
        promotedRecords
          .filter((record) => Boolean(record.student.email))
          .map((record) =>
            this.notificationsService.sendWaitlistPromotionEmail({
              to: record.student.email,
              legalName: record.student.studentProfile?.legalName ?? null,
              termName: record.section.term.name,
              courseCode: record.section.course.code,
              sectionCode: record.section.sectionCode
            })
          )
      );
    }

    return result;
  }

  async updateGrade(input: UpdateGradeInput, actorUserId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: input.enrollmentId, deletedAt: null }
    });
    if (!enrollment) {
      throw new NotFoundException({ code: "ENROLLMENT_NOT_FOUND", message: "Enrollment not found" });
    }

    if (enrollment.status === "COMPLETED" && !this.isSuperAdmin(actorUserId)) {
      throw new ForbiddenException({
        code: "COMPLETED_ENROLLMENT_LOCKED",
        message: "Completed enrollments are locked and cannot be modified"
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
      throw new NotFoundException({ code: "ENROLLMENT_NOT_FOUND", message: "Enrollment not found" });
    }

    return this.updateGrade({ enrollmentId: enrollment.id, finalGrade: grade }, actorUserId);
  }

  async getAdminHolds(actorUserId: string, studentId?: string) {
    const holds = await this.governanceService.listHolds(actorUserId, studentId);
    return holds.filter((hold) => hold.active);
  }

  async createAdminHold(actorUserId: string, input: CreateHoldInput) {
    return this.governanceService.createHold(actorUserId, input);
  }

  async removeAdminHold(actorUserId: string, holdId: string, note?: string | null) {
    return this.governanceService.resolveHold(actorUserId, holdId, {
      resolutionNote: note?.trim() || "Removed from /admin/holds"
    });
  }

  async listInviteCodes() {
    return this.prisma.inviteCode.findMany({ orderBy: { createdAt: "desc" } });
  }

  async createInviteCode(input: CreateInviteCodeInput, actorUserId: string) {
    const invite = await this.prisma.inviteCode.create({
      data: {
        code: input.code,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        maxUses: input.maxUses ?? null,
        active: input.active,
        issuedByUserId: actorUserId
      }
    });

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "invite_code",
      entityId: invite.id,
      metadata: { op: "create" }
    });

    return invite;
  }

  async updateInviteCode(id: string, input: Partial<CreateInviteCodeInput>, actorUserId: string) {
    const invite = await this.prisma.inviteCode.findUnique({ where: { id } });
    if (!invite) {
      throw new NotFoundException({ code: "INVITE_NOT_FOUND", message: "Invite code not found" });
    }

    const updated = await this.prisma.inviteCode.update({
      where: { id },
      data: {
        code: input.code ?? invite.code,
        expiresAt: input.expiresAt !== undefined ? (input.expiresAt ? new Date(input.expiresAt) : null) : invite.expiresAt,
        maxUses: input.maxUses !== undefined ? input.maxUses : invite.maxUses,
        active: input.active ?? invite.active
      }
    });

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "invite_code",
      entityId: id,
      metadata: { op: "update" }
    });

    return updated;
  }

  async deleteInviteCode(id: string, actorUserId: string) {
    const invite = await this.prisma.inviteCode.findUnique({ where: { id } });
    if (!invite) {
      throw new NotFoundException({ code: "INVITE_NOT_FOUND", message: "Invite code not found" });
    }
    if (invite.usedAt || invite.usedCount > 0) {
      throw new ConflictException({ code: "INVITE_ALREADY_USED", message: "Invite code already used" });
    }

    await this.prisma.inviteCode.delete({ where: { id } });
    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "invite_code",
      entityId: id,
      metadata: { op: "delete" }
    });
    return { id };
  }

  async updateUserRole(userId: string, role: "STUDENT" | "ADMIN", actorUserId: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role }
    });

    await this.auditService.log({
      actorUserId,
      action: "ROLE_UPDATE",
      entityType: "user",
      entityId: userId,
      metadata: { role }
    });

    return updated;
  }

  async getAnnouncements() {
    return this.prisma.announcement.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }]
    });
  }

  async getSystemSettings() {
    return this.prisma.systemSetting.findMany({
      orderBy: { key: "asc" }
    });
  }

  async updateSystemSetting(key: string, value: string, actorUserId: string) {
    const setting = await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });

    await this.auditService.log({
      actorUserId,
      action: "SYSTEM_SETTING_UPDATE",
      entityType: "system_setting",
      entityId: key,
      metadata: { value }
    });

    if (key === "maintenance_mode") {
      maintenanceModeCache.del("maintenance_mode");
    }

    return setting;
  }

  async getUserLoginHistory(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        lastLoginAt: true,
        loginAttempts: true,
        lockedUntil: true
      }
    });

    if (!user) {
      throw new NotFoundException({ code: "USER_NOT_FOUND", message: "User not found" });
    }

    return user;
  }

  async createAnnouncement(data: {
    title: string;
    body: string;
    audience?: string;
    pinned?: boolean;
    expiresAt?: string;
  }) {
    const title = sanitizeHtml(data.title);
    const body = sanitizeHtml(data.body);
    const result = await this.prisma.announcement.create({
      data: {
        title,
        body,
        audience: data.audience ?? "ALL",
        pinned: data.pinned ?? false,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
      }
    });
    void dispatch({
      type: "announcement.created",
      payload: { id: result.id, title: result.title, audience: result.audience }
    }).catch(() => {});
    return result;
  }

  async updateAnnouncement(
    id: string,
    data: Partial<{
      title: string;
      body: string;
      audience: string;
      pinned: boolean;
      expiresAt: string | null;
    }>
  ) {
    return this.prisma.announcement.update({
      where: { id },
      data: {
        title: data.title !== undefined ? sanitizeHtml(data.title) : undefined,
        body: data.body !== undefined ? sanitizeHtml(data.body) : undefined,
        audience: data.audience?.toUpperCase(),
        pinned: data.pinned,
        expiresAt:
          data.expiresAt !== undefined ? (data.expiresAt ? new Date(data.expiresAt) : null) : undefined
      }
    });
  }

  async deleteAnnouncement(id: string) {
    return this.prisma.announcement.delete({ where: { id } });
  }

  async getRegistrationStats() {
    const [total, byStatus, byTerm, topSections] = await this.prisma.$transaction([
      this.prisma.enrollment.count({ where: { deletedAt: null } }),
      this.prisma.enrollment.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { id: true },
        orderBy: { status: "asc" }
      }),
      this.prisma.enrollment.groupBy({
        by: ["termId"],
        where: { deletedAt: null },
        _count: { id: true },
        take: 10,
        orderBy: { _count: { id: "desc" } }
      }),
      this.prisma.section.findMany({
        take: 5,
        include: {
          course: { select: { code: true, title: true } },
          _count: { select: { enrollments: true } }
        },
        orderBy: { enrollments: { _count: "desc" } }
      })
    ]);

    return {
      total,
      byStatus: Object.fromEntries(
        byStatus.map((item) => [
          item.status,
          typeof item._count === "object" && item._count ? item._count.id ?? 0 : 0
        ])
      ),
      byTerm: byTerm.map((item) => ({
        termId: item.termId,
        count:
          typeof item._count === "object" && item._count ? item._count.id ?? 0 : 0
      })),
      topSections: topSections.map((section) => ({
        id: section.id,
        code: section.course.code,
        title: section.course.title,
        count: section._count.enrollments
      }))
    };
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

  async getDeptBreakdown(termId?: string) {
    return apiCache.getOrSet(`admin:dept-breakdown:${termId ?? "all"}`, 60_000, async () => {
      if (termId) {
        return this.prisma.$queryRaw<Array<{ dept: string; enrolled: number; waitlisted: number; dropped: number }>>`
          SELECT
            LEFT(c.code, 2) AS dept,
            COUNT(CASE WHEN e.status = 'ENROLLED' THEN 1 END)::int AS enrolled,
            COUNT(CASE WHEN e.status = 'WAITLISTED' THEN 1 END)::int AS waitlisted,
            COUNT(CASE WHEN e.status = 'DROPPED' THEN 1 END)::int AS dropped
          FROM "Enrollment" e
          JOIN "Section" s ON e."sectionId" = s.id
          JOIN "Course" c ON s."courseId" = c.id
          WHERE c."deletedAt" IS NULL AND s."termId" = ${termId}
          GROUP BY LEFT(c.code, 2)
          ORDER BY enrolled DESC, dept ASC
        `;
      }
      return this.prisma.$queryRaw<Array<{ dept: string; enrolled: number; waitlisted: number; dropped: number }>>`
        SELECT
          LEFT(c.code, 2) AS dept,
          COUNT(CASE WHEN e.status = 'ENROLLED' THEN 1 END)::int AS enrolled,
          COUNT(CASE WHEN e.status = 'WAITLISTED' THEN 1 END)::int AS waitlisted,
          COUNT(CASE WHEN e.status = 'DROPPED' THEN 1 END)::int AS dropped
        FROM "Enrollment" e
        JOIN "Section" s ON e."sectionId" = s.id
        JOIN "Course" c ON s."courseId" = c.id
        WHERE c."deletedAt" IS NULL
        GROUP BY LEFT(c.code, 2)
        ORDER BY enrolled DESC, dept ASC
      `;
    });
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

  async getGpaDistribution(termId?: string) {
    return apiCache.getOrSet(`admin:gpa-dist:${termId ?? "all"}`, 300_000, async () => {
      const students = await this.prisma.user.findMany({
        where: {
          role: "STUDENT",
          deletedAt: null
        },
        include: {
          enrollments: {
            where: {
              deletedAt: null,
              status: "COMPLETED",
              finalGrade: { not: null },
              ...(termId ? { section: { termId } } : {})
            },
            include: {
              section: {
                select: { credits: true }
              }
            }
          }
        }
      });

      const tiers = {
        "4.0": 0,
        "3.7-3.9": 0,
        "3.3-3.6": 0,
        "3.0-3.2": 0,
        "2.0-2.9": 0,
        "<2.0": 0,
        "N/A": 0
      };

      for (const student of students) {
        const gpa = this.computeStudentGpa(student.enrollments as StudentGpaEnrollment[]);
        if (gpa === null) {
          tiers["N/A"] += 1;
        } else if (gpa >= 4.0) {
          tiers["4.0"] += 1;
        } else if (gpa >= 3.7) {
          tiers["3.7-3.9"] += 1;
        } else if (gpa >= 3.3) {
          tiers["3.3-3.6"] += 1;
        } else if (gpa >= 3.0) {
          tiers["3.0-3.2"] += 1;
        } else if (gpa >= 2.0) {
          tiers["2.0-2.9"] += 1;
        } else {
          tiers["<2.0"] += 1;
        }
      }

      return Object.entries(tiers).map(([tier, count]) => ({ tier, count }));
    });
  }

  async getRecommendedSections(studentId: string) {
    const completed = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        deletedAt: null,
        status: { in: ["ENROLLED", "COMPLETED"] }
      },
      include: {
        section: {
          include: {
            course: true
          }
        }
      }
    });

    const deptFrequency = new Map<string, number>();
    const enrolledCourseIds = new Set<string>();
    for (const enrollment of completed) {
      const course = enrollment.section.course;
      enrolledCourseIds.add(course.id);
      const dept = course.code.slice(0, 2).toUpperCase();
      deptFrequency.set(dept, (deptFrequency.get(dept) ?? 0) + 1);
    }

    const primaryDept =
      [...deptFrequency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const sections = await this.prisma.section.findMany({
      where: {
        course: {
          deletedAt: null,
          ...(primaryDept
            ? {
                code: {
                  startsWith: primaryDept,
                  mode: "insensitive"
                }
              }
            : {})
        },
        enrollments: {
          none: {
            studentId,
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

    return sections.filter((section) => !enrolledCourseIds.has(section.courseId)).slice(0, 6);
  }

  async getReportsSummary(termId?: string) {
    const enrollmentWhere = {
      deletedAt: null,
      ...(termId ? { section: { termId } } : {})
    } as const;
    const [totalStudents, totalCourses, totalSections, enrollmentGroups, enrolledCreditsRows, topSections, deptBreakdown, gpaDistribution] =
      await Promise.all([
        this.prisma.user.count({ where: { role: "STUDENT", deletedAt: null } }),
        this.prisma.course.count({ where: { deletedAt: null } }),
        this.prisma.section.count({ where: { course: { deletedAt: null }, ...(termId ? { termId } : {}) } }),
        this.prisma.enrollment.groupBy({
          by: ["status"],
          where: enrollmentWhere,
          _count: { id: true }
        }),
        this.prisma.enrollment.findMany({
          where: {
            ...enrollmentWhere,
            status: "ENROLLED"
          },
          select: {
            section: {
              select: { credits: true }
            }
          }
        }),
        this.getTopSections(termId),
        this.getDeptBreakdown(termId),
        this.getGpaDistribution(termId)
      ]);

    const enrollmentByStatus = Object.fromEntries(
      enrollmentGroups.map((item) => [item.status, item._count.id ?? 0])
    );
    const totalEnrolledCredits = enrolledCreditsRows.reduce((sum, item) => sum + (item.section?.credits ?? 0), 0);

    return {
      totalStudents,
      totalCourses,
      totalSections,
      enrollmentByStatus,
      avgCreditsPerStudent: totalStudents > 0 ? Math.round((totalEnrolledCredits / totalStudents) * 10) / 10 : 0,
      topSections,
      deptBreakdown,
      gpaDistribution
    };
  }

  async getDataQuality() {
    const [sectionsNoInstructor, sectionsNoMeetings, enrollmentsNoGrade, studentsNoProfile, coursesNoSections] =
      await Promise.all([
        this.prisma.section.findMany({
          where: {
            instructorName: "",
            course: { deletedAt: null }
          },
          include: { course: true },
          take: 20
        }),
        this.prisma.section.findMany({
          where: {
            meetingTimes: { none: {} },
            course: { deletedAt: null }
          },
          include: { course: true },
          take: 20
        }),
        this.prisma.enrollment.count({
          where: {
            deletedAt: null,
            status: "COMPLETED",
            finalGrade: null
          }
        }),
        this.prisma.user.count({
          where: {
            role: "STUDENT",
            deletedAt: null,
            studentProfile: { is: null }
          }
        }),
        this.prisma.course.findMany({
          where: {
            deletedAt: null,
            sections: { none: {} }
          },
          take: 20
        })
      ]);

    return {
      sectionsNoInstructor,
      sectionsNoMeetings,
      enrollmentsNoGrade,
      studentsNoProfile,
      coursesNoSections
    };
  }

  async getNotificationLog(userId?: string, page = 1) {
    const safePage = Math.max(1, page || 1);
    const where = userId ? { userId } : undefined;
    const [data, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where,
        orderBy: { sentAt: "desc" },
        take: 50,
        skip: (safePage - 1) * 50,
        include: {
          user: {
            select: {
              email: true,
              studentProfile: {
                select: { legalName: true }
              }
            }
          }
        }
      }),
      this.prisma.notificationLog.count({ where })
    ]);

    return { data, total, page: safePage, pageSize: 50 };
  }

  async listAuditLogs(params?: {
    limit?: number;
    page?: number;
    pageSize?: number;
    action?: string;
    entityType?: string;
    search?: string;
  }): Promise<PaginatedResult<Prisma.AuditLogGetPayload<{
    include: {
      actor: {
        select: {
          id: true;
          email: true;
          role: true;
          studentId: true;
        };
      };
    };
  }>>> {
    const q = params?.search?.trim();
    const action = params?.action?.trim();
    const entityType = params?.entityType?.trim();

    const requestedPageSize = params?.limit ?? params?.pageSize;
    const paging = this.normalizePagination({
      page: params?.page,
      pageSize: requestedPageSize !== undefined ? Math.min(200, requestedPageSize) : 50
    });

    const where: Prisma.AuditLogWhereInput = {
      action: action || undefined,
      entityType: entityType || undefined
    };

    if (q) {
      where.OR = [
        { action: { contains: q, mode: "insensitive" } },
        { entityType: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } },
        { actor: { is: { email: { contains: q, mode: "insensitive" } } } },
        { actor: { is: { studentId: { contains: q, mode: "insensitive" } } } }
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        take: paging.pageSize,
        skip: paging.skip,
        orderBy: { createdAt: "desc" },
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              role: true,
              studentId: true
            }
          }
        }
      })
    ]);

    return {
      data,
      total,
      page: paging.page,
      pageSize: paging.pageSize
    };
  }

  async verifyAuditIntegrity(limit = 2000): Promise<AuditIntegrityCheckResult> {
    const safeLimit = Math.max(1, Math.min(10_000, Math.floor(limit)));
    const logs = await this.prisma.auditLog.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: safeLimit,
      select: {
        id: true,
        actorUserId: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        ip: true,
        userAgent: true,
        prevIntegrityHash: true,
        integrityHash: true
      }
    });

    let previousHash: string | null = null;

    for (const log of logs) {
      if (!log.integrityHash) {
        return {
          ok: false,
          checked: logs.length,
          brokenAtId: log.id,
          reason: "Missing integrity hash (legacy or tampered record)"
        };
      }

      if (log.prevIntegrityHash !== previousHash) {
        return {
          ok: false,
          checked: logs.length,
          brokenAtId: log.id,
          reason: "Previous hash pointer mismatch"
        };
      }

      const expectedHash = this.buildAuditIntegrityHash({
        prevIntegrityHash: log.prevIntegrityHash,
        actorUserId: log.actorUserId,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        metadata: log.metadata,
        ip: log.ip,
        userAgent: log.userAgent
      });

      if (expectedHash !== log.integrityHash) {
        return {
          ok: false,
          checked: logs.length,
          brokenAtId: log.id,
          reason: "Hash mismatch"
        };
      }

      previousHash = log.integrityHash;
    }

    return {
      ok: true,
      checked: logs.length,
      brokenAtId: null,
      reason: null
    };
  }

  async importStudents(input: CsvImportInput, actorUserId: string) {
    const cacheKey = input.idempotencyKey
      ? this.getImportCacheKey("students", actorUserId, input.idempotencyKey)
      : null;
    if (cacheKey) {
      const cached = this.getImportIdempotentResult(cacheKey);
      if (cached) return cached;
    }

    const rows = parseCsvRows(input.csv);
    if (rows.length < 2) {
      throw new BadRequestException({ code: "CSV_INVALID", message: "CSV must include header and rows" });
    }

    const [header, ...dataRows] = rows;
    const headerMap = new Map(header.map((name, index) => [name.trim(), index]));
    const idx = {
      email: headerMap.get("email") ?? -1,
      studentId: headerMap.get("studentId") ?? -1,
      legalName: headerMap.get("legalName") ?? -1,
      password: headerMap.get("password") ?? -1
    };

    const issues: CsvRowIssue[] = [];
    const requiredHeaders: Array<keyof typeof idx> = ["email", "studentId", "legalName"];
    for (const field of requiredHeaders) {
      if (idx[field] < 0) {
        issues.push({
          rowNumber: 1,
          field,
          message: `Missing required header "${field}"`
        });
      }
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        code: "CSV_ROW_INVALID",
        message: "CSV header is missing required columns",
        details: issues
      });
    }

    const emailSchema = z.string().email();
    const validRows: StudentImportRow[] = [];
    const emailFirstSeenRow = new Map<string, number>();
    const studentIdFirstSeenRow = new Map<string, number>();

    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
      const row = dataRows[rowIndex];
      const rowNumber = rowIndex + 2;

      const email = (row[idx.email] ?? "").trim();
      const studentId = (row[idx.studentId] ?? "").trim();
      const legalName = (row[idx.legalName] ?? "").trim();
      const passwordRaw = idx.password >= 0 ? (row[idx.password] ?? "").trim() : "";
      const password = passwordRaw || "Student123!";

      const rowIssueCountBefore = issues.length;

      if (!email) {
        issues.push({ rowNumber, field: "email", message: "Email is required" });
      } else if (!emailSchema.safeParse(email).success) {
        issues.push({ rowNumber, field: "email", message: "Invalid email format" });
      }

      if (!studentId) {
        issues.push({ rowNumber, field: "studentId", message: "studentId is required" });
      }

      if (!legalName) {
        issues.push({ rowNumber, field: "legalName", message: "legalName is required" });
      }

      if (issues.length > rowIssueCountBefore) {
        continue;
      }

      const emailKey = email.toLowerCase();
      const previousEmailRow = emailFirstSeenRow.get(emailKey);
      if (previousEmailRow) {
        issues.push({
          rowNumber,
          field: "email",
          message: `Duplicate email in CSV (first seen at row ${previousEmailRow})`
        });
      } else {
        emailFirstSeenRow.set(emailKey, rowNumber);
      }

      const previousStudentRow = studentIdFirstSeenRow.get(studentId);
      if (previousStudentRow) {
        issues.push({
          rowNumber,
          field: "studentId",
          message: `Duplicate studentId in CSV (first seen at row ${previousStudentRow})`
        });
      } else {
        studentIdFirstSeenRow.set(studentId, rowNumber);
      }

      validRows.push({
        rowNumber,
        email,
        studentId,
        legalName,
        password
      });
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        code: "CSV_ROW_INVALID",
        message: "CSV contains invalid rows",
        details: issues
      });
    }

    const uniqueEmails = Array.from(new Set(validRows.map((row) => row.email)));
    const uniqueStudentIds = Array.from(new Set(validRows.map((row) => row.studentId)));
    const existingUsers = await this.prisma.user.findMany({
      where: {
        OR: [{ email: { in: uniqueEmails } }, { studentId: { in: uniqueStudentIds } }]
      },
      select: {
        email: true,
        studentId: true
      }
    });

    const existingEmails = new Set(existingUsers.map((user) => user.email.toLowerCase()));
    const existingStudentIds = new Set(existingUsers.map((user) => user.studentId).filter((value): value is string => !!value));

    for (const row of validRows) {
      if (existingEmails.has(row.email.toLowerCase())) {
        issues.push({
          rowNumber: row.rowNumber,
          field: "email",
          message: "Email already exists"
        });
      }

      if (existingStudentIds.has(row.studentId)) {
        issues.push({
          rowNumber: row.rowNumber,
          field: "studentId",
          message: "studentId already exists"
        });
      }
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        code: "CSV_ROW_INVALID",
        message: "CSV contains duplicate users",
        details: issues
      });
    }

    if (input.dryRun) {
      const result: ImportResultPayload = {
        created: 0,
        dryRun: true,
        wouldCreate: validRows.length
      };
      if (cacheKey) this.setImportIdempotentResult(cacheKey, result);
      return result;
    }

    const passwordHashes = await Promise.all(validRows.map((row) => argon2.hash(row.password)));
    const now = new Date();

    try {
      await this.runAdminTransactionWithRetry(async (tx) => {
        for (let index = 0; index < validRows.length; index += 1) {
          const row = validRows[index];
          await tx.user.create({
            data: {
              email: row.email,
              studentId: row.studentId,
              passwordHash: passwordHashes[index],
              role: "STUDENT",
              emailVerifiedAt: now,
              studentProfile: {
                create: {
                  legalName: row.legalName,
                  enrollmentStatus: "Imported",
                  academicStatus: "Active"
                }
              }
            }
          });
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const conflicts = await this.prisma.user.findMany({
          where: {
            OR: [{ email: { in: uniqueEmails } }, { studentId: { in: uniqueStudentIds } }]
          },
          select: {
            email: true,
            studentId: true
          }
        });

        const conflictEmails = new Set(conflicts.map((user) => user.email.toLowerCase()));
        const conflictStudentIds = new Set(conflicts.map((user) => user.studentId).filter((value): value is string => !!value));
        const raceIssues: CsvRowIssue[] = [];

        for (const row of validRows) {
          if (conflictEmails.has(row.email.toLowerCase())) {
            raceIssues.push({
              rowNumber: row.rowNumber,
              field: "email",
              message: "Email already exists"
            });
          }

          if (conflictStudentIds.has(row.studentId)) {
            raceIssues.push({
              rowNumber: row.rowNumber,
              field: "studentId",
              message: "studentId already exists"
            });
          }
        }

        throw new BadRequestException({
          code: "CSV_ROW_INVALID",
          message: "CSV contains duplicate users",
          details: raceIssues
        });
      }

      throw error;
    }

    const createdCount = validRows.length;
    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "student_import",
      metadata: { createdCount }
    });

    const result: ImportResultPayload = { created: createdCount };
    if (cacheKey) this.setImportIdempotentResult(cacheKey, result);
    return result;
  }

  async importCourses(input: CsvImportInput, actorUserId: string) {
    const cacheKey = input.idempotencyKey
      ? this.getImportCacheKey("courses", actorUserId, input.idempotencyKey)
      : null;
    if (cacheKey) {
      const cached = this.getImportIdempotentResult(cacheKey);
      if (cached) return cached;
    }

    const rows = parseCsvRows(input.csv);
    if (rows.length < 2) {
      throw new BadRequestException({ code: "CSV_INVALID", message: "CSV must include header and rows" });
    }

    const [header, ...dataRows] = rows;
    const headerMap = new Map(header.map((name, index) => [name.trim(), index]));
    const idx = {
      code: headerMap.get("code") ?? -1,
      title: headerMap.get("title") ?? -1,
      credits: headerMap.get("credits") ?? -1,
      description: headerMap.get("description") ?? -1
    };

    const issues: CsvRowIssue[] = [];
    const requiredHeaders: Array<keyof typeof idx> = ["code", "title", "credits"];
    for (const field of requiredHeaders) {
      if (idx[field] < 0) {
        issues.push({
          rowNumber: 1,
          field,
          message: `Missing required header "${field}"`
        });
      }
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        code: "CSV_ROW_INVALID",
        message: "CSV header is missing required columns",
        details: issues
      });
    }

    const validRows: CourseImportRow[] = [];
    const codeFirstSeenRow = new Map<string, number>();

    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
      const row = dataRows[rowIndex];
      const rowNumber = rowIndex + 2;
      const code = (row[idx.code] ?? "").trim();
      const title = (row[idx.title] ?? "").trim();
      const creditsRaw = (row[idx.credits] ?? "").trim();
      const credits = Number(creditsRaw);
      const descriptionValue = idx.description >= 0 ? row[idx.description] : "";
      const description = descriptionValue !== undefined && descriptionValue !== "" ? descriptionValue : null;

      const beforeIssueCount = issues.length;

      if (!code) {
        issues.push({ rowNumber, field: "code", message: "code is required" });
      }
      if (!title) {
        issues.push({ rowNumber, field: "title", message: "title is required" });
      }
      if (!creditsRaw) {
        issues.push({ rowNumber, field: "credits", message: "credits is required" });
      } else if (!Number.isInteger(credits) || credits <= 0) {
        issues.push({ rowNumber, field: "credits", message: "credits must be a positive integer" });
      }

      if (issues.length > beforeIssueCount) {
        continue;
      }

      const existingRow = codeFirstSeenRow.get(code);
      if (existingRow) {
        issues.push({
          rowNumber,
          field: "code",
          message: `Duplicate course code in CSV (first seen at row ${existingRow})`
        });
        continue;
      }

      codeFirstSeenRow.set(code, rowNumber);
      validRows.push({
        rowNumber,
        code,
        title,
        credits,
        description
      });
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        code: "CSV_ROW_INVALID",
        message: "CSV contains invalid rows",
        details: issues
      });
    }

    const uniqueCodes = Array.from(new Set(validRows.map((row) => row.code)));
    const existingCourses = await this.prisma.course.findMany({
      where: { code: { in: uniqueCodes } },
      select: { code: true }
    });
    const existingCodeSet = new Set(existingCourses.map((course) => course.code));

    for (const row of validRows) {
      if (existingCodeSet.has(row.code)) {
        issues.push({
          rowNumber: row.rowNumber,
          field: "code",
          message: "Course code already exists"
        });
      }
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        code: "CSV_ROW_INVALID",
        message: "CSV contains duplicate courses",
        details: issues
      });
    }

    if (input.dryRun) {
      const result: ImportResultPayload = {
        created: 0,
        dryRun: true,
        wouldCreate: validRows.length
      };
      if (cacheKey) this.setImportIdempotentResult(cacheKey, result);
      return result;
    }

    try {
      await this.runAdminTransactionWithRetry(async (tx) => {
        for (const row of validRows) {
          await tx.course.create({
            data: {
              code: row.code,
              title: row.title,
              credits: row.credits,
              description: row.description
            }
          });
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const conflicts = await this.prisma.course.findMany({
          where: { code: { in: uniqueCodes } },
          select: { code: true }
        });
        const conflictCodeSet = new Set(conflicts.map((course) => course.code));
        const raceIssues: CsvRowIssue[] = validRows
          .filter((row) => conflictCodeSet.has(row.code))
          .map((row) => ({
            rowNumber: row.rowNumber,
            field: "code",
            message: "Course code already exists"
          }));

        throw new BadRequestException({
          code: "CSV_ROW_INVALID",
          message: "CSV contains duplicate courses",
          details: raceIssues
        });
      }

      throw error;
    }

    const created = validRows.length;

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "course_import",
      metadata: { createdCount: created, dryRun: false }
    });

    const result: ImportResultPayload = { created };
    if (cacheKey) this.setImportIdempotentResult(cacheKey, result);
    return result;
  }

  async importSections(input: CsvImportInput, actorUserId: string) {
    const cacheKey = input.idempotencyKey
      ? this.getImportCacheKey("sections", actorUserId, input.idempotencyKey)
      : null;
    if (cacheKey) {
      const cached = this.getImportIdempotentResult(cacheKey);
      if (cached) return cached;
    }

    const rows = parseCsvRows(input.csv);
    if (rows.length < 2) {
      throw new BadRequestException({ code: "CSV_INVALID", message: "CSV must include header and rows" });
    }

    const [header, ...dataRows] = rows;
    const headerMap = new Map(header.map((name, index) => [name.trim(), index]));
    const idx = {
      termName: headerMap.get("termName") ?? -1,
      courseCode: headerMap.get("courseCode") ?? -1,
      sectionCode: headerMap.get("sectionCode") ?? -1,
      modality: headerMap.get("modality") ?? -1,
      capacity: headerMap.get("capacity") ?? -1,
      credits: headerMap.get("credits") ?? -1,
      instructorName: headerMap.get("instructorName") ?? -1,
      location: headerMap.get("location") ?? -1,
      requireApproval: headerMap.get("requireApproval") ?? -1,
      meetings: headerMap.get("meetings") ?? -1
    };

    const issues: CsvRowIssue[] = [];
    const requiredHeaders: Array<keyof typeof idx> = [
      "termName",
      "courseCode",
      "sectionCode",
      "modality",
      "capacity",
      "credits",
      "instructorName"
    ];

    for (const field of requiredHeaders) {
      if (idx[field] < 0) {
        issues.push({
          rowNumber: 1,
          field,
          message: `Missing required header "${field}"`
        });
      }
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        code: "CSV_ROW_INVALID",
        message: "CSV header is missing required columns",
        details: issues
      });
    }

    const validRows: SectionImportRow[] = [];
    const sectionKeySeenAt = new Map<string, number>();
    const allowedModalities = new Set<Modality>(["ONLINE", "ON_CAMPUS", "HYBRID"]);

    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
      const row = dataRows[rowIndex];
      const rowNumber = rowIndex + 2;
      const termName = (row[idx.termName] ?? "").trim();
      const courseCode = (row[idx.courseCode] ?? "").trim();
      const sectionCode = (row[idx.sectionCode] ?? "").trim();
      const modalityRaw = (row[idx.modality] ?? "").trim();
      const capacityRaw = (row[idx.capacity] ?? "").trim();
      const creditsRaw = (row[idx.credits] ?? "").trim();
      const instructorName = (row[idx.instructorName] ?? "").trim();
      const locationRaw = idx.location >= 0 ? row[idx.location] : "";
      const requireApprovalRaw = idx.requireApproval >= 0 ? (row[idx.requireApproval] ?? "").trim() : "";
      const meetingsRaw = idx.meetings >= 0 ? (row[idx.meetings] ?? "").trim() : "";

      const beforeIssueCount = issues.length;

      if (!termName) issues.push({ rowNumber, field: "termName", message: "termName is required" });
      if (!courseCode) issues.push({ rowNumber, field: "courseCode", message: "courseCode is required" });
      if (!sectionCode) issues.push({ rowNumber, field: "sectionCode", message: "sectionCode is required" });
      if (!modalityRaw) {
        issues.push({ rowNumber, field: "modality", message: "modality is required" });
      } else if (!allowedModalities.has(modalityRaw as Modality)) {
        issues.push({ rowNumber, field: "modality", message: "modality must be ONLINE, ON_CAMPUS, or HYBRID" });
      }

      const capacity = Number(capacityRaw);
      if (!capacityRaw) {
        issues.push({ rowNumber, field: "capacity", message: "capacity is required" });
      } else if (!Number.isInteger(capacity) || capacity <= 0) {
        issues.push({ rowNumber, field: "capacity", message: "capacity must be a positive integer" });
      }

      const credits = Number(creditsRaw);
      if (!creditsRaw) {
        issues.push({ rowNumber, field: "credits", message: "credits is required" });
      } else if (!Number.isInteger(credits) || credits <= 0) {
        issues.push({ rowNumber, field: "credits", message: "credits must be a positive integer" });
      }

      if (!instructorName) {
        issues.push({ rowNumber, field: "instructorName", message: "instructorName is required" });
      }

      const meetingTimes: SectionImportMeeting[] = [];
      if (meetingsRaw) {
        const meetingChunks = meetingsRaw
          .split(";")
          .map((chunk) => chunk.trim())
          .filter(Boolean);

        for (const chunk of meetingChunks) {
          const [weekdayRaw, startRaw, endRaw] = chunk.split("|").map((item) => item.trim());
          if (weekdayRaw === undefined || startRaw === undefined || endRaw === undefined) {
            issues.push({
              rowNumber,
              field: "meetings",
              message: `Invalid meetings format "${chunk}" (expected weekday|start|end)`
            });
            continue;
          }

          const weekday = Number(weekdayRaw);
          const startMinutes = Number(startRaw);
          const endMinutes = Number(endRaw);

          const validWeekday = Number.isInteger(weekday) && weekday >= 0 && weekday <= 6;
          const validStart = Number.isInteger(startMinutes) && startMinutes >= 0 && startMinutes <= 1439;
          const validEnd = Number.isInteger(endMinutes) && endMinutes >= 1 && endMinutes <= 1440;

          if (!validWeekday || !validStart || !validEnd || endMinutes <= startMinutes) {
            issues.push({
              rowNumber,
              field: "meetings",
              message: `Invalid meeting values "${chunk}" (weekday 0-6, 0<=start<end<=1440)`
            });
            continue;
          }

          meetingTimes.push({ weekday, startMinutes, endMinutes });
        }
      }

      if (issues.length > beforeIssueCount) {
        continue;
      }

      const sectionKey = `${termName}::${sectionCode}`;
      const seenAt = sectionKeySeenAt.get(sectionKey);
      if (seenAt) {
        issues.push({
          rowNumber,
          field: "sectionCode",
          message: `Duplicate section in CSV for term "${termName}" (first seen at row ${seenAt})`
        });
        continue;
      }
      sectionKeySeenAt.set(sectionKey, rowNumber);

      const requireApproval = requireApprovalRaw.toLowerCase() === "true";
      const location = locationRaw !== undefined && locationRaw !== "" ? locationRaw : null;

      validRows.push({
        rowNumber,
        termName,
        courseCode,
        sectionCode,
        modality: modalityRaw as Modality,
        capacity,
        credits,
        instructorName,
        location,
        requireApproval,
        meetingTimes
      });
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        code: "CSV_ROW_INVALID",
        message: "CSV contains invalid rows",
        details: issues
      });
    }

    const uniqueTermNames = Array.from(new Set(validRows.map((row) => row.termName)));
    const uniqueCourseCodes = Array.from(new Set(validRows.map((row) => row.courseCode)));

    const [terms, courses] = await Promise.all([
      this.prisma.term.findMany({
        where: { name: { in: uniqueTermNames } },
        select: { id: true, name: true }
      }),
      this.prisma.course.findMany({
        where: { code: { in: uniqueCourseCodes } },
        select: { id: true, code: true }
      })
    ]);

    const termByName = new Map(terms.map((term) => [term.name, term]));
    const courseByCode = new Map(courses.map((course) => [course.code, course]));

    for (const row of validRows) {
      if (!termByName.has(row.termName)) {
        issues.push({
          rowNumber: row.rowNumber,
          field: "termName",
          message: `Unknown term "${row.termName}"`
        });
      }
      if (!courseByCode.has(row.courseCode)) {
        issues.push({
          rowNumber: row.rowNumber,
          field: "courseCode",
          message: `Unknown course "${row.courseCode}"`
        });
      }
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        code: "CSV_ROW_INVALID",
        message: "CSV references missing terms/courses",
        details: issues
      });
    }

    const termIds = Array.from(new Set(validRows.map((row) => termByName.get(row.termName)?.id).filter((id): id is string => Boolean(id))));
    const sectionCodes = Array.from(new Set(validRows.map((row) => row.sectionCode)));

    const existingSections = await this.prisma.section.findMany({
      where: {
        termId: { in: termIds },
        sectionCode: { in: sectionCodes }
      },
      select: { termId: true, sectionCode: true }
    });

    const existingSectionKeySet = new Set(existingSections.map((item) => `${item.termId}::${item.sectionCode}`));
    for (const row of validRows) {
      const termId = termByName.get(row.termName)?.id;
      if (!termId) continue;
      const key = `${termId}::${row.sectionCode}`;
      if (existingSectionKeySet.has(key)) {
        issues.push({
          rowNumber: row.rowNumber,
          field: "sectionCode",
          message: `Section "${row.sectionCode}" already exists in term "${row.termName}"`
        });
      }
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        code: "CSV_ROW_INVALID",
        message: "CSV contains duplicate sections",
        details: issues
      });
    }

    if (input.dryRun) {
      const result: ImportResultPayload = {
        created: 0,
        dryRun: true,
        wouldCreate: validRows.length
      };
      if (cacheKey) this.setImportIdempotentResult(cacheKey, result);
      return result;
    }

    try {
      await this.runAdminTransactionWithRetry(async (tx) => {
        for (const row of validRows) {
          const termId = termByName.get(row.termName)?.id;
          const courseId = courseByCode.get(row.courseCode)?.id;
          if (!termId || !courseId) {
            throw new BadRequestException({
              code: "CSV_ROW_INVALID",
              message: "CSV references missing terms/courses"
            });
          }

          await tx.section.create({
            data: {
              termId,
              courseId,
              sectionCode: row.sectionCode,
              modality: row.modality,
              capacity: row.capacity,
              credits: row.credits,
              instructorName: row.instructorName,
              location: row.location,
              requireApproval: row.requireApproval,
              meetingTimes: {
                create: row.meetingTimes
              }
            }
          });
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BadRequestException({
          code: "CSV_ROW_INVALID",
          message: "CSV contains duplicate sections",
          details: [
            {
              rowNumber: 0,
              field: "sectionCode",
              message: "One or more sections already exist (race detected)"
            }
          ]
        });
      }
      throw error;
    }

    const created = validRows.length;

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "section_import",
      metadata: { createdCount: created, dryRun: false }
    });

    const result: ImportResultPayload = { created };
    if (cacheKey) this.setImportIdempotentResult(cacheKey, result);
    return result;
  }

  async getAtRiskStudents(termId?: string) {
    // Students considered at-risk: GPA < 2.0, or dropped 2+ courses this term, or no grades despite COMPLETED status
    const term = termId
      ? await this.prisma.term.findUnique({ where: { id: termId } })
      : await this.prisma.term.findFirst({ orderBy: { startDate: "desc" } });

    if (!term) return [];

    const enrollments = await this.prisma.enrollment.findMany({
      where: { termId: term.id, deletedAt: null },
      include: {
        section: { select: { credits: true, course: { select: { code: true, title: true } } } },
        student: {
          select: {
            id: true,
            email: true,
            studentId: true,
            studentProfile: { select: { legalName: true } }
          }
        }
      }
    });

    // Group by student
    const byStudent = new Map<string, typeof enrollments>();
    for (const e of enrollments) {
      if (!byStudent.has(e.studentId)) byStudent.set(e.studentId, []);
      byStudent.get(e.studentId)!.push(e);
    }

    const gradePoints: Record<string, number> = {
      "A+": 4.0, A: 4.0, "A-": 3.7,
      "B+": 3.3, B: 3.0, "B-": 2.7,
      "C+": 2.3, C: 2.0, "C-": 1.7,
      "D+": 1.3, D: 1.0, "D-": 0.7,
      F: 0.0, W: 0.0
    };

    const results: Array<{
      student: { id: string; email: string; legalName: string; studentId: string | null };
      termGpa: number | null;
      droppedCount: number;
      enrolledCount: number;
      riskFlags: string[];
    }> = [];

    for (const [, rows] of byStudent.entries()) {
      const s = rows[0].student;
      const student = {
        id: s.id,
        email: s.email,
        studentId: s.studentId,
        legalName: s.studentProfile?.legalName ?? s.email
      };
      const completed = rows.filter((r) => r.status === "COMPLETED" && r.finalGrade);
      const dropped = rows.filter((r) => r.status === "DROPPED");
      const enrolled = rows.filter((r) => r.status === "ENROLLED");

      let termGpa: number | null = null;
      if (completed.length > 0) {
        let totalPoints = 0, totalCredits = 0;
        for (const r of completed) {
          const pts = gradePoints[r.finalGrade ?? ""] ?? null;
          if (pts !== null) {
            totalPoints += pts * r.section.credits;
            totalCredits += r.section.credits;
          }
        }
        termGpa = totalCredits > 0 ? Math.round((totalPoints / totalCredits) * 100) / 100 : null;
      }

      const riskFlags: string[] = [];
      if (termGpa !== null && termGpa < 2.0) riskFlags.push("GPA < 2.0");
      if (dropped.length >= 2) riskFlags.push(`Dropped ${dropped.length} courses`);
      if (enrolled.length === 0 && completed.length === 0) riskFlags.push("No active enrollment");

      if (riskFlags.length > 0) {
        results.push({ student, termGpa, droppedCount: dropped.length, enrolledCount: enrolled.length, riskFlags });
      }
    }

    return results.sort((a, b) => (a.termGpa ?? 4) - (b.termGpa ?? 4));
  }

  async getInstructorAnalytics() {
    const sections = await this.prisma.section.findMany({
      select: {
        id: true,
        instructorName: true,
        course: { select: { code: true } },
        enrollments: {
          where: { deletedAt: null, status: { in: ["ENROLLED", "COMPLETED"] } },
          select: { status: true }
        },
        ratings: {
          select: { rating: true, difficulty: true, workload: true, wouldRecommend: true }
        }
      }
    });

    type InstructorStats = {
      sectionCount: number;
      totalEnrolled: number;
      totalCompleted: number;
      courses: Set<string>;
      ratings: number[];
      difficulties: number[];
      workloads: number[];
      recommends: number;
      ratingCount: number;
    };

    const map = new Map<string, InstructorStats>();
    for (const sec of sections) {
      const name = sec.instructorName?.trim();
      if (!name) continue;
      if (!map.has(name)) {
        map.set(name, { sectionCount: 0, totalEnrolled: 0, totalCompleted: 0, courses: new Set(), ratings: [], difficulties: [], workloads: [], recommends: 0, ratingCount: 0 });
      }
      const s = map.get(name)!;
      s.sectionCount++;
      s.courses.add(sec.course.code.replace(/\d+.*/, ""));
      s.totalEnrolled += sec.enrollments.filter((e) => e.status === "ENROLLED").length;
      s.totalCompleted += sec.enrollments.filter((e) => e.status === "COMPLETED").length;
      for (const r of sec.ratings) {
        s.ratings.push(r.rating);
        if (r.difficulty != null) s.difficulties.push(r.difficulty);
        if (r.workload != null) s.workloads.push(r.workload);
        if (r.wouldRecommend === true) s.recommends++;
        s.ratingCount++;
      }
    }

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    return Array.from(map.entries())
      .map(([name, s]) => ({
        name,
        sectionCount: s.sectionCount,
        totalEnrolled: s.totalEnrolled,
        totalCompleted: s.totalCompleted,
        depts: [...s.courses].sort(),
        ratingCount: s.ratingCount,
        avgRating: avg(s.ratings),
        avgDifficulty: avg(s.difficulties),
        avgWorkload: avg(s.workloads),
        recommendPct: s.ratingCount > 0 ? Math.round((s.recommends / s.ratingCount) * 100) : null
      }))
      .sort((a, b) => b.sectionCount - a.sectionCount);
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

    const GRADE_POINTS: Record<string, number> = {
      "A+": 4, A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7,
      "C+": 2.3, C: 2, "C-": 1.7, "D+": 1.3, D: 1, "D-": 0.7, F: 0
    };

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

  // ── Cohort Messaging ───────────────────────────────────────────────
  async sendCohortMessage(cohortYear: string, subject: string, body: string, adminUserId: string) {
    const yearNum = parseInt(cohortYear, 10);
    const students = await this.prisma.user.findMany({
      where: {
        role: "STUDENT",
        deletedAt: null,
        createdAt: {
          gte: new Date(`${yearNum}-01-01T00:00:00Z`),
          lt: new Date(`${yearNum + 1}-01-01T00:00:00Z`)
        }
      },
      select: { id: true, email: true, studentProfile: { select: { legalName: true } } }
    });

    let sent = 0;
    for (const student of students) {
      try {
        await this.notificationsService.sendMail({
          to: student.email,
          subject,
          text: body,
          html: `<p>${body.replace(/\n/g, "<br>")}</p>`
        });
        await this.prisma.notificationLog.create({
          data: {
            userId: student.id,
            type: "COHORT_MESSAGE",
            subject,
            body: body.slice(0, 500)
          }
        });
        sent++;
      } catch {
        /* ignore individual send failures */
      }
    }

    await this.auditService.log({
      actorUserId: adminUserId,
      action: "admin_action",
      entityType: "cohort_message",
      entityId: cohortYear,
      metadata: { cohortYear, subject, total: students.length, sent }
    });

    return { cohortYear, total: students.length, sent };
  }

  // ── Grade Appeals ──────────────────────────────────────────────────
  async listGradeAppeals(status?: string) {
    return this.prisma.gradeAppeal.findMany({
      where: status ? { status } : undefined,
      include: {
        student: {
          select: {
            id: true,
            email: true,
            studentProfile: { select: { legalName: true } }
          }
        },
        enrollment: {
          include: {
            section: {
              include: {
                course: { select: { code: true, title: true } },
                term: { select: { name: true } }
              }
            }
          }
        },
        reviewedBy: { select: { id: true, email: true } }
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }]
    });
  }

  async reviewGradeAppeal(
    adminUserId: string,
    appealId: string,
    decision: "APPROVED" | "REJECTED",
    adminNote: string,
    newGrade?: string
  ) {
    const appeal = await this.prisma.gradeAppeal.findUnique({ where: { id: appealId } });
    if (!appeal) throw new NotFoundException({ code: "APPEAL_NOT_FOUND" });
    if (appeal.status !== "PENDING") throw new BadRequestException({ code: "APPEAL_ALREADY_RESOLVED" });

    await this.prisma.$transaction(async (tx) => {
      await tx.gradeAppeal.update({
        where: { id: appealId },
        data: { status: decision, adminNote, reviewedById: adminUserId, reviewedAt: new Date() }
      });

      if (decision === "APPROVED" && newGrade) {
        await tx.enrollment.update({
          where: { id: appeal.enrollmentId },
          data: { finalGrade: newGrade }
        });
      }
    });

    return { id: appealId, status: decision };
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
  private readonly GRADE_POINTS_MAP: Record<string, number> = {
    "A+": 4, A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7,
    "C+": 2.3, C: 2, "C-": 1.7, "D+": 1.3, D: 1, "D-": 0.7, F: 0
  };

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
      const pts = this.GRADE_POINTS_MAP[e.finalGrade];
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
    if (!student) throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "Student not found" });

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
    if (!student) throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "Student not found" });

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
          enrolled: Number(r.enrolledCount), waitlistCount: 0, avgPosition: 0, maxPosition: 0
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
    // Raw SQL to avoid Prisma type issues with complex includes
    type GradRow = {
      userId: string; email: string; legalName: string | null; programMajor: string | null;
      enrollStatus: string; credits: number; finalGrade: string | null;
    };
    const rows = await this.prisma.$queryRaw<GradRow[]>`
      SELECT u.id AS "userId", u.email, sp."legalName", sp."programMajor",
             e.status AS "enrollStatus", c.credits, e."finalGrade"
      FROM "User" u
      LEFT JOIN "StudentProfile" sp ON sp."userId" = u.id
      LEFT JOIN "Enrollment" e ON e."studentId" = u.id AND e."deletedAt" IS NULL
      LEFT JOIN "Section" s ON s.id = e."sectionId"
      LEFT JOIN "Course" c ON c.id = s."courseId"
      WHERE u.role = 'STUDENT' AND u."deletedAt" IS NULL
    `;

    type AppealRow = { studentId: string; id: string };
    const appeals = await this.prisma.$queryRaw<AppealRow[]>`
      SELECT "studentId", id FROM "GradeAppeal" WHERE status = 'PENDING'
    `;
    const appealsByStudent = new Map<string, number>();
    for (const a of appeals) {
      appealsByStudent.set(a.studentId, (appealsByStudent.get(a.studentId) ?? 0) + 1);
    }

    // Aggregate per student
    const studentMap = new Map<string, {
      userId: string; email: string; legalName: string | null; programMajor: string | null;
      creditsDone: number; creditsInProgress: number; missingGrades: number; pendingApproval: number;
    }>();

    for (const r of rows) {
      if (!studentMap.has(r.userId)) {
        studentMap.set(r.userId, {
          userId: r.userId, email: r.email, legalName: r.legalName, programMajor: r.programMajor,
          creditsDone: 0, creditsInProgress: 0, missingGrades: 0, pendingApproval: 0
        });
      }
      const s = studentMap.get(r.userId)!;
      if (!r.enrollStatus) continue; // no enrollments
      if (r.enrollStatus === "COMPLETED") {
        s.creditsDone += r.credits ?? 0;
        if (!r.finalGrade) s.missingGrades++;
      } else if (r.enrollStatus === "ENROLLED") {
        s.creditsInProgress += r.credits ?? 0;
      } else if (r.enrollStatus === "PENDING_APPROVAL") {
        s.pendingApproval++;
      }
    }

    return Array.from(studentMap.values()).map((s) => {
      const openAppeals = appealsByStudent.get(s.userId) ?? 0;
      const eligible = s.creditsDone >= minCredits && s.missingGrades === 0 && openAppeals === 0 && s.pendingApproval === 0;
      return {
        userId: s.userId, email: s.email, name: s.legalName, department: s.programMajor,
        creditsDone: s.creditsDone, creditsInProgress: s.creditsInProgress,
        creditsNeeded: Math.max(0, minCredits - s.creditsDone),
        missingGrades: s.missingGrades, openAppeals, pendingApproval: s.pendingApproval, eligible
      };
    }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.creditsDone - a.creditsDone);
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
      const count = Number(row.count);
      grid[row.dow][row.hour] = count;
      if (count > maxCount) maxCount = count;
    }

    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const totalRegistrations = rows.reduce((s, r) => s + Number(r.count), 0);

    // Top slots
    const slots = rows
      .map((r) => ({ day: dayLabels[r.dow], hour: r.hour, count: Number(r.count) }))
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
      bucket.totalEnrolled += Number(row.enrolled);
      bucket.totalCapacity += Number(row.capacity);
      bucket.sections.push({
        sectionId: row.sectionId,
        sectionCode: row.sectionCode,
        courseCode: row.courseCode,
        courseTitle: row.courseTitle,
        capacity: Number(row.capacity),
        enrolled: Number(row.enrolled),
        waitlisted: Number(row.waitlisted),
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
      capacity: Number(row.capacity),
      enrolled: Number(row.enrolled),
      waitlisted: Number(row.waitlisted),
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
    const counts = new Map(breakdown.map((row) => [row.grade, Number(row.count)]));

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
      throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "Section not found" });
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
    const counts = new Map(gradeRows.map((row) => [row.grade, Number(row.count)]));

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
      const total = Number(r.enrolled) + Number(r.completed) + Number(r.dropped) + Number(r.waitlisted);
      courseMap.get(r.courseId)!.terms.push({
        termId: r.termId, termName: r.termName,
        enrolled: Number(r.enrolled), completed: Number(r.completed),
        dropped: Number(r.dropped), waitlisted: Number(r.waitlisted),
        capacity: Number(r.capacity), total,
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

    const GRADE_POINTS: Record<string, number> = {
      "A+": 4, "A": 4, "A-": 3.7, "B+": 3.3, "B": 3, "B-": 2.7,
      "C+": 2.3, "C": 2, "C-": 1.7, "D+": 1.3, "D": 1, "D-": 0.7, "F": 0
    };

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
      studentCount: Number(r.studentCount),
      avgGpa: Number(r.avgGpa ?? 0),
      totalCredits: Number(r.totalCredits),
      activeCount: Number(r.activeCount),
      completedCount: Number(r.completedCount),
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
      enrolled: Number(r.enrolled),
      completed: Number(r.completed),
      dropped: Number(r.dropped),
      waitlisted: Number(r.waitlisted),
      total: Number(r.enrolled) + Number(r.completed) + Number(r.dropped) + Number(r.waitlisted),
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
    const termFilter = termId ? Prisma.sql`AND s."termId" = ${termId}` : Prisma.sql``;
    const statusFilter = status ? Prisma.sql`AND e.status = ${status}` : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<{
      enrollmentId: string;
      studentEmail: string;
      studentId: string;
      courseCode: string;
      courseTitle: string;
      sectionCode: string;
      termName: string;
      status: string;
      finalGrade: string | null;
      enrolledAt: Date;
      droppedAt: Date | null;
    }[]>`
      SELECT
        e.id AS "enrollmentId",
        u.email AS "studentEmail",
        u.id AS "studentId",
        c.code AS "courseCode",
        c.title AS "courseTitle",
        s."sectionCode",
        t.name AS "termName",
        e.status,
        e."finalGrade",
        e."createdAt" AS "enrolledAt",
        e."droppedAt"
      FROM "Enrollment" e
      JOIN "User" u ON u.id = e."studentId"
      JOIN "Section" s ON s.id = e."sectionId"
      JOIN "Course" c ON c.id = s."courseId"
      JOIN "Term" t ON t.id = s."termId"
      WHERE e."deletedAt" IS NULL
        ${termFilter}
        ${statusFilter}
      ORDER BY e."createdAt" DESC
      LIMIT 500
    `;

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
      totalCredits: Number(r.totalCredits),
      gpa: Number(r.gpa ?? 0),
      completedCourses: Number(r.completedCourses),
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
      instructorCount: Number(r.instructorCount),
      sectionCount: Number(r.sectionCount),
      totalCapacity: Number(r.totalCapacity),
      totalEnrolled: Number(r.totalEnrolled),
      utilization: Number(r.totalCapacity) > 0 ? Math.round((Number(r.totalEnrolled) / Number(r.totalCapacity)) * 100) : 0,
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
      newEnrollments: Number(r.newEnrollments),
      newDrops: Number(r.newDrops),
      cumulative: Number(r.cumulative),
      net: Number(r.newEnrollments) - Number(r.newDrops),
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

  // ─── Grade Curve Preview Tool ─────────────────────────────────────────────────
  async previewGradeCurve(sectionId: string, steps: number) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { sectionId, deletedAt: null, status: "COMPLETED", finalGrade: { not: null } },
      select: { id: true, finalGrade: true, studentId: true }
    });

    const GRADE_POINTS: Record<string, number> = {
      "A+": 4, "A": 4, "A-": 3.7, "B+": 3.3, "B": 3, "B-": 2.7,
      "C+": 2.3, "C": 2, "C-": 1.7, "D+": 1.3, "D": 1, "D-": 0.7, "F": 0, "W": 0
    };
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
    const GRADE_POINTS: Record<string, number> = {
      "A+": 4, "A": 4, "A-": 3.7, "B+": 3.3, "B": 3, "B-": 2.7,
      "C+": 2.3, "C": 2, "C-": 1.7, "D+": 1.3, "D": 1, "D-": 0.7, "F": 0
    };
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
      const cap = Number(r.capacity);
      const enrolled = Number(r.enrolled);
      const completed = Number(r.completed);
      const utilization = cap > 0 ? Math.round(((enrolled + completed) / cap) * 100) : 0;
      return {
        termId: r.termId, termName: r.termName,
        courseCode: r.courseCode, courseTitle: r.courseTitle,
        sectionId: r.sectionId, capacity: cap,
        enrolled, completed,
        dropped: Number(r.dropped), waitlisted: Number(r.waitlisted),
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
        enrolled: Number(r.enrolled), completed: Number(r.completed),
        dropped: Number(r.dropped), total: Number(r.total),
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
      sections: Number(r.sections),
      totalStudents: Number(r.totalStudents),
      completedStudents: Number(r.completedStudents),
      droppedStudents: Number(r.droppedStudents),
      avgGpa: r.avgGpa !== null ? Number(r.avgGpa) : null,
      dropRate: Number(r.totalStudents) > 0
        ? Math.round((Number(r.droppedStudents) / Number(r.totalStudents)) * 100)
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
        students: Number(r.students),
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
      const termCount = Number(row.coCount);
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
          cohortSize: Number(row.cohortSize),
          retention: []
        });
      }

      const cohort = cohorts.get(row.cohortTermId)!;
      const activeStudents = Number(row.activeStudents);
      const cohortSize = Number(row.cohortSize);
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
        message: "sectionId and at least one studentId are required"
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
        message: "At least one enrollmentId is required"
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
        message: "studentIds and a valid status are required"
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
      const openAt = new Date(term.registrationOpenAt).getTime();
      const closeAt = new Date(term.registrationCloseAt).getTime();
      const status = now < openAt ? "scheduled" : now > closeAt ? "closed" : "open";
      return {
        ...term,
        status
      };
    });
  }

  async updateRegistrationWindow(termId: string, openAt: string, closeAt: string, actorUserId: string) {
    if (!termId.trim() || !openAt || !closeAt) {
      throw new BadRequestException({
        code: "WINDOW_INPUT_INVALID",
        message: "termId, openAt, and closeAt are required"
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
    const activeTerm =
      (await this.prisma.term.findFirst({
        where: {
          startDate: { lte: now },
          endDate: { gte: now }
        },
        orderBy: { startDate: "desc" },
        select: { id: true }
      })) ??
      (await this.prisma.term.findFirst({
        orderBy: { startDate: "desc" },
        select: { id: true }
      }));

    const [totalStudents, totalEnrollments] = await Promise.all([
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
        : Promise.resolve(0)
    ]);

    return {
      uptime: process.uptime(),
      memUsed: process.memoryUsage().heapUsed,
      memTotal: process.memoryUsage().heapTotal,
      nodeVersion: process.version,
      timestamp: new Date(),
      totalStudents,
      totalEnrollments
    };
  }
}
