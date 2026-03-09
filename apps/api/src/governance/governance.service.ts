import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AcademicRequestStatus, AcademicRequestType, HoldType, Prisma, Role } from "@prisma/client";
import type {
  CreateHoldInput,
  DecideAcademicRequestInput,
  ResolveHoldInput,
  SubmitCreditOverloadRequestInput
} from "@sis/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../common/prisma.service";

const HOLD_BLOCKING_TYPES: HoldType[] = ["REGISTRATION", "ACADEMIC", "FINANCIAL"];

@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async listMyHolds(studentId: string) {
    return this.getActiveBlockingHolds(this.prisma, studentId);
  }

  async listMyAcademicRequests(studentId: string, termId?: string) {
    return this.prisma.academicRequest.findMany({
      where: {
        studentId,
        ...(termId ? { termId } : {})
      },
      include: {
        term: { select: { id: true, name: true, maxCredits: true } },
        section: {
          select: {
            id: true,
            sectionCode: true,
            course: { select: { code: true, title: true } }
          }
        },
        owner: {
          select: {
            id: true,
            email: true,
            advisorProfile: { select: { displayName: true, department: true } }
          }
        },
        decidedBy: {
          select: {
            id: true,
            email: true,
            advisorProfile: { select: { displayName: true } },
            facultyProfile: { select: { displayName: true } }
          }
        }
      },
      orderBy: [{ submittedAt: "desc" }, { updatedAt: "desc" }]
    });
  }

  async submitCreditOverloadRequest(studentId: string, input: SubmitCreditOverloadRequestInput) {
    const term = await this.prisma.term.findUnique({
      where: { id: input.termId },
      select: { id: true, name: true, maxCredits: true }
    });
    if (!term) {
      throw new NotFoundException({ code: "TERM_NOT_FOUND", message: "Term not found" });
    }

    const effectiveMaxCredits = await this.getEffectiveMaxCredits(term.maxCredits);
    if (input.requestedCredits <= effectiveMaxCredits) {
      throw new BadRequestException({
        code: "CREDIT_OVERLOAD_NOT_REQUIRED",
        message: `Requested credits must exceed the standard limit of ${effectiveMaxCredits}`
      });
    }

    const assignment = await this.prisma.advisorAssignment.findFirst({
      where: {
        studentId,
        active: true,
        endedAt: null
      },
      include: {
        advisor: {
          select: {
            id: true,
            role: true,
            advisorProfile: { select: { displayName: true } },
            email: true
          }
        }
      },
      orderBy: { assignedAt: "desc" }
    });

    if (!assignment || assignment.advisor.role !== "ADVISOR") {
      throw new BadRequestException({
        code: "NO_ADVISOR_ASSIGNED",
        message: "No active advisor is assigned to review overload requests"
      });
    }

    const existingPending = await this.prisma.academicRequest.findFirst({
      where: {
        studentId,
        termId: input.termId,
        type: "CREDIT_OVERLOAD",
        status: "SUBMITTED"
      },
      orderBy: { submittedAt: "desc" }
    });
    if (existingPending) {
      throw new BadRequestException({
        code: "REQUEST_ALREADY_PENDING",
        message: "An overload request is already pending for this term"
      });
    }

    const existingApproved = await this.prisma.academicRequest.findFirst({
      where: {
        studentId,
        termId: input.termId,
        type: "CREDIT_OVERLOAD",
        status: "APPROVED"
      },
      orderBy: [{ decisionAt: "desc" }, { submittedAt: "desc" }]
    });
    if (existingApproved?.requestedCredits && existingApproved.requestedCredits >= input.requestedCredits) {
      throw new BadRequestException({
        code: "REQUEST_ALREADY_APPROVED",
        message: `An approved overload request already covers up to ${existingApproved.requestedCredits} credits`
      });
    }

    const request = await this.prisma.academicRequest.create({
      data: {
        studentId,
        termId: input.termId,
        type: "CREDIT_OVERLOAD",
        status: "SUBMITTED",
        reason: input.reason.trim(),
        requestedCredits: input.requestedCredits,
        requiredApproverRole: "ADVISOR",
        ownerUserId: assignment.advisorId
      },
      include: {
        term: { select: { id: true, name: true, maxCredits: true } },
        owner: {
          select: {
            id: true,
            email: true,
            advisorProfile: { select: { displayName: true } }
          }
        }
      }
    });

    await this.auditService.log({
      actorUserId: studentId,
      action: "academic_request_submit",
      entityType: "academic_request",
      entityId: request.id,
      metadata: {
        type: request.type,
        termId: request.termId,
        requestedCredits: request.requestedCredits,
        ownerUserId: request.ownerUserId
      }
    });

    return request;
  }

  async listAdvisorRequests(advisorUserId: string) {
    return this.prisma.academicRequest.findMany({
      where: {
        ownerUserId: advisorUserId,
        requiredApproverRole: "ADVISOR",
        status: "SUBMITTED",
        student: {
          adviseeAssignments: {
            some: {
              advisorId: advisorUserId,
              active: true,
              endedAt: null
            }
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
                legalName: true,
                programMajor: true,
                academicStatus: true
              }
            }
          }
        },
        term: { select: { id: true, name: true, maxCredits: true } }
      },
      orderBy: [{ submittedAt: "asc" }]
    });
  }

  async decideAdvisorRequest(advisorUserId: string, requestId: string, input: DecideAcademicRequestInput) {
    const request = await this.prisma.academicRequest.findFirst({
      where: { id: requestId },
      include: {
        student: {
          select: {
            id: true,
            adviseeAssignments: {
              where: {
                advisorId: advisorUserId,
                active: true,
                endedAt: null
              },
              select: { id: true }
            }
          }
        },
        term: { select: { id: true, name: true } }
      }
    });

    if (!request) {
      throw new NotFoundException({ code: "REQUEST_NOT_FOUND", message: "Academic request not found" });
    }
    if (request.requiredApproverRole !== "ADVISOR" || request.ownerUserId !== advisorUserId) {
      throw new ForbiddenException({ code: "REQUEST_FORBIDDEN", message: "You do not own this request" });
    }
    if (request.student.adviseeAssignments.length === 0) {
      throw new ForbiddenException({ code: "REQUEST_FORBIDDEN", message: "Student is not assigned to this advisor" });
    }
    if (request.status !== "SUBMITTED") {
      throw new BadRequestException({
        code: "REQUEST_ALREADY_DECIDED",
        message: "Only submitted requests can be decided"
      });
    }

    const nextStatus: AcademicRequestStatus = input.decision === "APPROVED" ? "APPROVED" : "REJECTED";
    const decided = await this.prisma.academicRequest.update({
      where: { id: requestId },
      data: {
        status: nextStatus,
        decisionAt: new Date(),
        decisionNote: input.decisionNote.trim(),
        decidedByUserId: advisorUserId,
        requiredApproverRole: null,
        ownerUserId: null
      },
      include: {
        student: {
          select: {
            id: true,
            email: true,
            studentId: true,
            studentProfile: { select: { legalName: true } }
          }
        },
        term: { select: { id: true, name: true } }
      }
    });

    await this.auditService.log({
      actorUserId: advisorUserId,
      action: "academic_request_decision",
      entityType: "academic_request",
      entityId: decided.id,
      metadata: {
        decision: decided.status,
        type: decided.type,
        studentId: decided.studentId,
        termId: decided.termId
      }
    });

    return decided;
  }

  async listHolds(actorUserId: string, studentId?: string) {
    await this.assertAdminActor(actorUserId);
    return this.prisma.studentHold.findMany({
      where: {
        ...(studentId ? { studentId } : {})
      },
      include: {
        student: {
          select: {
            id: true,
            email: true,
            studentId: true,
            studentProfile: { select: { legalName: true } }
          }
        },
        createdBy: {
          select: {
            id: true,
            email: true,
            role: true
          }
        },
        resolvedBy: {
          select: {
            id: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }]
    });
  }

  async createHold(actorUserId: string, input: CreateHoldInput) {
    await this.assertAdminActor(actorUserId);
    await this.assertStudentExists(input.studentId);

    const hold = await this.prisma.studentHold.create({
      data: {
        studentId: input.studentId,
        type: input.type,
        reason: input.reason.trim(),
        note: input.note?.trim() || null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        active: true,
        createdByUserId: actorUserId
      },
      include: {
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

    await this.auditService.log({
      actorUserId,
      action: "student_hold_create",
      entityType: "student_hold",
      entityId: hold.id,
      metadata: {
        studentId: hold.studentId,
        type: hold.type,
        expiresAt: hold.expiresAt?.toISOString() ?? null
      }
    });

    return hold;
  }

  async resolveHold(actorUserId: string, holdId: string, input: ResolveHoldInput) {
    await this.assertAdminActor(actorUserId);

    const hold = await this.prisma.studentHold.findUnique({ where: { id: holdId } });
    if (!hold) {
      throw new NotFoundException({ code: "HOLD_NOT_FOUND", message: "Student hold not found" });
    }
    if (!hold.active) {
      throw new BadRequestException({ code: "HOLD_ALREADY_RESOLVED", message: "Hold is already resolved" });
    }

    const resolved = await this.prisma.studentHold.update({
      where: { id: holdId },
      data: {
        active: false,
        resolvedAt: new Date(),
        resolvedByUserId: actorUserId,
        note: [hold.note?.trim(), input.resolutionNote?.trim()].filter(Boolean).join("\n\n") || null
      }
    });

    await this.auditService.log({
      actorUserId,
      action: "student_hold_resolve",
      entityType: "student_hold",
      entityId: resolved.id,
      metadata: {
        studentId: resolved.studentId,
        type: resolved.type
      }
    });

    return resolved;
  }

  async getActiveBlockingHolds(client: PrismaService | Prisma.TransactionClient, studentId: string) {
    const now = new Date();
    return client.studentHold.findMany({
      where: {
        studentId,
        type: { in: HOLD_BLOCKING_TYPES },
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
      },
      orderBy: [{ createdAt: "desc" }]
    });
  }

  async assertNoBlockingHolds(client: PrismaService | Prisma.TransactionClient, studentId: string) {
    const holds = await this.getActiveBlockingHolds(client, studentId);
    if (holds.length === 0) return;

    throw new BadRequestException({
      code: "ACTIVE_REGISTRATION_HOLD",
      message: `Registration blocked by active hold(s): ${holds.map((hold) => hold.type).join(", ")}`,
      details: holds.map((hold) => ({
        id: hold.id,
        type: hold.type,
        reason: hold.reason,
        note: hold.note,
        expiresAt: hold.expiresAt?.toISOString() ?? null
      }))
    });
  }

  async getApprovedCreditLimit(
    client: PrismaService | Prisma.TransactionClient,
    studentId: string,
    termId: string,
    baseMaxCredits: number
  ) {
    const approved = await client.academicRequest.findFirst({
      where: {
        studentId,
        termId,
        type: "CREDIT_OVERLOAD",
        status: "APPROVED"
      },
      orderBy: [{ decisionAt: "desc" }, { submittedAt: "desc" }],
      select: {
        requestedCredits: true
      }
    });

    if (!approved?.requestedCredits || approved.requestedCredits <= baseMaxCredits) {
      return baseMaxCredits;
    }

    return approved.requestedCredits;
  }

  private async getEffectiveMaxCredits(defaultMaxCredits: number) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: "max_credits_per_term" },
      select: { value: true }
    });
    const parsed = Number(setting?.value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMaxCredits;
  }

  private async assertStudentExists(studentId: string) {
    const student = await this.prisma.user.findFirst({
      where: {
        id: studentId,
        role: "STUDENT",
        deletedAt: null
      },
      select: { id: true }
    });
    if (!student) {
      throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "Student not found" });
    }
  }

  private async assertAdminActor(userId: string) {
    const actor = await this.prisma.user.findFirst({
      where: {
        id: userId,
        role: "ADMIN",
        deletedAt: null
      },
      select: { id: true }
    });
    if (!actor) {
      throw new ForbiddenException({ code: "ADMIN_FORBIDDEN", message: "Admin access required" });
    }
  }
}
