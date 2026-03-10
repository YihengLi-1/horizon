import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AcademicRequestStatus, AcademicRequestType, HoldType, Prisma, Role } from "@prisma/client";
import type {
  CreateHoldInput,
  DecideAcademicRequestInput,
  ResolveHoldInput,
  SubmitCreditOverloadRequestInput,
  SubmitPrereqOverrideRequestInput
} from "@sis/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../common/prisma.service";
import {
  assertAcademicRequestOwnership,
  assertAcademicRequestTransition,
  buildDecisionUpdate
} from "./academic-request.lifecycle";
import { getAcademicRequestPolicy } from "./academic-request.policies";

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
            advisorProfile: { select: { displayName: true, department: true } },
            facultyProfile: { select: { displayName: true, department: true } }
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
    return this.submitAcademicRequest(studentId, "CREDIT_OVERLOAD", input);
  }

  async submitPrereqOverrideRequest(studentId: string, input: SubmitPrereqOverrideRequestInput) {
    return this.submitAcademicRequest(studentId, "PREREQ_OVERRIDE", input);
  }

  async listAdvisorRequests(advisorUserId: string) {
    return this.listOwnedRequests(advisorUserId, "ADVISOR");
  }

  async listFacultyRequests(facultyUserId: string) {
    return this.listOwnedRequests(facultyUserId, "FACULTY");
  }

  async decideAdvisorRequest(advisorUserId: string, requestId: string, input: DecideAcademicRequestInput) {
    return this.decideOwnedRequest(advisorUserId, "ADVISOR", requestId, input);
  }

  async decideFacultyRequest(facultyUserId: string, requestId: string, input: DecideAcademicRequestInput) {
    return this.decideOwnedRequest(facultyUserId, "FACULTY", requestId, input);
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
    const policy = getAcademicRequestPolicy<SubmitCreditOverloadRequestInput>("CREDIT_OVERLOAD");
    return policy.applyApprovedEffect ? policy.applyApprovedEffect(approved, baseMaxCredits) : baseMaxCredits;
  }

  async hasApprovedPrerequisiteOverride(
    client: PrismaService | Prisma.TransactionClient,
    studentId: string,
    sectionId: string
  ) {
    const policy = getAcademicRequestPolicy<SubmitPrereqOverrideRequestInput>("PREREQ_OVERRIDE");
    if (!policy.hasApprovedSectionEffect) return false;
    return policy.hasApprovedSectionEffect({ client, studentId, sectionId });
  }

  async getApprovedPrerequisiteOverrideSectionIds(
    client: PrismaService | Prisma.TransactionClient,
    studentId: string,
    sectionIds: string[]
  ) {
    if (sectionIds.length === 0) return new Set<string>();
    const approved = await client.academicRequest.findMany({
      where: {
        studentId,
        sectionId: { in: sectionIds },
        type: "PREREQ_OVERRIDE",
        status: "APPROVED"
      },
      select: { sectionId: true }
    });
    return new Set(approved.map((request) => request.sectionId).filter((value): value is string => Boolean(value)));
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

  private buildActiveRequestKey(studentId: string, termId: string, type: AcademicRequestType) {
    return `${studentId}:${termId}:${type}`;
  }

  private async listOwnedRequests(actorUserId: string, actorRole: Role) {
    return this.prisma.academicRequest.findMany({
      where: {
        ownerUserId: actorUserId,
        requiredApproverRole: actorRole,
        status: "SUBMITTED",
        ...(actorRole === "ADVISOR"
          ? {
              student: {
                adviseeAssignments: {
                  some: {
                    advisorId: actorUserId,
                    active: true,
                    endedAt: null
                  }
                }
              }
            }
          : {}),
        ...(actorRole === "FACULTY"
          ? {
              section: {
                instructorUserId: actorUserId
              }
            }
          : {})
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
        term: { select: { id: true, name: true, maxCredits: true } },
        section: {
          select: {
            id: true,
            sectionCode: true,
            instructorUserId: true,
            course: { select: { code: true, title: true } }
          }
        }
      },
      orderBy: [{ submittedAt: "asc" }]
    });
  }

  private async decideOwnedRequest(
    actorUserId: string,
    actorRole: Role,
    requestId: string,
    input: DecideAcademicRequestInput
  ) {
    const request = await this.prisma.academicRequest.findFirst({
      where: { id: requestId },
      include: {
        student: {
          select: {
            id: true,
            adviseeAssignments: {
              where: {
                advisorId: actorUserId,
                active: true,
                endedAt: null
              },
              select: { id: true }
            }
          }
        },
        section: {
          select: {
            id: true,
            instructorUserId: true,
            sectionCode: true,
            course: { select: { code: true, title: true } }
          }
        },
        term: { select: { id: true, name: true } }
      }
    });

    if (!request) {
      throw new NotFoundException({ code: "REQUEST_NOT_FOUND", message: "Academic request not found" });
    }

    assertAcademicRequestOwnership({
      actorUserId,
      actorRole,
      ownerUserId: request.ownerUserId,
      requiredApproverRole: request.requiredApproverRole
    });

    if (actorRole === "ADVISOR" && request.student.adviseeAssignments.length === 0) {
      throw new ForbiddenException({ code: "REQUEST_FORBIDDEN", message: "Student is not assigned to this advisor" });
    }

    if (actorRole === "FACULTY" && request.section?.instructorUserId !== actorUserId) {
      throw new ForbiddenException({ code: "REQUEST_FORBIDDEN", message: "Section is not owned by this faculty member" });
    }

    const nextStatus: AcademicRequestStatus = input.decision === "APPROVED" ? "APPROVED" : "REJECTED";
    assertAcademicRequestTransition(request.status, nextStatus);

    const decided = await this.prisma.academicRequest.update({
      where: { id: requestId },
      data: buildDecisionUpdate(actorUserId, nextStatus, input.decisionNote),
      include: {
        student: {
          select: {
            id: true,
            email: true,
            studentId: true,
            studentProfile: { select: { legalName: true } }
          }
        },
        term: { select: { id: true, name: true } },
        section: {
          select: {
            id: true,
            sectionCode: true,
            course: { select: { code: true, title: true } }
          }
        }
      }
    });

    await this.auditService.log({
      actorUserId,
      action: "academic_request_decision",
      entityType: "academic_request",
      entityId: decided.id,
      metadata: {
        decision: decided.status,
        type: decided.type,
        studentId: decided.studentId,
        termId: decided.termId,
        sectionId: decided.sectionId
      }
    });

    return decided;
  }

  private async submitAcademicRequest<TInput>(
    studentId: string,
    type: AcademicRequestType,
    input: TInput
  ) {
    const policy = getAcademicRequestPolicy<TInput>(type);

    let request;
    let auditMetadata: Record<string, unknown> | undefined;

    try {
      request = await this.prisma.$transaction(async (tx) => {
        const built = await policy.buildSubmission({
          tx,
          studentId,
          input,
          getEffectiveMaxCredits: (defaultMaxCredits) => this.getEffectiveMaxCredits(defaultMaxCredits),
          buildActiveRequestKey: (requestStudentId, termId, requestType) =>
            this.buildActiveRequestKey(requestStudentId, termId, requestType)
        });

        auditMetadata = built.auditMetadata;

        if (built.routing.activeRequestKey) {
          const existingPending = await tx.academicRequest.findFirst({
            where: {
              activeRequestKey: built.routing.activeRequestKey
            },
            orderBy: { submittedAt: "desc" }
          });
          if (existingPending) {
            throw new BadRequestException(policy.duplicatePendingError);
          }
        }

        return tx.academicRequest.create({
          data: {
            studentId,
            type,
            status: "SUBMITTED",
            termId: built.payload.termId ?? null,
            sectionId: built.payload.sectionId ?? null,
            reason: built.payload.reason,
            requestedCredits: built.payload.requestedCredits ?? null,
            requiredApproverRole: built.routing.requiredApproverRole,
            ownerUserId: built.routing.ownerUserId,
            activeRequestKey: built.routing.activeRequestKey ?? null
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
      });
    } catch (error) {
      if ((error as { code?: string } | undefined)?.code === "P2002") {
        throw new BadRequestException(policy.duplicatePendingError);
      }
      throw error;
    }

    await this.auditService.log({
      actorUserId: studentId,
      action: "academic_request_submit",
      entityType: "academic_request",
      entityId: request.id,
      metadata: {
        type: request.type,
        ...auditMetadata
      }
    });

    return request;
  }
}
