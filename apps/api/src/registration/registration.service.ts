import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { EnrollmentStatus, Prisma } from "@prisma/client";
import { Request } from "express";
import { addCartItemSchema, dropEnrollmentSchema, submitCartSchema } from "@sis/shared";
import { z } from "zod";
import { AuditService } from "../audit/audit.service";
import { isPassingGrade } from "../common/grade.utils";
import { PrismaService } from "../common/prisma.service";
import { dispatch } from "../common/webhook";
import { GovernanceService } from "../governance/governance.service";
import { NotificationsService } from "../notifications/notifications.service";

type AddCartInput = z.infer<typeof addCartItemSchema>;
type SubmitCartInput = z.infer<typeof submitCartSchema>;
type DropEnrollmentInput = z.infer<typeof dropEnrollmentSchema>;

type Meeting = {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
};

type SubmitIssue = {
  sectionId: string;
  sectionCode: string;
  courseCode: string;
  reasonCode: string;
  message: string;
};

type SubmitPreview = {
  sectionId: string;
  sectionCode: string;
  courseCode: string;
  status: EnrollmentStatus;
  waitlistPosition: number | null;
  pendingReason?: "CREDIT_OVERLOAD" | "SECTION_APPROVAL" | null;
};

type CartItemWithSection = Prisma.CartItemGetPayload<{
  include: {
    section: {
      include: {
        term: true;
        meetingTimes: true;
        course: {
          include: {
            prerequisiteLinks: {
              include: {
                prerequisiteCourse: {
                  select: {
                    code: true;
                  };
                };
              };
            };
          };
        };
      };
    };
  };
}>;

type ExistingEnrollmentWithMeetings = Prisma.EnrollmentGetPayload<{
  include: {
    section: {
      include: {
        meetingTimes: true;
      };
    };
  };
}>;

type CompletedEnrollmentWithCourse = Prisma.EnrollmentGetPayload<{
  include: {
    section: {
      include: {
        course: true;
      };
    };
  };
}>;

export function hasMeetingConflict(a: Meeting[], b: Meeting[]): boolean {
  return a.some((m1) =>
    b.some((m2) => m1.weekday === m2.weekday && m1.startMinutes < m2.endMinutes && m2.startMinutes < m1.endMinutes)
  );
}

