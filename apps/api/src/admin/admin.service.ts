import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EnrollmentStatus, Modality, Prisma } from "@prisma/client";
import argon2 from "argon2";
import { createHash } from "crypto";
import {
  assignAdvisorSchema,
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

type CreateTermInput = z.infer<typeof createTermSchema>;
type CreateCourseInput = z.infer<typeof createCourseSchema>;
type CreateSectionInput = z.infer<typeof createSectionSchema>;
type CreateFacultyInput = z.infer<typeof createFacultySchema>;
type CreateAdvisorInput = z.infer<typeof createAdvisorSchema>;
type AssignAdvisorInput = z.infer<typeof assignAdvisorSchema>;
type CreateInviteCodeInput = z.infer<typeof createInviteCodeSchema>;
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
    private readonly notificationsService: NotificationsService
  ) {}

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
        credits: input.credits
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
        credits: input.credits ?? course.credits
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
}
