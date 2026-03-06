import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EnrollmentStatus, Prisma } from "@prisma/client";
import { Request } from "express";
import { addCartItemSchema, dropEnrollmentSchema, submitCartSchema } from "@sis/shared";
import { z } from "zod";
import { AuditService } from "../audit/audit.service";
import { isPassingGrade } from "../common/grade.utils";
import { PrismaService } from "../common/prisma.service";
import { dispatch } from "../common/webhook";
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

function hasMeetingConflict(a: Meeting[], b: Meeting[]): boolean {
  return a.some((m1) =>
    b.some((m2) => m1.weekday === m2.weekday && m1.startMinutes < m2.endMinutes && m2.startMinutes < m1.endMinutes)
  );
}

@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService
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
    enrolledCountBySection: Map<string, number>;
    maxWaitlistPositionBySection: Map<string, number>;
  }): {
    toCreate: Prisma.EnrollmentCreateManyInput[];
    issues: SubmitIssue[];
  } {
    const {
      studentId,
      termId,
      term,
      now,
      cartItems,
      existingEnrollments,
      passedCourseIds,
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

      if (missingPrerequisites.length > 0) {
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

      if (activeCount >= section.capacity) {
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
          pushIssue("CREDIT_LIMIT_EXCEEDED", `Credit limit (${term.maxCredits}) would be exceeded`);
          continue;
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

    return { toCreate, issues };
  }

  private buildSubmitPreview(
    cartItems: CartItemWithSection[],
    toCreate: Prisma.EnrollmentCreateManyInput[]
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
        waitlistPosition: item.waitlistPosition ?? null
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
    const section = await this.prisma.section.findUnique({
      where: { id: input.sectionId },
      include: { term: true }
    });

    if (!section || section.termId !== input.termId) {
      throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "Section not found for term" });
    }

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
    const term = await this.prisma.term.findUnique({ where: { id: input.termId } });
    if (!term) {
      throw new NotFoundException({ code: "TERM_NOT_FOUND", message: "Term not found" });
    }

    const now = new Date();
    if (now < term.registrationOpenAt || now > term.registrationCloseAt) {
      throw new BadRequestException({
        code: "REGISTRATION_WINDOW_CLOSED",
        message: "Registration window is closed"
      });
    }

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

    const [existingEnrollments, completedEnrollments, sectionStats] = await Promise.all([
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
      this.getSectionEnrollmentStats(this.prisma, sectionIds)
    ]);

    const passedCourseIds = this.getPassedCourseIds(completedEnrollments);

    const validation = this.buildEnrollmentPlan({
      studentId,
      termId: input.termId,
      term: {
        startDate: term.startDate,
        maxCredits: term.maxCredits
      },
      now,
      cartItems,
      existingEnrollments,
      passedCourseIds,
      enrolledCountBySection: new Map(sectionStats.enrolledCountBySection),
      maxWaitlistPositionBySection: new Map(sectionStats.maxWaitlistPositionBySection)
    });

    return {
      termId: input.termId,
      cartCount: cartItems.length,
      ok: validation.issues.length === 0,
      preview: this.buildSubmitPreview(cartItems, validation.toCreate),
      issues: validation.issues
    };
  }

  async submitCart(studentId: string, input: SubmitCartInput, req: Request) {
    const term = await this.prisma.term.findUnique({ where: { id: input.termId } });
    if (!term) {
      throw new NotFoundException({ code: "TERM_NOT_FOUND", message: "Term not found" });
    }

    const now = new Date();
    if (now < term.registrationOpenAt || now > term.registrationCloseAt) {
      throw new BadRequestException({
        code: "REGISTRATION_WINDOW_CLOSED",
        message: "Registration window is closed"
      });
    }

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

    const [existingEnrollments, completedEnrollments, sectionStats] = await Promise.all([
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
      this.getSectionEnrollmentStats(this.prisma, sectionIds)
    ]);

    const passedCourseIds = this.getPassedCourseIds(completedEnrollments);

    // Pre-validate with grouped counts and waitlist maxima (avoids per-section queries).
    const preValidation = this.buildEnrollmentPlan({
      studentId,
      termId: input.termId,
      term: {
        startDate: term.startDate,
        maxCredits: term.maxCredits
      },
      now,
      cartItems,
      existingEnrollments,
      passedCourseIds,
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

      const [txExistingEnrollments, txCompletedEnrollments, txSectionStats] = await Promise.all([
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
        this.getSectionEnrollmentStats(tx, txSectionIds)
      ]);

      const txPassedCourseIds = this.getPassedCourseIds(txCompletedEnrollments);

      const txValidation = this.buildEnrollmentPlan({
        studentId,
        termId: input.termId,
        term: {
          startDate: term.startDate,
          maxCredits: term.maxCredits
        },
        now,
        cartItems: txCartItems,
        existingEnrollments: txExistingEnrollments,
        passedCourseIds: txPassedCourseIds,
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

      await tx.enrollment.createMany({ data: toCreate });
      await tx.cartItem.deleteMany({ where: { studentId, termId: input.termId } });

      return tx.enrollment.findMany({
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

  async dropEnrollment(studentId: string, input: DropEnrollmentInput, req: Request) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: input.enrollmentId, deletedAt: null },
      include: {
        term: true,
        section: {
          include: { course: true }
        }
      }
    });

    if (!enrollment || enrollment.studentId !== studentId) {
      throw new NotFoundException({ code: "ENROLLMENT_NOT_FOUND", message: "Enrollment not found" });
    }

    if (enrollment.status === "DROPPED") {
      throw new BadRequestException({ code: "ALREADY_DROPPED", message: "Enrollment already dropped" });
    }

    const previousStatus = enrollment.status;
    const seatFreed = previousStatus === "ENROLLED";

    if (previousStatus === "WAITLISTED") {
      const droppedResult = await this.prisma.$transaction(async (tx) => {
        const current = await tx.enrollment.findFirst({
          where: { id: enrollment.id, deletedAt: null },
          select: {
            id: true,
            studentId: true,
            status: true,
            sectionId: true,
            waitlistPosition: true
          }
        });

        if (!current || current.studentId !== studentId) {
          throw new NotFoundException({ code: "ENROLLMENT_NOT_FOUND", message: "Enrollment not found" });
        }

        if (current.status !== "WAITLISTED") {
          throw new BadRequestException({
            code: "ENROLLMENT_STATE_CHANGED",
            message: "Enrollment state changed, please retry"
          });
        }

        const oldWaitlistPosition = current.waitlistPosition;

        const dropped = await tx.enrollment.update({
          where: { id: current.id },
          data: {
            status: "DROPPED",
            droppedAt: new Date(),
            waitlistPosition: null
          }
        });

        if (oldWaitlistPosition !== null) {
          await tx.enrollment.updateMany({
            where: {
              deletedAt: null,
              sectionId: current.sectionId,
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
              sectionId: current.sectionId,
              status: "WAITLISTED",
              waitlistPosition: { gt: oldWaitlistPosition + 10000 }
            },
            data: {
              waitlistPosition: { decrement: 9999 }
            }
          });
        }

        return {
          dropped,
          sectionId: current.sectionId,
          oldWaitlistPosition
        };
      });

      await this.auditService.log({
        actorUserId: studentId,
        action: "drop",
        entityType: "enrollment",
        entityId: enrollment.id,
        metadata: {
          previousStatus,
          sectionId: droppedResult.sectionId,
          oldWaitlistPosition: droppedResult.oldWaitlistPosition,
          seatFreed: false
        },
        req
      });

      void dispatch({
        type: "enrollment.updated",
        payload: {
          id: droppedResult.dropped.id,
          oldStatus: previousStatus,
          newStatus: "DROPPED"
        }
      }).catch(() => {});

      return {
        dropped: droppedResult.dropped,
        seatFreed: false
      };
    }

    if (
      (enrollment.status === "ENROLLED" || enrollment.status === "PENDING_APPROVAL") &&
      new Date() > enrollment.term.dropDeadline
    ) {
      throw new BadRequestException({
        code: "DROP_DEADLINE_PASSED",
        message: "Contact advisor/registrar"
      });
    }

    const dropped = await this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "DROPPED",
        droppedAt: new Date(),
        waitlistPosition: null
      }
    });

    await this.auditService.log({
      actorUserId: studentId,
      action: "drop",
      entityType: "enrollment",
      entityId: enrollment.id,
      metadata: {
        previousStatus,
        sectionId: enrollment.sectionId,
        oldWaitlistPosition: enrollment.waitlistPosition,
        seatFreed
      },
      req
    });

    void dispatch({
      type: "enrollment.updated",
      payload: {
        id: dropped.id,
        oldStatus: previousStatus,
        newStatus: "DROPPED"
      }
    }).catch(() => {});

    if (seatFreed) {
      const nextWaiting = await this.prisma.enrollment.findFirst({
        where: {
          deletedAt: null,
          sectionId: enrollment.sectionId,
          status: "WAITLISTED"
        },
        orderBy: { waitlistPosition: "asc" },
        include: {
          student: true,
          section: {
            include: {
              course: true,
              term: true
            }
          }
        }
      });

      if (nextWaiting) {
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
          actorUserId: studentId,
          action: "AUTO_PROMOTE_WAITLIST",
          entityType: "enrollment",
          entityId: nextWaiting.id,
          metadata: {
            studentId: nextWaiting.studentId,
            sectionId: nextWaiting.sectionId,
            course: nextWaiting.section.course.code
          },
          req
        });

        void dispatch({
          type: "enrollment.updated",
          payload: {
            id: nextWaiting.id,
            oldStatus: "WAITLISTED",
            newStatus: "ENROLLED"
          }
        }).catch(() => {});

        try {
          await this.notificationsService.sendMail({
            to: nextWaiting.student.email,
            subject: `[SIS] 🎉 Enrolled: ${nextWaiting.section.course.code}`,
            text: `You have been automatically enrolled in ${nextWaiting.section.course.title}. Your waitlist spot was promoted.`,
            html: `<p>You have been automatically enrolled in <strong>${nextWaiting.section.course.title}</strong>.</p><p>Your waitlist spot was promoted.</p>`
          });
        } catch {
          // Mail delivery should not block the drop workflow.
        }
      }
    }

    return {
      dropped,
      seatFreed
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
        status: { in: ["ENROLLED", "PENDING_APPROVAL"] }
      },
      include: {
        section: {
          include: {
            course: true,
            meetingTimes: true
          }
        }
      },
      orderBy: { section: { sectionCode: "asc" } }
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
}
