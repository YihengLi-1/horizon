import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Modality, Prisma } from "@prisma/client";
import argon2 from "argon2";
import {
  createCourseSchema,
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

type CreateTermInput = z.infer<typeof createTermSchema>;
type CreateCourseInput = z.infer<typeof createCourseSchema>;
type CreateSectionInput = z.infer<typeof createSectionSchema>;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

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
    const [students, terms, courses, sections, enrollments, waitlist] = await Promise.all([
      this.prisma.user.count({ where: { role: "STUDENT" } }),
      this.prisma.term.count(),
      this.prisma.course.count(),
      this.prisma.section.count(),
      this.prisma.enrollment.count(),
      this.prisma.enrollment.count({ where: { status: "WAITLISTED" } })
    ]);

    return { students, terms, courses, sections, enrollments, waitlist };
  }

  async listTerms() {
    return this.prisma.term.findMany({ orderBy: { startDate: "desc" } });
  }

  async createTerm(input: CreateTermInput, actorUserId: string) {
    const term = await this.prisma.term.create({
      data: {
        name: input.name,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        registrationOpenAt: new Date(input.registrationOpenAt),
        registrationCloseAt: new Date(input.registrationCloseAt),
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

  async listCourses() {
    return this.prisma.course.findMany({
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
        data: input.prerequisiteCourseIds.map((prerequisiteCourseId) => ({
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
          data: input.prerequisiteCourseIds.map((prerequisiteCourseId) => ({
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
    await this.prisma.course.delete({ where: { id } });
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
    return this.prisma.section.findMany({
      include: {
        term: true,
        course: true,
        meetingTimes: true,
        enrollments: true
      },
      orderBy: [{ term: { startDate: "desc" } }, { sectionCode: "asc" }]
    });
  }

  async createSection(input: CreateSectionInput, actorUserId: string) {
    const section = await this.prisma.section.create({
      data: {
        termId: input.termId,
        courseId: input.courseId,
        sectionCode: input.sectionCode,
        modality: input.modality,
        capacity: input.capacity,
        credits: input.credits,
        instructorName: input.instructorName,
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
    const section = await this.prisma.section.findUnique({ where: { id }, include: { meetingTimes: true } });
    if (!section) {
      throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "Section not found" });
    }

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
          instructorName: input.instructorName ?? section.instructorName,
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
          meetingTimes: true,
          enrollments: true
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

  async listEnrollments(termId?: string, sectionId?: string) {
    return this.prisma.enrollment.findMany({
      where: {
        termId: termId || undefined,
        sectionId: sectionId || undefined
      },
      include: {
        student: { include: { studentProfile: true } },
        term: true,
        section: { include: { course: true, meetingTimes: true } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async updateEnrollment(id: string, input: { status?: string; finalGrade?: string }, actorUserId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id } });
    if (!enrollment) {
      throw new NotFoundException({ code: "ENROLLMENT_NOT_FOUND", message: "Enrollment not found" });
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
        status: "WAITLISTED",
        sectionId: sectionId || undefined
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

    return this.runAdminTransactionWithRetry(async (tx) => {
      const section = await tx.section.findUnique({
        where: { id: input.sectionId },
        select: { id: true, capacity: true }
      });

      if (!section) {
        throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "Section not found" });
      }

      const enrolledCount = await tx.enrollment.count({
        where: { sectionId: input.sectionId, status: "ENROLLED" }
      });

      const availableSeatsBefore = Math.max(0, section.capacity - enrolledCount);
      const promoteN = Math.min(availableSeatsBefore, requestedCount);

      const waitlistedToPromote = await tx.enrollment.findMany({
        where: {
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

      await tx.auditLog.create({
        data: {
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
  }

  async updateGrade(input: UpdateGradeInput, actorUserId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: input.enrollmentId } });
    if (!enrollment) {
      throw new NotFoundException({ code: "ENROLLMENT_NOT_FOUND", message: "Enrollment not found" });
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

    return updated;
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

  async listAuditLogs(limit = 200) {
    return this.prisma.auditLog.findMany({
      take: limit,
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
    });
  }

  async importStudents(input: CsvImportInput, actorUserId: string) {
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

    const passwordHashes = await Promise.all(validRows.map((row) => argon2.hash(row.password)));
    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
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

    return { created: createdCount };
  }

  async importCourses(input: CsvImportInput, actorUserId: string) {
    const rows = parseCsvRows(input.csv);
    if (rows.length < 2) {
      throw new BadRequestException({ code: "CSV_INVALID", message: "CSV must include header and rows" });
    }

    const [header, ...dataRows] = rows;
    const idx = {
      code: header.indexOf("code"),
      title: header.indexOf("title"),
      credits: header.indexOf("credits"),
      description: header.indexOf("description")
    };

    let created = 0;
    for (const row of dataRows) {
      const code = row[idx.code];
      const title = row[idx.title];
      const credits = Number(row[idx.credits] ?? 0);
      const description = row[idx.description] ?? null;
      if (!code || !title || !credits) continue;

      const existing = await this.prisma.course.findUnique({ where: { code } });
      if (existing) continue;

      await this.prisma.course.create({
        data: {
          code,
          title,
          credits,
          description
        }
      });
      created += 1;
    }

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "course_import",
      metadata: { created }
    });

    return { created };
  }

  async importSections(input: CsvImportInput, actorUserId: string) {
    const rows = parseCsvRows(input.csv);
    if (rows.length < 2) {
      throw new BadRequestException({ code: "CSV_INVALID", message: "CSV must include header and rows" });
    }

    const [header, ...dataRows] = rows;
    const idx = {
      termName: header.indexOf("termName"),
      courseCode: header.indexOf("courseCode"),
      sectionCode: header.indexOf("sectionCode"),
      modality: header.indexOf("modality"),
      capacity: header.indexOf("capacity"),
      credits: header.indexOf("credits"),
      instructorName: header.indexOf("instructorName"),
      location: header.indexOf("location"),
      requireApproval: header.indexOf("requireApproval"),
      meetings: header.indexOf("meetings")
    };

    let created = 0;

    for (const row of dataRows) {
      const termName = row[idx.termName];
      const courseCode = row[idx.courseCode];
      const sectionCode = row[idx.sectionCode];
      const modality = row[idx.modality] as Modality;
      const capacity = Number(row[idx.capacity]);
      const credits = Number(row[idx.credits]);
      const instructorName = row[idx.instructorName];
      const location = row[idx.location] || null;
      const requireApproval = (row[idx.requireApproval] || "false").toLowerCase() === "true";
      const meetingsRaw = row[idx.meetings] || "";

      if (!termName || !courseCode || !sectionCode || !modality || !capacity || !credits || !instructorName) {
        continue;
      }

      const term = await this.prisma.term.findFirst({ where: { name: termName } });
      const course = await this.prisma.course.findUnique({ where: { code: courseCode } });
      if (!term || !course) continue;

      const existing = await this.prisma.section.findFirst({ where: { termId: term.id, sectionCode } });
      if (existing) continue;

      const meetingTimes = meetingsRaw
        .split(";")
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((chunk) => {
          const [weekday, startMinutes, endMinutes] = chunk.split("|");
          return {
            weekday: Number(weekday),
            startMinutes: Number(startMinutes),
            endMinutes: Number(endMinutes)
          };
        });

      await this.prisma.section.create({
        data: {
          termId: term.id,
          courseId: course.id,
          sectionCode,
          modality,
          capacity,
          credits,
          instructorName,
          location,
          requireApproval,
          meetingTimes: { create: meetingTimes }
        }
      });
      created += 1;
    }

    await this.auditService.log({
      actorUserId,
      action: "admin_crud",
      entityType: "section_import",
      metadata: { created }
    });

    return { created };
  }
}