@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly governanceService: GovernanceService
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

  private async runEnrollmentTransactionWithRetry<T>(
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

  private async getSectionEnrollmentStats(
    client: PrismaService | Prisma.TransactionClient,
    sectionIds: string[]
  ): Promise<{
    enrolledCountBySection: Map<string, number>;
    maxWaitlistPositionBySection: Map<string, number>;
  }> {
    if (sectionIds.length === 0) {
      return {
        enrolledCountBySection: new Map<string, number>(),
        maxWaitlistPositionBySection: new Map<string, number>()
      };
    }

    const [activeCounts, waitlistMaxRows] = await Promise.all([
      client.enrollment.groupBy({
        by: ["sectionId"],
        where: {
          deletedAt: null,
          sectionId: { in: sectionIds },
          status: { in: ["ENROLLED"] }
        },
        _count: { _all: true }
      }),
      client.enrollment.groupBy({
        by: ["sectionId"],
        where: {
          deletedAt: null,
          sectionId: { in: sectionIds },
          status: "WAITLISTED"
        },
        _max: { waitlistPosition: true }
      })
    ]);

    const enrolledCountBySection = new Map<string, number>();
    for (const row of activeCounts) {
      enrolledCountBySection.set(row.sectionId, row._count._all);
    }

    const maxWaitlistPositionBySection = new Map<string, number>();
    for (const row of waitlistMaxRows) {
      maxWaitlistPositionBySection.set(row.sectionId, row._max.waitlistPosition ?? 0);
    }

    return { enrolledCountBySection, maxWaitlistPositionBySection };
  }

  private async lockSectionsForUpdate(tx: Prisma.TransactionClient, sectionIds: string[]): Promise<void> {
    if (sectionIds.length === 0) return;
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "Section" WHERE id IN (${Prisma.join(sectionIds)}) FOR UPDATE`
    );
  }

  private getPassedCourseIds(completedEnrollments: CompletedEnrollmentWithCourse[]): Set<string> {
    return new Set(
      completedEnrollments
        .filter((enrollment) => isPassingGrade(enrollment.finalGrade))
        .map((enrollment) => enrollment.section.courseId)
    );
  }

  private async getEffectiveMaxCredits(defaultMaxCredits: number): Promise<number> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: "max_credits_per_term" },
      select: { value: true }
    });
    const parsed = Number(setting?.value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMaxCredits;
  }

  private async getAllowedMaxCredits(
    client: PrismaService | Prisma.TransactionClient,
    studentId: string,
    termId: string,
    defaultMaxCredits: number
  ): Promise<number> {
    return this.governanceService.getApprovedCreditLimit(client, studentId, termId, defaultMaxCredits);
  }

  private deriveStudentCohortYear(studentId: string | null | undefined, createdAt: Date | null | undefined): number {
    const idMatch = studentId?.match(/^U(\d{2})/i);
    if (idMatch) {
      const yy = Number(idMatch[1]);
      return yy >= 80 ? 1900 + yy : 2000 + yy;
    }
    return createdAt?.getUTCFullYear() ?? new Date().getUTCFullYear();
  }

  private getRegistrationPriorityOffsetDays(cohortYear: number): number {
    if (cohortYear <= 2022) return 0;
    if (cohortYear === 2023) return 2;
    if (cohortYear === 2024) return 4;
    return 6;
  }

  private getRegistrationPriorityLabel(cohortYear: number): string {
    if (cohortYear <= 2022) return "大四";
    if (cohortYear === 2023) return "大三";
    if (cohortYear === 2024) return "大二";
    return "大一";
  }

  private async getStudentRegistrationWindowInfo(
    client: PrismaService | Prisma.TransactionClient,
    studentId: string,
    term: {
      id: string;
      registrationOpenAt: Date;
      registrationCloseAt: Date;
    }
  ) {
    const student = await client.user.findUnique({
      where: { id: studentId },
      select: {
        studentId: true,
        createdAt: true
      }
    });

    const cohortYear = this.deriveStudentCohortYear(student?.studentId, student?.createdAt);
    const offsetDays = this.getRegistrationPriorityOffsetDays(cohortYear);
    const openAt = new Date(term.registrationOpenAt.getTime() + offsetDays * 24 * 60 * 60 * 1000);

    return {
      openAt,
      closeAt: term.registrationCloseAt,
      cohortYear,
      offsetDays,
      priorityLabel: this.getRegistrationPriorityLabel(cohortYear)
    };
  }

  private async assertStudentRegistrationWindowOpen(
    client: PrismaService | Prisma.TransactionClient,
    studentId: string,
    term: {
      id: string;
      registrationOpenAt: Date;
      registrationCloseAt: Date;
    }
  ) {
    const info = await this.getStudentRegistrationWindowInfo(client, studentId, term);
    const now = Date.now();
    if (now < info.openAt.getTime() || now > info.closeAt.getTime()) {
      throw new BadRequestException({
        code: "REGISTRATION_WINDOW_CLOSED",
        message: "Registration window is closed",
        registrationOpenAt: info.openAt.toISOString(),
        registrationCloseAt: info.closeAt.toISOString(),
        priorityLabel: info.priorityLabel,
        cohortYear: info.cohortYear
      });
    }
    return info;
  }

  private async notifyWaitlistPromotionInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      enrollmentId: string;
      studentId: string;
      sectionId: string;
      courseCode: string;
      courseName: string;
      req?: Request;
    }
  ) {
    await this.auditService.logInTransaction(tx, {
      actorUserId: input.studentId,
      action: "WAITLIST_PROMOTED",
      entityType: "enrollment",
      entityId: input.enrollmentId,
      metadata: {
        studentId: input.studentId,
        sectionId: input.sectionId,
        courseCode: input.courseCode,
        courseName: input.courseName,
        message: `你已从等待队列晋升，成功选入 ${input.courseCode} ${input.courseName}`
      },
      req: input.req
    });
  }

  private async promoteNextWaitlistedEnrollmentInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      sectionId: string;
      actorUserId: string;
      req?: Request;
    }
  ) {
    const nextWaiting = await tx.enrollment.findFirst({
      where: {
        deletedAt: null,
        sectionId: input.sectionId,
        status: "WAITLISTED"
      },
      orderBy: [{ waitlistPosition: "asc" }, { createdAt: "asc" }],
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
      return null;
    }

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

    await this.auditService.logInTransaction(tx, {
      actorUserId: input.actorUserId,
      action: "AUTO_PROMOTE_WAITLIST",
      entityType: "enrollment",
      entityId: nextWaiting.id,
      metadata: {
        studentId: nextWaiting.studentId,
        sectionId: nextWaiting.sectionId,
        course: nextWaiting.section.course.code
      },
      req: input.req
    });

    await this.notifyWaitlistPromotionInTransaction(tx, {
      enrollmentId: nextWaiting.id,
      studentId: nextWaiting.studentId,
      sectionId: nextWaiting.sectionId,
      courseCode: nextWaiting.section.course.code,
      courseName: nextWaiting.section.course.title,
      req: input.req
    });

    return {
      id: nextWaiting.id,
      studentId: nextWaiting.studentId,
      email: nextWaiting.student.email,
      legalName: nextWaiting.student.studentProfile?.legalName ?? null,
      sectionId: nextWaiting.sectionId,
      sectionCode: nextWaiting.section.sectionCode,
      termName: nextWaiting.section.term.name,
      courseCode: nextWaiting.section.course.code,
      courseTitle: nextWaiting.section.course.title
    };
  }

  private async assertPrerequisitesSatisfied(
    tx: Prisma.TransactionClient,
    studentId: string,
    section: { id: string; courseId: string }
  ): Promise<void> {
    const courseWithPrereqs = await tx.course.findUnique({
      where: { id: section.courseId },
      include: {
        prerequisiteLinks: {
          include: {
            prerequisiteCourse: {
              select: {
                id: true,
                code: true
              }
            }
          }
        }
      }
    });

    const prereqLinks = courseWithPrereqs?.prerequisiteLinks ?? [];
    if (prereqLinks.length === 0) return;

    const prereqCourseIds = prereqLinks.map((link) => link.prerequisiteCourseId);
    const completed = await tx.enrollment.findMany({
      where: {
        studentId,
        deletedAt: null,
        status: "COMPLETED",
        section: {
          courseId: { in: prereqCourseIds }
        }
      },
      select: {
        section: {
          select: {
            courseId: true
          }
        }
      }
    });

    const completedIds = new Set(completed.map((enrollment) => enrollment.section.courseId));
    const missing = prereqLinks.filter((link) => !completedIds.has(link.prerequisiteCourseId));

    if (missing.length > 0) {
      const hasApprovedOverride = await this.governanceService.hasApprovedPrerequisiteOverride(tx, studentId, section.id);
      if (hasApprovedOverride) {
        return;
      }
      const codes = missing.map((link) => link.prerequisiteCourse.code).join(", ");
      throw new BadRequestException(`PREREQ_NOT_MET: ${codes}`);
    }
  }

  /**
   * @description Returns the current waitlist position for a student in a section.
   * @param studentId Student user id.
   * @param sectionId Section id to inspect.
   * @returns Current waitlist position and number of students ahead, or nulls when not waitlisted.
   * @throws None. Missing records resolve to null values instead of exceptions.
   */
  async getWaitlistPosition(studentId: string, sectionId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        deletedAt: null,
        studentId,
        sectionId,
        status: "WAITLISTED"
      },
      select: {
        waitlistPosition: true
      }
    });

    if (!enrollment?.waitlistPosition) {
      return {
        position: null,
        ahead: null
      };
    }

    return {
      position: enrollment.waitlistPosition,
      ahead: Math.max(enrollment.waitlistPosition - 1, 0)
    };
  }

  /**
   * @description Builds the final enrollment plan for a cart submission, including
   * prerequisite checks, meeting conflict checks, waitlist placement, and credit-limit validation.
   * @param params Registration planning inputs for a single term and student.
   * @returns The rows to create plus a structured list of blocking issues.
   * @throws None. Validation failures are reported through the returned issues array.
   */
  private buildEnrollmentPlan(params: {
    studentId: string;
    termId: string;
    term: {
      startDate: Date;
      maxCredits: number;
    };
    now: Date;
    cartItems: CartItemWithSection[];
    existingEnrollments: ExistingEnrollmentWithMeetings[];
    passedCourseIds: Set<string>;
    approvedPrereqOverrideSectionIds: Set<string>;
    enrolledCountBySection: Map<string, number>;
    maxWaitlistPositionBySection: Map<string, number>;
  }): {
    toCreate: Prisma.EnrollmentCreateManyInput[];
    issues: SubmitIssue[];
    pendingReasonBySection: Map<string, "CREDIT_OVERLOAD" | "SECTION_APPROVAL">;
  } {
    const {
      studentId,
      termId,
      term,
      now,
      cartItems,
      existingEnrollments,
      passedCourseIds,
      approvedPrereqOverrideSectionIds,
      enrolledCountBySection,
      maxWaitlistPositionBySection
    } = params;

    const scheduledMeetings: Meeting[] = existingEnrollments
      .filter((enrollment) => enrollment.status === "ENROLLED" || enrollment.status === "PENDING_APPROVAL")
      .flatMap((enrollment) =>
        enrollment.section.meetingTimes.map((meeting) => ({
          weekday: meeting.weekday,
          startMinutes: meeting.startMinutes,
          endMinutes: meeting.endMinutes
        }))
      );

    const existingSectionIds = new Set(existingEnrollments.map((item) => item.sectionId));

    let totalCredits = existingEnrollments
      .filter((e) => e.status === "ENROLLED" || e.status === "PENDING_APPROVAL")
      .reduce((sum, e) => sum + e.section.credits, 0);

    const waitlistNextPositionBySection = new Map<string, number>(maxWaitlistPositionBySection);
    const toCreate: Prisma.EnrollmentCreateManyInput[] = [];
    const issues: SubmitIssue[] = [];
    const pendingReasonBySection = new Map<string, "CREDIT_OVERLOAD" | "SECTION_APPROVAL">();

    for (const item of cartItems) {
      const section = item.section;
      const courseCode = section.course.code;
      const pushIssue = (reasonCode: string, message: string) => {
        issues.push({
          sectionId: section.id,
          sectionCode: section.sectionCode,
          courseCode,
          reasonCode,
          message
        });
      };

      if (existingSectionIds.has(section.id)) {
        pushIssue("ALREADY_REGISTERED", "Already enrolled/waitlisted for this section");
        continue;
      }

      const startProxy = section.startDate ?? term.startDate;
      if (now >= startProxy) {
        pushIssue("SECTION_ALREADY_STARTED", "Cannot self-add after section start");
        continue;
      }

      const missingPrerequisites = section.course.prerequisiteLinks
        .map((link) => link.prerequisiteCourseId)
        .filter((courseId) => !passedCourseIds.has(courseId));

      if (missingPrerequisites.length > 0 && !approvedPrereqOverrideSectionIds.has(section.id)) {
        const missingPrereqCodes = section.course.prerequisiteLinks
          .filter((link) => missingPrerequisites.includes(link.prerequisiteCourseId))
          .map((link) => link.prerequisiteCourse.code);
        pushIssue(
          "PREREQUISITE_NOT_MET",
          missingPrereqCodes.length > 0
            ? `Missing prerequisite(s): ${missingPrereqCodes.join(", ")}`
            : "Prerequisites not met"
        );
        continue;
      }

      const activeCount = enrolledCountBySection.get(section.id) ?? 0;

      let status: EnrollmentStatus;
      let waitlistPosition: number | undefined;

      if (section.capacity > 0 && activeCount >= section.capacity) {
        status = "WAITLISTED";
        const basePosition = waitlistNextPositionBySection.get(section.id) ?? 0;
        waitlistPosition = basePosition + 1;
        waitlistNextPositionBySection.set(section.id, waitlistPosition);
      } else if (section.requireApproval) {
        status = "PENDING_APPROVAL";
      } else {
        status = "ENROLLED";
        enrolledCountBySection.set(section.id, activeCount + 1);
      }

      if (status === "ENROLLED" || status === "PENDING_APPROVAL") {
        const thisMeetings: Meeting[] = section.meetingTimes.map((meeting) => ({
          weekday: meeting.weekday,
          startMinutes: meeting.startMinutes,
          endMinutes: meeting.endMinutes
        }));

        if (hasMeetingConflict(thisMeetings, scheduledMeetings)) {
          pushIssue("TIME_CONFLICT", "Time conflict with current schedule/cart");
          continue;
        }

        if (totalCredits + section.credits > term.maxCredits) {
          status = "PENDING_APPROVAL";
          pendingReasonBySection.set(section.id, "CREDIT_OVERLOAD");
        } else if (status === "PENDING_APPROVAL") {
          pendingReasonBySection.set(section.id, "SECTION_APPROVAL");
        }

        totalCredits += section.credits;
        scheduledMeetings.push(...thisMeetings);
      }

      toCreate.push({
        studentId,
        termId,
        sectionId: section.id,
        status,
        waitlistPosition
      });

      existingSectionIds.add(section.id);
    }

    return { toCreate, issues, pendingReasonBySection };
  }

  private buildSubmitPreview(
    cartItems: CartItemWithSection[],
    toCreate: Prisma.EnrollmentCreateManyInput[],
    pendingReasonBySection?: Map<string, "CREDIT_OVERLOAD" | "SECTION_APPROVAL">
  ): SubmitPreview[] {
    const sectionById = new Map<string, CartItemWithSection["section"]>(
      cartItems.map((item) => [item.sectionId, item.section])
    );

    return toCreate.map((item) => {
      const section = sectionById.get(item.sectionId);
      return {
        sectionId: item.sectionId,
        sectionCode: section?.sectionCode ?? "",
        courseCode: section?.course.code ?? "",
        status: item.status,
        waitlistPosition: item.waitlistPosition ?? null,
        pendingReason:
          item.status === "PENDING_APPROVAL" ? (pendingReasonBySection?.get(item.sectionId) ?? null) : null
      };
    });
  }

  async enroll(studentId: string, sectionId: string) {
    return this.runEnrollmentTransactionWithRetry(async (tx) => {
      await this.governanceService.assertNoBlockingHolds(tx, studentId);
      await this.lockSectionsForUpdate(tx, [sectionId]);

      const section = await tx.section.findUnique({
        where: { id: sectionId },
        include: {
          term: true,
          course: true,
          meetingTimes: true,
          enrollments: {
            where: {
              deletedAt: null,
              status: { in: ["ENROLLED", "PENDING_APPROVAL"] }
            }
          }
        }
      });

      if (!section) {
        throw new NotFoundException("Section not found");
      }

      await this.assertStudentRegistrationWindowOpen(tx, studentId, {
        id: section.termId,
        registrationOpenAt: section.term.registrationOpenAt,
        registrationCloseAt: section.term.registrationCloseAt
      });

      const enrolledCount = section.enrollments.filter((enrollment) => enrollment.status === "ENROLLED").length;
      if (section.capacity > 0 && enrolledCount >= section.capacity) {
        throw new BadRequestException("SECTION_FULL");
      }

      await this.assertPrerequisitesSatisfied(tx, studentId, section);

      const existing = await tx.enrollment.findFirst({
        where: {
          studentId,
          sectionId,
          deletedAt: null,
          status: { in: ["ENROLLED", "WAITLISTED", "PENDING_APPROVAL"] }
        }
      });

      if (existing?.status === "ENROLLED") {
        return existing;
      }

      if (existing) {
        throw new BadRequestException("ALREADY_REGISTERED");
      }

      const otherEnrollments = await tx.enrollment.findMany({
        where: {
          studentId,
          termId: section.termId,
          deletedAt: null,
          status: { in: ["ENROLLED", "PENDING_APPROVAL"] }
        },
        include: {
          section: {
            include: {
              meetingTimes: true
            }
          }
        }
      });

      const hasConflict = otherEnrollments.some((enrollment) =>
        hasMeetingConflict(
          enrollment.section.meetingTimes.map((meeting) => ({
            weekday: meeting.weekday,
            startMinutes: meeting.startMinutes,
            endMinutes: meeting.endMinutes
          })),
          section.meetingTimes.map((meeting) => ({
            weekday: meeting.weekday,
            startMinutes: meeting.startMinutes,
            endMinutes: meeting.endMinutes
          }))
        )
      );

      if (hasConflict) {
        throw new BadRequestException("TIME_CONFLICT");
      }

      const effectiveMaxCredits = await this.getEffectiveMaxCredits(section.term.maxCredits);
      const allowedMaxCredits = await this.getAllowedMaxCredits(tx, studentId, section.termId, effectiveMaxCredits);
      const currentCredits = otherEnrollments.reduce((sum, enrollment) => sum + enrollment.section.credits, 0);
      const pendingReason =
        currentCredits + section.credits > allowedMaxCredits
          ? "CREDIT_OVERLOAD"
          : section.requireApproval
            ? "SECTION_APPROVAL"
            : null;

      const created = await tx.enrollment.create({
        data: {
          studentId,
          termId: section.termId,
          sectionId,
          status: pendingReason ? "PENDING_APPROVAL" : "ENROLLED"
        }
      });

      if (pendingReason === "CREDIT_OVERLOAD") {
        await this.auditService.logInTransaction(tx, {
          actorUserId: studentId,
          action: "CREDIT_OVERLOAD_REQUEST",
          entityType: "enrollment",
          entityId: created.id,
          metadata: {
            studentId,
            sectionId,
            termId: section.termId,
            currentCredits,
            requestedCredits: section.credits,
            resultingCredits: currentCredits + section.credits
          }
        });
      }

      return {
        ...created,
        pendingReason
      };
    });
  }

  async getCart(studentId: string, termId: string) {
    return this.prisma.cartItem.findMany({
      where: { studentId, termId },
      include: {
        section: {
          include: {
            course: true,
            term: true,
            meetingTimes: true,
            enrollments: {
              where: { deletedAt: null, status: { in: ["ENROLLED", "PENDING_APPROVAL"] } }
            }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });
  }

  async addToCart(studentId: string, input: AddCartInput) {
    await this.governanceService.assertNoBlockingHolds(this.prisma, studentId);

    const section = await this.prisma.section.findUnique({
      where: { id: input.sectionId },
      include: { term: true }
    });

    if (!section || section.termId !== input.termId) {
      throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "Section not found for term" });
    }

    // Carting is intentionally allowed outside the registration window so students can plan ahead.
    // The actual time gate remains enforced in precheckCart() and submitCart().

    const existingActive = await this.prisma.enrollment.findFirst({
      where: {
        deletedAt: null,
        studentId,
        sectionId: section.id,
        status: { in: ["ENROLLED", "WAITLISTED", "PENDING_APPROVAL"] }
      }
    });

    if (existingActive) {
      throw new BadRequestException({ code: "ALREADY_REGISTERED", message: "Already enrolled/waitlisted for this section" });
    }

    try {
      return await this.prisma.cartItem.create({
        data: {
          studentId,
          termId: input.termId,
          sectionId: input.sectionId
        }
      });
    } catch {
      throw new BadRequestException({ code: "ALREADY_IN_CART", message: "Section already in cart" });
    }
  }

  async removeCartItem(studentId: string, cartItemId: string) {
    const item = await this.prisma.cartItem.findUnique({ where: { id: cartItemId } });
    if (!item || item.studentId !== studentId) {
      throw new NotFoundException({ code: "CART_ITEM_NOT_FOUND", message: "Cart item not found" });
    }

    await this.prisma.cartItem.delete({ where: { id: cartItemId } });
    return { id: cartItemId };
  }

  async precheckCart(studentId: string, input: SubmitCartInput) {
    await this.governanceService.assertNoBlockingHolds(this.prisma, studentId);

    const term = await this.prisma.term.findUnique({ where: { id: input.termId } });
    if (!term) {
      throw new NotFoundException({ code: "TERM_NOT_FOUND", message: "Term not found" });
    }

    const now = new Date();
    await this.assertStudentRegistrationWindowOpen(this.prisma, studentId, term);

    const effectiveMaxCredits = await this.getEffectiveMaxCredits(term.maxCredits);
    const allowedMaxCredits = await this.getAllowedMaxCredits(this.prisma, studentId, input.termId, effectiveMaxCredits);

    const cartItems: CartItemWithSection[] = await this.prisma.cartItem.findMany({
      where: { studentId, termId: input.termId },
      include: {
        section: {
          include: {
            term: true,
            meetingTimes: true,
            course: {
              include: {
                prerequisiteLinks: {
                  include: {
                    prerequisiteCourse: {
                      select: { code: true }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    if (cartItems.length === 0) {
      throw new BadRequestException({ code: "EMPTY_CART", message: "Cart is empty" });
    }

    const sectionIds = Array.from(new Set(cartItems.map((item) => item.sectionId)));

    const [existingEnrollments, completedEnrollments, sectionStats, approvedPrereqOverrideSectionIds] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: {
          deletedAt: null,
          studentId,
          termId: input.termId,
          status: { in: ["ENROLLED", "PENDING_APPROVAL", "WAITLISTED"] }
        },
        include: {
          section: { include: { meetingTimes: true } }
        }
      }),
      this.prisma.enrollment.findMany({
        where: {
          deletedAt: null,
          studentId,
          status: "COMPLETED"
        },
        include: {
          section: {
            include: { course: true }
          }
        }
      }),
      this.getSectionEnrollmentStats(this.prisma, sectionIds),
      this.governanceService.getApprovedPrerequisiteOverrideSectionIds(this.prisma, studentId, sectionIds)
    ]);

    const passedCourseIds = this.getPassedCourseIds(completedEnrollments);

    const validation = this.buildEnrollmentPlan({
      studentId,
      termId: input.termId,
      term: {
        startDate: term.startDate,
        maxCredits: allowedMaxCredits
      },
      now,
      cartItems,
      existingEnrollments,
      passedCourseIds,
      approvedPrereqOverrideSectionIds,
      enrolledCountBySection: new Map(sectionStats.enrolledCountBySection),
      maxWaitlistPositionBySection: new Map(sectionStats.maxWaitlistPositionBySection)
    });

    return {
      termId: input.termId,
      cartCount: cartItems.length,
      ok: validation.issues.length === 0,
      preview: this.buildSubmitPreview(cartItems, validation.toCreate, validation.pendingReasonBySection),
      issues: validation.issues
    };
  }

  /**
   * @description Executes the student self-enrollment workflow by validating the cart,
   * locking target sections, creating enrollment rows, clearing the cart, and dispatching notifications.
   * @param studentId Student user id.
   * @param input Submit-cart payload for the target term.
   * @param req Express request for audit logging context.
   * @returns Newly created enrollment rows for the submitted cart.
   * @throws BadRequestException When the registration window is closed, cart is empty, or validation fails.
   * @throws NotFoundException When the requested term does not exist.
   */
  async submitCart(studentId: string, input: SubmitCartInput, req: Request) {
    await this.governanceService.assertNoBlockingHolds(this.prisma, studentId);

    const term = await this.prisma.term.findUnique({ where: { id: input.termId } });
    if (!term) {
      throw new NotFoundException({ code: "TERM_NOT_FOUND", message: "Term not found" });
    }

    const now = new Date();
    await this.assertStudentRegistrationWindowOpen(this.prisma, studentId, term);

    const effectiveMaxCredits = await this.getEffectiveMaxCredits(term.maxCredits);
    const allowedMaxCredits = await this.getAllowedMaxCredits(this.prisma, studentId, input.termId, effectiveMaxCredits);

    const cartItems: CartItemWithSection[] = await this.prisma.cartItem.findMany({
      where: { studentId, termId: input.termId },
      include: {
        section: {
          include: {
            term: true,
            meetingTimes: true,
            course: {
              include: {
                prerequisiteLinks: {
                  include: {
                    prerequisiteCourse: {
                      select: { code: true }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    if (cartItems.length === 0) {
      throw new BadRequestException({ code: "EMPTY_CART", message: "Cart is empty" });
    }

    const sectionIds = Array.from(new Set(cartItems.map((item) => item.sectionId)));

    const [existingEnrollments, completedEnrollments, sectionStats, approvedPrereqOverrideSectionIds] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: {
          deletedAt: null,
          studentId,
          termId: input.termId,
          status: { in: ["ENROLLED", "PENDING_APPROVAL", "WAITLISTED"] }
        },
        include: {
          section: { include: { meetingTimes: true } }
        }
      }),
      this.prisma.enrollment.findMany({
        where: {
          deletedAt: null,
          studentId,
          status: "COMPLETED"
        },
        include: {
          section: {
            include: { course: true }
          }
        }
      }),
      this.getSectionEnrollmentStats(this.prisma, sectionIds),
      this.governanceService.getApprovedPrerequisiteOverrideSectionIds(this.prisma, studentId, sectionIds)
    ]);

    const passedCourseIds = this.getPassedCourseIds(completedEnrollments);

    // Pre-validate with grouped counts and waitlist maxima (avoids per-section queries).
    const preValidation = this.buildEnrollmentPlan({
      studentId,
      termId: input.termId,
      term: {
        startDate: term.startDate,
        maxCredits: allowedMaxCredits
      },
      now,
      cartItems,
      existingEnrollments,
      passedCourseIds,
      approvedPrereqOverrideSectionIds,
      enrolledCountBySection: new Map(sectionStats.enrolledCountBySection),
      maxWaitlistPositionBySection: new Map(sectionStats.maxWaitlistPositionBySection)
    });

    if (preValidation.issues.length > 0) {
      throw new BadRequestException({
        code: "SUBMIT_VALIDATION_FAILED",
        message: "Some cart items failed validation",
        details: preValidation.issues
      });
    }

    const created = await this.runEnrollmentTransactionWithRetry(async (tx) => {
      await this.governanceService.assertNoBlockingHolds(tx, studentId);
      await this.assertStudentRegistrationWindowOpen(tx, studentId, term);

      const txCartItems: CartItemWithSection[] = await tx.cartItem.findMany({
        where: { studentId, termId: input.termId },
        include: {
          section: {
            include: {
              term: true,
              meetingTimes: true,
              course: {
                include: {
                  prerequisiteLinks: {
                    include: {
                      prerequisiteCourse: {
                        select: { code: true }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { createdAt: "asc" }
      });

      if (txCartItems.length === 0) {
        throw new BadRequestException({ code: "EMPTY_CART", message: "Cart is empty" });
      }

      const txSectionIds = Array.from(new Set(txCartItems.map((item) => item.sectionId)));
      await this.lockSectionsForUpdate(tx, txSectionIds);

      const [txExistingEnrollments, txCompletedEnrollments, txSectionStats, approvedTxPrereqOverrideSectionIds] = await Promise.all([
        tx.enrollment.findMany({
          where: {
            deletedAt: null,
            studentId,
            termId: input.termId,
            status: { in: ["ENROLLED", "PENDING_APPROVAL", "WAITLISTED"] }
          },
          include: {
            section: { include: { meetingTimes: true } }
          }
        }),
        tx.enrollment.findMany({
          where: {
            deletedAt: null,
            studentId,
            status: "COMPLETED"
          },
          include: {
            section: {
              include: { course: true }
            }
          }
        }),
        this.getSectionEnrollmentStats(tx, txSectionIds),
        this.governanceService.getApprovedPrerequisiteOverrideSectionIds(tx, studentId, txSectionIds)
      ]);

      const txPassedCourseIds = this.getPassedCourseIds(txCompletedEnrollments);
      const txAllowedMaxCredits = await this.getAllowedMaxCredits(tx, studentId, input.termId, effectiveMaxCredits);

      const txValidation = this.buildEnrollmentPlan({
        studentId,
        termId: input.termId,
        term: {
          startDate: term.startDate,
          maxCredits: txAllowedMaxCredits
        },
        now,
        cartItems: txCartItems,
        existingEnrollments: txExistingEnrollments,
        passedCourseIds: txPassedCourseIds,
        approvedPrereqOverrideSectionIds: approvedTxPrereqOverrideSectionIds,
        enrolledCountBySection: new Map(txSectionStats.enrolledCountBySection),
        maxWaitlistPositionBySection: new Map(txSectionStats.maxWaitlistPositionBySection)
      });

      if (txValidation.issues.length > 0) {
        throw new BadRequestException({
          code: "SUBMIT_VALIDATION_FAILED",
          message: "Some cart items failed validation",
          details: txValidation.issues
        });
      }

      const { toCreate } = txValidation;

      for (const enrollment of toCreate) {
        const section = txCartItems.find((item) => item.sectionId === enrollment.sectionId)?.section;
        if (section) {
          await this.assertPrerequisitesSatisfied(tx, studentId, section);
        }
      }

      await tx.enrollment.createMany({ data: toCreate });
      await tx.cartItem.deleteMany({ where: { studentId, termId: input.termId } });

      const createdRows = await tx.enrollment.findMany({
        where: {
          deletedAt: null,
          studentId,
          termId: input.termId,
          sectionId: { in: toCreate.map((item) => item.sectionId) }
        },
        include: {
          section: { include: { course: true, meetingTimes: true } }
        },
        orderBy: { createdAt: "desc" }
      });

      await Promise.all(
        createdRows
          .filter((item) => txValidation.pendingReasonBySection.get(item.sectionId) === "CREDIT_OVERLOAD")
          .map((item) =>
            this.auditService.logInTransaction(tx, {
              actorUserId: studentId,
              action: "CREDIT_OVERLOAD_REQUEST",
              entityType: "enrollment",
              entityId: item.id,
              metadata: {
                studentId,
                sectionId: item.sectionId,
                termId: item.termId,
                requestedCredits: item.section.credits,
                reason: "CREDIT_OVERLOAD"
              },
              req
            })
          )
      );

      return createdRows.map((row) => ({
        ...row,
        pendingReason: txValidation.pendingReasonBySection.get(row.sectionId) ?? null
      }));
    });

    await this.auditService.log({
      actorUserId: studentId,
      action: "enroll_submit",
      entityType: "enrollment",
      metadata: {
        termId: input.termId,
        count: created.length,
        statuses: created.map((item) => item.status)
      },
      req
    });

    const [studentUser, submitTerm] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: studentId, deletedAt: null },
        include: { studentProfile: { select: { legalName: true } } }
      }),
      this.prisma.term.findUnique({
        where: { id: input.termId },
        select: { name: true }
      })
    ]);

    if (studentUser?.email) {
      await this.notificationsService.sendEnrollmentSubmissionEmail({
        to: studentUser.email,
        legalName: studentUser.studentProfile?.legalName ?? null,
        termName: submitTerm?.name ?? term.name,
        items: created.map((item) => ({
          courseCode: item.section.course.code,
          sectionCode: item.section.sectionCode,
          status: item.status,
          waitlistPosition: item.waitlistPosition ?? null
        }))
      });
    }

    await Promise.allSettled(
      created.map((item) =>
        dispatch({
          type: "enrollment.created",
          payload: {
            studentId,
            sectionId: item.sectionId,
            status: item.status
          }
        })
      )
    );

    return created;
  }

  /**
   * @description Drops an enrollment for the current student, updates waitlist ordering,
   * and auto-promotes the next waitlisted student when an enrolled seat is freed.
   * @param studentId Student user id.
   * @param input Drop payload containing the enrollment id.
   * @param req Express request for audit logging context.
   * @returns The dropped enrollment plus whether a seat was freed.
   * @throws NotFoundException When the enrollment does not belong to the student or does not exist.
   * @throws BadRequestException When the enrollment is already dropped or the drop deadline has passed.
   */
  async dropEnrollment(studentId: string, input: DropEnrollmentInput, req: Request) {
    const result = await this.runEnrollmentTransactionWithRetry(async (tx) => {
      const current = await tx.enrollment.findFirst({
        where: { id: input.enrollmentId, deletedAt: null },
        include: {
          term: true,
          section: {
            include: { course: true }
          }
        }
      });

      if (!current || current.studentId !== studentId) {
        throw new NotFoundException({ code: "ENROLLMENT_NOT_FOUND", message: "Enrollment not found" });
      }

      await this.lockSectionsForUpdate(tx, [current.sectionId]);

      const locked = await tx.enrollment.findFirst({
        where: { id: input.enrollmentId, deletedAt: null },
        include: {
          term: true,
          section: {
            include: { course: true }
          }
        }
      });

      if (!locked || locked.studentId !== studentId) {
        throw new NotFoundException({ code: "ENROLLMENT_NOT_FOUND", message: "Enrollment not found" });
      }

      if (locked.status === "DROPPED") {
        throw new BadRequestException({ code: "ALREADY_DROPPED", message: "Enrollment already dropped" });
      }

      const previousStatus = locked.status;
      const seatFreed = previousStatus === "ENROLLED";

      if (
        (previousStatus === "ENROLLED" || previousStatus === "PENDING_APPROVAL") &&
        new Date() > locked.term.dropDeadline
      ) {
        throw new BadRequestException({
          code: "DROP_DEADLINE_PASSED",
          message: "Contact registrar/support"
        });
      }

      const oldWaitlistPosition = locked.waitlistPosition;
      const dropped = await tx.enrollment.update({
        where: { id: locked.id },
        data: {
          status: "DROPPED",
          droppedAt: new Date(),
          waitlistPosition: null
        }
      });

      if (previousStatus === "WAITLISTED" && oldWaitlistPosition !== null) {
        await tx.enrollment.updateMany({
          where: {
            deletedAt: null,
            sectionId: locked.sectionId,
            status: "WAITLISTED",
            waitlistPosition: { gt: oldWaitlistPosition }
          },
          data: {
            waitlistPosition: { increment: 10000 }
          }
        });

        await tx.enrollment.updateMany({
          where: {
            deletedAt: null,
            sectionId: locked.sectionId,
            status: "WAITLISTED",
            waitlistPosition: { gt: oldWaitlistPosition + 10000 }
          },
          data: {
            waitlistPosition: { decrement: 9999 }
          }
        });
      }

      await this.auditService.logInTransaction(tx, {
        actorUserId: studentId,
        action: "drop",
        entityType: "enrollment",
        entityId: locked.id,
        metadata: {
          previousStatus,
          sectionId: locked.sectionId,
          oldWaitlistPosition,
          seatFreed
        },
        req
      });

      const promoted = seatFreed
        ? await this.promoteNextWaitlistedEnrollmentInTransaction(tx, {
            sectionId: locked.sectionId,
            actorUserId: studentId,
            req
          })
        : null;

      return {
        dropped,
        seatFreed,
        previousStatus,
        promoted
      };
    });

    void dispatch({
      type: "enrollment.updated",
      payload: {
        id: result.dropped.id,
        oldStatus: result.previousStatus,
        newStatus: "DROPPED"
      }
    }).catch(() => {});

    if (result.promoted) {
      void dispatch({
        type: "enrollment.updated",
        payload: {
          id: result.promoted.id,
          oldStatus: "WAITLISTED",
          newStatus: "ENROLLED"
        }
      }).catch(() => {});

      try {
        await this.notificationsService.sendWaitlistPromotionEmail({
          to: result.promoted.email,
          legalName: result.promoted.legalName,
          termName: result.promoted.termName,
          courseCode: result.promoted.courseCode,
          sectionCode: result.promoted.sectionCode
        });
      } catch {
        // Mail delivery should not block the drop workflow.
      }
    }

    return {
      dropped: result.dropped,
      seatFreed: result.seatFreed
    };
  }

  async listMyEnrollments(studentId: string, termId?: string) {
    return this.prisma.enrollment.findMany({
      where: {
        deletedAt: null,
        studentId,
        termId: termId || undefined,
        status: { not: "DROPPED" }
      },
      include: {
        term: true,
        section: {
          include: {
            course: true,
            meetingTimes: true
          }
        }
      },
      orderBy: [{ term: { startDate: "desc" } }, { createdAt: "desc" }]
    });
  }

  async listMySchedule(studentId: string, termId: string) {
    return this.prisma.enrollment.findMany({
      where: {
        deletedAt: null,
        studentId,
        termId,
        status: { in: ["ENROLLED", "PENDING_APPROVAL", "WAITLISTED", "DROPPED"] }
      },
      include: {
        section: {
          include: {
            course: true,
            meetingTimes: true
          }
        }
      },
      orderBy: [{ status: "asc" }, { section: { sectionCode: "asc" } }]
    });
  }

  async listMyGrades(studentId: string) {
    return this.prisma.enrollment.findMany({
      where: {
        deletedAt: null,
        studentId,
        status: "COMPLETED",
        finalGrade: { not: null }
      },
      include: {
        term: true,
        section: {
          include: {
            course: true,
            term: {
              select: {
                id: true,
                name: true,
                endDate: true
              }
            },
            ratings: {
              where: { studentId },
              select: { rating: true }
            }
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  async swap(studentId: string, dropSectionId: string, addSectionId: string, req?: Request) {
    return this.prisma.$transaction(async (tx) => {
      await this.governanceService.assertNoBlockingHolds(tx, studentId);
      await this.lockSectionsForUpdate(tx, [dropSectionId, addSectionId]);

      const [dropSection, addSection] = await Promise.all([
        tx.section.findUnique({
          where: { id: dropSectionId },
          include: { course: true, meetingTimes: true }
        }),
        tx.section.findUnique({
          where: { id: addSectionId },
          include: {
            course: true,
            meetingTimes: true,
            enrollments: {
              where: {
                deletedAt: null,
                status: { in: ["ENROLLED", "PENDING_APPROVAL"] }
              }
            }
          }
        })
      ]);

      if (!dropSection || !addSection) {
        throw new NotFoundException("Section not found");
      }

      if (dropSection.courseId !== addSection.courseId) {
        throw new BadRequestException("SWAP_DIFFERENT_COURSE");
      }

      if (dropSection.termId !== addSection.termId) {
        throw new BadRequestException("SWAP_DIFFERENT_TERM");
      }

      const addEnrolledCount = addSection.enrollments.filter((enrollment) => enrollment.status === "ENROLLED").length;
      if (addSection.capacity > 0 && addEnrolledCount >= addSection.capacity) {
        throw new BadRequestException("SECTION_FULL");
      }

      const currentEnrollment = await tx.enrollment.findFirst({
        where: {
          studentId,
          sectionId: dropSectionId,
          deletedAt: null,
          status: "ENROLLED"
        }
      });

      if (!currentEnrollment) {
        throw new NotFoundException("Enrollment not found");
      }

      const existingTarget = await tx.enrollment.findFirst({
        where: {
          studentId,
          sectionId: addSectionId,
          deletedAt: null,
          status: { in: ["ENROLLED", "WAITLISTED", "PENDING_APPROVAL"] }
        }
      });

      if (existingTarget) {
        throw new BadRequestException("ALREADY_REGISTERED");
      }

      await this.assertPrerequisitesSatisfied(tx, studentId, addSection);

      const otherEnrollments = await tx.enrollment.findMany({
        where: {
          studentId,
          termId: currentEnrollment.termId,
          deletedAt: null,
          status: { in: ["ENROLLED", "PENDING_APPROVAL"] },
          sectionId: { not: dropSectionId }
        },
        include: {
          section: {
            include: {
              meetingTimes: true
            }
          }
        }
      });

      const conflicts = otherEnrollments.some((enrollment) =>
        hasMeetingConflict(
          enrollment.section.meetingTimes.map((meeting) => ({
            weekday: meeting.weekday,
            startMinutes: meeting.startMinutes,
            endMinutes: meeting.endMinutes
          })),
          addSection.meetingTimes.map((meeting) => ({
            weekday: meeting.weekday,
            startMinutes: meeting.startMinutes,
            endMinutes: meeting.endMinutes
          }))
        )
      );

      if (conflicts) {
        throw new BadRequestException("TIME_CONFLICT");
      }

      const created = await tx.enrollment.create({
        data: {
          studentId,
          sectionId: addSectionId,
          status: "ENROLLED",
          termId: currentEnrollment.termId
        }
      });

      await tx.enrollment.update({
        where: { id: currentEnrollment.id },
        data: {
          status: "DROPPED",
          droppedAt: new Date()
        }
      });

      await this.auditService.logInTransaction(tx, {
        actorUserId: studentId,
        action: "swap",
        entityType: "enrollment",
        entityId: created.id,
        metadata: {
          droppedSectionId: dropSectionId,
          addedSectionId: addSectionId,
          droppedSectionCode: dropSection.sectionCode,
          addedSectionCode: addSection.sectionCode
        },
        req
      });

      return {
        success: true,
        addedSection: addSection.sectionCode,
        droppedSection: dropSection.sectionCode
      };
    });
  }

  async watchSection(userId: string, sectionId: string) {
    await this.prisma.sectionWatch.upsert({
      where: { userId_sectionId: { userId, sectionId } },
      create: { userId, sectionId },
      update: {}
    });
    return { watching: true };
  }

  async unwatchSection(userId: string, sectionId: string) {
    await this.prisma.sectionWatch.deleteMany({
      where: { userId, sectionId }
    });
    return { watching: false };
  }

  async getMyWaitlist(studentId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, status: "WAITLISTED", deletedAt: null },
      include: {
        section: {
          include: {
            course: { select: { code: true, title: true } },
            term: { select: { id: true, name: true } },
            meetingTimes: true,
            _count: {
              select: {
                enrollments: { where: { status: "WAITLISTED", deletedAt: null } }
              }
            }
          }
        }
      },
      orderBy: { waitlistPosition: "asc" }
    });

    // Attach queue size (total waitlisted in that section)
    return enrollments.map((e) => ({
      id: e.id,
      sectionId: e.sectionId,
      waitlistPosition: e.waitlistPosition,
      queueSize: e.section._count.enrollments,
      section: {
        id: e.section.id,
        sectionCode: e.section.sectionCode,
        capacity: e.section.capacity,
        instructorName: e.section.instructorName,
        course: e.section.course,
        term: e.section.term,
        meetingTimes: e.section.meetingTimes
      }
    }));
  }

  async getWatches(userId: string) {
    return this.prisma.sectionWatch.findMany({
      where: { userId },
      include: {
        section: {
          include: {
            course: true,
            term: { select: { id: true, name: true } },
            _count: { select: { enrollments: { where: { status: "ENROLLED", deletedAt: null } } } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  @Cron("*/5 * * * *")
  async notifyWatchers() {
    const watches = await this.prisma.sectionWatch.findMany({
      where: { notifiedAt: null },
      include: {
        section: {
          include: {
            enrollments: true,
            course: true
          }
        },
        user: {
          select: {
            email: true,
            studentProfile: {
              select: {
                legalName: true
              }
            }
          }
        }
      },
      take: 100
    });

    for (const watch of watches) {
      const enrolledCount = watch.section.enrollments.filter((enrollment) => enrollment.status === "ENROLLED").length;
      const seatsAvailable = watch.section.capacity === 0 || enrolledCount < watch.section.capacity;
      if (!seatsAvailable) continue;

      try {
        await this.notificationsService.sendMail({
          to: watch.user.email,
          subject: `【地平线】${watch.section.course.code} 有空位了！`,
          text: `您关注的课程 ${watch.section.course.code} ${watch.section.course.title} 目前有空位，请尽快前往选课系统选课。`,
          html: `<p>您关注的课程 <strong>${watch.section.course.code} ${watch.section.course.title}</strong> 目前有空位，请尽快前往选课系统选课。</p>`
        });
      } catch {
        // ignore email failures
      }

      await this.prisma.notificationLog.create({
        data: {
          userId: watch.userId,
          type: "SEAT_AVAILABLE",
          subject: "Seat available",
          body: `${watch.section.course.code} 有空位，快去选！`
        }
      }).catch(() => {});

      await this.prisma.sectionWatch.update({
        where: { id: watch.id },
        data: { notifiedAt: new Date() }
      });
    }
  }
}
