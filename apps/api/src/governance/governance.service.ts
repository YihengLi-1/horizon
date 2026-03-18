import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AcademicRequestStatus,
  AcademicRequestStepOwnerStrategy,
  AcademicRequestType,
  HoldType,
  Prisma,
  Role
} from "@prisma/client";
import type {
  CreateHoldInput,
  DecideAcademicRequestInput,
  ReassignAcademicRequestInput,
  ResolveHoldInput,
  SubmitCreditOverloadRequestInput,
  SubmitPrereqOverrideRequestInput
} from "@sis/shared";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../common/prisma.service";
import {
  assertAcademicRequestOpen,
  assertAcademicRequestOwnership,
  buildFinalDecisionUpdate,
  buildStepOwnerResolutionUpdate,
  buildStepReassignmentUpdate,
  buildStepDecisionUpdate,
  buildWorkflowProgressionUpdate,
  buildWorkflowStepSeeds,
  getCurrentAcademicRequestStep
} from "./academic-request.lifecycle";
import { getAcademicRequestPolicy } from "./academic-request.policies";

const HOLD_BLOCKING_TYPES: HoldType[] = ["REGISTRATION", "ACADEMIC", "FINANCIAL"];

const actorSelect = {
  id: true,
  email: true,
  advisorProfile: { select: { displayName: true, department: true } },
  facultyProfile: { select: { displayName: true, department: true } }
} satisfies Prisma.UserSelect;

const academicRequestInclude = Prisma.validator<Prisma.AcademicRequestInclude>()({
  term: { select: { id: true, name: true, maxCredits: true } },
  section: {
    select: {
      id: true,
      sectionCode: true,
      instructorUserId: true,
      course: { select: { code: true, title: true } }
    }
  },
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
  owner: { select: actorSelect },
  decidedBy: { select: actorSelect },
  steps: {
    orderBy: { stepOrder: "asc" },
    include: {
      initialOwner: { select: actorSelect },
      owner: { select: actorSelect },
      decidedBy: { select: actorSelect }
    }
  }
});

type StepDecisionAuditMeta = {
  id: string;
  stepOrder: number;
  stepKey: string;
};

type NextOwnerAuditMeta = {
  stepOrder: number;
  stepKey: string;
  ownerUserId: string | null;
  requiredApproverRole: Role;
  ownerStrategy: AcademicRequestStepOwnerStrategy;
  ownerResolutionRefId: string | null;
};

type StepReassignmentAuditMeta = {
  stepId: string;
  stepOrder: number;
  stepKey: string;
  previousOwnerUserId: string | null;
  currentOwnerUserId: string | null;
  initialOwnerUserId: string | null;
  requiredApproverRole: Role;
  ownerStrategy: AcademicRequestStepOwnerStrategy;
};

type RequestRoutingContext = {
  type: AcademicRequestType;
  studentId: string;
  termId: string | null;
  sectionId: string | null;
};

type ResolvableAcademicRequestStep = {
  id: string;
  stepOrder: number;
  stepKey: string;
  label: string;
  requiredApproverRole: Role;
  ownerStrategy: AcademicRequestStepOwnerStrategy;
  ownerResolutionRefId: string | null;
  initialOwnerUserId: string | null;
  ownerUserId: string | null;
};

type ResolvedStepOwner = {
  ownerUserId: string;
  initialOwnerUserId: string;
  ownerResolvedAt: Date;
};

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
      include: academicRequestInclude,
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

  async listAdminRequests(adminUserId: string) {
    await this.assertAdminActor(adminUserId);
    return this.prisma.academicRequest.findMany({
      where: {
        type: "PREREQ_OVERRIDE",
        status: "SUBMITTED",
        currentStepOrder: { not: null }
      },
      include: academicRequestInclude,
      orderBy: [{ submittedAt: "asc" }]
    });
  }

  async decideAdvisorRequest(advisorUserId: string, requestId: string, input: DecideAcademicRequestInput) {
    return this.decideOwnedRequest(advisorUserId, "ADVISOR", requestId, input);
  }

  async decideFacultyRequest(facultyUserId: string, requestId: string, input: DecideAcademicRequestInput) {
    return this.decideOwnedRequest(facultyUserId, "FACULTY", requestId, input);
  }

  async decideAdminRequest(adminUserId: string, requestId: string, input: DecideAcademicRequestInput) {
    await this.assertAdminActor(adminUserId);
    return this.decideOwnedRequest(adminUserId, "ADMIN", requestId, input);
  }

  async listReassignmentCandidates(adminUserId: string, requestId: string) {
    await this.assertAdminActor(adminUserId);

    const request = await this.prisma.academicRequest.findUnique({
      where: { id: requestId },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" }
        }
      }
    });

    if (!request) {
      throw new NotFoundException({ code: "REQUEST_NOT_FOUND", message: "申请记录不存在" });
    }

    assertAcademicRequestOpen(request.status);
    const currentStep = getCurrentAcademicRequestStep({
      currentStepOrder: request.currentStepOrder,
      steps: request.steps
    });

    const users = await this.prisma.user.findMany({
      where: {
        role: currentStep.requiredApproverRole,
        deletedAt: null
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        email: true,
        role: true,
        facultyProfile: { select: { displayName: true } },
        advisorProfile: { select: { displayName: true } }
      }
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      displayName:
        user.facultyProfile?.displayName ??
        user.advisorProfile?.displayName ??
        user.email,
      currentAssigned: user.id === currentStep.ownerUserId,
      initialAssigned: user.id === currentStep.initialOwnerUserId
    }));
  }

  async reassignCurrentRequestStep(adminUserId: string, requestId: string, input: ReassignAcademicRequestInput) {
    await this.assertAdminActor(adminUserId);

    let reassignmentMeta: StepReassignmentAuditMeta | undefined;

    const request = await this.prisma.$transaction(async (tx) => {
      const requestForRouting = await tx.academicRequest.findUnique({
        where: { id: requestId },
        include: {
          term: academicRequestInclude.term,
          section: academicRequestInclude.section,
          owner: academicRequestInclude.owner,
          decidedBy: academicRequestInclude.decidedBy,
          steps: academicRequestInclude.steps,
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
          }
        }
      });

      if (!requestForRouting) {
        throw new NotFoundException({ code: "REQUEST_NOT_FOUND", message: "申请记录不存在" });
      }

      assertAcademicRequestOpen(requestForRouting.status);
      const currentStep = getCurrentAcademicRequestStep({
        currentStepOrder: requestForRouting.currentStepOrder,
        steps: requestForRouting.steps
      });

      const nextOwner = await tx.user.findFirst({
        where: {
          id: input.ownerUserId,
          role: currentStep.requiredApproverRole,
          deletedAt: null
        },
        select: { id: true }
      });

      if (!nextOwner) {
        throw new BadRequestException({
          code: "REQUEST_REASSIGNMENT_INVALID",
          message: "所选审核人不符合当前审批步骤要求"
        });
      }

      if (currentStep.ownerUserId === nextOwner.id) {
        throw new BadRequestException({
          code: "REQUEST_ALREADY_ASSIGNED",
          message: "该审批步骤已分配给此审核人"
        });
      }

      reassignmentMeta = {
        stepId: currentStep.id,
        stepOrder: currentStep.stepOrder,
        stepKey: currentStep.stepKey,
        previousOwnerUserId: currentStep.ownerUserId,
        currentOwnerUserId: nextOwner.id,
        initialOwnerUserId: currentStep.initialOwnerUserId,
        requiredApproverRole: currentStep.requiredApproverRole,
        ownerStrategy: currentStep.ownerStrategy
      };

      await tx.academicRequestStep.update({
        where: { id: currentStep.id },
        data: buildStepReassignmentUpdate(nextOwner.id)
      });

      await tx.academicRequest.update({
        where: { id: requestId },
        data: { ownerUserId: nextOwner.id }
      });

      return tx.academicRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: academicRequestInclude
      });
    });

    await this.auditService.log({
      actorUserId: adminUserId,
      action: "academic_request_step_reassigned",
      entityType: "academic_request_step",
      entityId: reassignmentMeta?.stepId ?? request.id,
      metadata: {
        requestId: request.id,
        type: request.type,
        studentId: request.studentId,
        termId: request.termId,
        sectionId: request.sectionId,
        stepOrder: reassignmentMeta?.stepOrder ?? null,
        stepKey: reassignmentMeta?.stepKey ?? null,
        previousOwnerUserId: reassignmentMeta?.previousOwnerUserId ?? null,
        currentOwnerUserId: reassignmentMeta?.currentOwnerUserId ?? null,
        initialOwnerUserId: reassignmentMeta?.initialOwnerUserId ?? null,
        requiredApproverRole: reassignmentMeta?.requiredApproverRole ?? null,
        ownerStrategy: reassignmentMeta?.ownerStrategy ?? null,
        note: input.note?.trim() || null
      }
    });

    return request;
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
      throw new NotFoundException({ code: "HOLD_NOT_FOUND", message: "学籍限制记录不存在" });
    }
    if (!hold.active) {
      throw new BadRequestException({ code: "HOLD_ALREADY_RESOLVED", message: "该限制已解除" });
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

  private async resolveStepOwner(
    tx: Prisma.TransactionClient,
    context: RequestRoutingContext,
    step: ResolvableAcademicRequestStep
  ): Promise<ResolvedStepOwner> {
    let ownerUserId: string | null = null;

    switch (step.ownerStrategy) {
      case "DIRECT_USER": {
        const directUserId = step.ownerResolutionRefId ?? step.ownerUserId ?? step.initialOwnerUserId;
        if (!directUserId) {
          throw this.requestStepUnresolved(step, "This workflow step does not have a direct reviewer assigned");
        }
        ownerUserId = await this.validateResolvedOwner(tx, directUserId, step.requiredApproverRole, step);
        break;
      }
      case "PRIMARY_ADVISOR": {
        const assignment = await tx.advisorAssignment.findFirst({
          where: {
            studentId: step.ownerResolutionRefId ?? context.studentId,
            active: true,
            endedAt: null
          },
          orderBy: { assignedAt: "desc" },
          select: {
            advisorId: true,
            advisor: {
              select: {
                id: true,
                role: true,
                deletedAt: true
              }
            }
          }
        });

        if (!assignment || assignment.advisor.role !== step.requiredApproverRole || assignment.advisor.deletedAt) {
          throw this.requestStepUnresolved(step, "No active advisor could be resolved for this workflow step");
        }
        ownerUserId = assignment.advisorId;
        break;
      }
      case "SECTION_INSTRUCTOR": {
        const sectionId = step.ownerResolutionRefId ?? context.sectionId;
        if (!sectionId) {
          throw this.requestStepUnresolved(step, "This workflow step is missing a target section");
        }
        const section = await tx.section.findUnique({
          where: { id: sectionId },
          select: {
            instructorUserId: true,
            instructorUser: {
              select: {
                id: true,
                role: true,
                deletedAt: true
              }
            }
          }
        });

        if (
          !section?.instructorUserId ||
          !section.instructorUser ||
          section.instructorUser.role !== step.requiredApproverRole ||
          section.instructorUser.deletedAt
        ) {
          throw this.requestStepUnresolved(step, "No assigned faculty reviewer could be resolved for this workflow step");
        }
        ownerUserId = section.instructorUserId;
        break;
      }
      case "ADMIN_REVIEWER": {
        const admin = await tx.user.findFirst({
          where: {
            role: step.requiredApproverRole,
            deletedAt: null
          },
          orderBy: [{ createdAt: "asc" }],
          select: { id: true }
        });

        if (!admin) {
          throw this.requestStepUnresolved(step, "No registrar reviewer is currently available for this workflow step");
        }
        ownerUserId = admin.id;
        break;
      }
      default:
        throw this.requestStepUnresolved(step, "Workflow step owner strategy is not supported");
    }

    return {
      ownerUserId,
      initialOwnerUserId: step.initialOwnerUserId ?? ownerUserId,
      ownerResolvedAt: new Date()
    };
  }

  private async validateResolvedOwner(
    tx: Prisma.TransactionClient,
    ownerUserId: string,
    requiredRole: Role,
    step: ResolvableAcademicRequestStep
  ) {
    const user = await tx.user.findFirst({
      where: {
        id: ownerUserId,
        role: requiredRole,
        deletedAt: null
      },
      select: { id: true }
    });

    if (!user) {
      throw this.requestStepUnresolved(step, "The configured reviewer for this workflow step is unavailable");
    }

    return user.id;
  }

  private requestStepUnresolved(step: ResolvableAcademicRequestStep, message: string) {
    return new BadRequestException({
      code: "REQUEST_STEP_UNRESOLVED",
      message,
      details: {
        stepKey: step.stepKey,
        stepOrder: step.stepOrder,
        ownerStrategy: step.ownerStrategy,
        requiredApproverRole: step.requiredApproverRole
      }
    });
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
      throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "学生不存在" });
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
      throw new ForbiddenException({ code: "ADMIN_FORBIDDEN", message: "需要管理员权限" });
    }
  }

  private buildActiveRequestKey(studentId: string, scopeId: string, type: string) {
    return `${studentId}:${scopeId}:${type}`;
  }

  private async listOwnedRequests(actorUserId: string, actorRole: Role) {
    return this.prisma.academicRequest.findMany({
      where: {
        ownerUserId: actorUserId,
        requiredApproverRole: actorRole,
        currentStepOrder: { not: null },
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
          : {})
      },
      include: academicRequestInclude,
      orderBy: [{ submittedAt: "asc" }]
    });
  }

  private async decideOwnedRequest(
    actorUserId: string,
    actorRole: Role,
    requestId: string,
    input: DecideAcademicRequestInput
  ) {
    const nextStatus: AcademicRequestStatus = input.decision === "APPROVED" ? "APPROVED" : "REJECTED";
    let decidedStepMeta: StepDecisionAuditMeta | undefined;
    let nextOwnerMeta: NextOwnerAuditMeta | undefined;

    const request = await this.prisma.$transaction(async (tx) => {
      const requestForDecision = await tx.academicRequest.findFirst({
        where: { id: requestId },
        include: {
          term: academicRequestInclude.term,
          section: academicRequestInclude.section,
          owner: academicRequestInclude.owner,
          decidedBy: academicRequestInclude.decidedBy,
          steps: academicRequestInclude.steps,
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
              },
              adviseeAssignments: {
                where: {
                  advisorId: actorUserId,
                  active: true,
                  endedAt: null
                },
                select: { id: true }
              }
            }
          }
        }
      });

      if (!requestForDecision) {
        throw new NotFoundException({ code: "REQUEST_NOT_FOUND", message: "申请记录不存在" });
      }

      assertAcademicRequestOwnership({
        actorUserId,
        actorRole,
        ownerUserId: requestForDecision.ownerUserId,
        requiredApproverRole: requestForDecision.requiredApproverRole
      });
      assertAcademicRequestOpen(requestForDecision.status);

      const currentStep = getCurrentAcademicRequestStep({
        currentStepOrder: requestForDecision.currentStepOrder,
        steps: requestForDecision.steps
      });
      decidedStepMeta = {
        id: currentStep.id,
        stepOrder: currentStep.stepOrder,
        stepKey: currentStep.stepKey
      };

      if (
        currentStep.requiredApproverRole !== requestForDecision.requiredApproverRole ||
        currentStep.ownerUserId !== requestForDecision.ownerUserId
      ) {
        throw new BadRequestException({
          code: "REQUEST_STEP_INVALID",
          message: "申请归属与当前审批步骤不匹配"
        });
      }

      if (actorRole === "ADVISOR" && requestForDecision.student.adviseeAssignments.length === 0) {
        throw new ForbiddenException({ code: "REQUEST_FORBIDDEN", message: "该学生未分配给此顾问" });
      }

      await tx.academicRequestStep.update({
        where: { id: currentStep.id },
        data: buildStepDecisionUpdate(actorUserId, input.decision, input.decisionNote)
      });

      const nextStep = input.decision === "APPROVED"
        ? requestForDecision.steps.find((step) => step.stepOrder === currentStep.stepOrder + 1) ?? null
        : null;

      if (input.decision === "APPROVED" && nextStep) {
        const resolvedNextOwner = await this.resolveStepOwner(tx, {
          type: requestForDecision.type,
          studentId: requestForDecision.studentId,
          termId: requestForDecision.termId,
          sectionId: requestForDecision.sectionId
        }, nextStep);

        nextOwnerMeta = {
          stepOrder: nextStep.stepOrder,
          stepKey: nextStep.stepKey,
          ownerUserId: resolvedNextOwner.ownerUserId,
          requiredApproverRole: nextStep.requiredApproverRole,
          ownerStrategy: nextStep.ownerStrategy,
          ownerResolutionRefId: nextStep.ownerResolutionRefId
        };
        await tx.academicRequestStep.update({
          where: { id: nextStep.id },
          data: {
            status: "PENDING",
            ...buildStepOwnerResolutionUpdate(
              resolvedNextOwner.ownerUserId,
              nextStep.initialOwnerUserId,
              resolvedNextOwner.ownerResolvedAt
            )
          }
        });

        await tx.academicRequest.update({
          where: { id: requestId },
          data: buildWorkflowProgressionUpdate({
            ...nextStep,
            ownerUserId: resolvedNextOwner.ownerUserId,
            initialOwnerUserId: resolvedNextOwner.initialOwnerUserId,
            ownerResolvedAt: resolvedNextOwner.ownerResolvedAt
          })
        });
      } else {
        await tx.academicRequestStep.updateMany({
          where: {
            requestId,
            status: "WAITING"
          },
          data: {
            status: "SKIPPED"
          }
        });

        await tx.academicRequest.update({
          where: { id: requestId },
          data: buildFinalDecisionUpdate(actorUserId, nextStatus, input.decisionNote)
        });
      }

      return tx.academicRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: academicRequestInclude
      });
    });

    await this.auditService.log({
      actorUserId,
      action: "academic_request_step_decision",
      entityType: "academic_request_step",
      entityId: decidedStepMeta?.id ?? request.id,
      metadata: {
        requestId: request.id,
        type: request.type,
        studentId: request.studentId,
        termId: request.termId,
        sectionId: request.sectionId,
        stepOrder: decidedStepMeta?.stepOrder ?? null,
        stepKey: decidedStepMeta?.stepKey ?? null,
        decision: input.decision,
        requestStatus: request.status
      }
    });

    if (nextOwnerMeta) {
      await this.auditService.log({
        actorUserId,
        action: "academic_request_owner_transition",
        entityType: "academic_request",
        entityId: request.id,
        metadata: {
          type: request.type,
          studentId: request.studentId,
          termId: request.termId,
          sectionId: request.sectionId,
          nextStepOrder: nextOwnerMeta.stepOrder,
          nextStepKey: nextOwnerMeta.stepKey,
          nextOwnerUserId: nextOwnerMeta.ownerUserId,
          nextOwnerRole: nextOwnerMeta.requiredApproverRole,
          nextOwnerStrategy: nextOwnerMeta.ownerStrategy,
          nextOwnerResolutionRefId: nextOwnerMeta.ownerResolutionRefId
        }
      });
    } else {
      await this.auditService.log({
        actorUserId,
        action: "academic_request_decision",
        entityType: "academic_request",
        entityId: request.id,
        metadata: {
          decision: request.status,
          type: request.type,
          studentId: request.studentId,
          termId: request.termId,
          sectionId: request.sectionId
        }
      });
    }

    return request;
  }

  private async submitAcademicRequest<TInput>(studentId: string, type: AcademicRequestType, input: TInput) {
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
          buildActiveRequestKey: (requestStudentId, scopeId, requestType) =>
            this.buildActiveRequestKey(requestStudentId, scopeId, requestType)
        });

        auditMetadata = built.auditMetadata;

        if (built.activeRequestKey) {
          const existingPending = await tx.academicRequest.findFirst({
            where: {
              activeRequestKey: built.activeRequestKey
            },
            orderBy: { submittedAt: "desc" }
          });
          if (existingPending) {
            throw new BadRequestException(policy.duplicatePendingError);
          }
        }

        const seededSteps = buildWorkflowStepSeeds(built.workflowSteps);
        const currentStep = seededSteps[0];
        const resolvedCurrentOwner = await this.resolveStepOwner(
          tx,
          {
            type,
            studentId,
            termId: built.payload.termId ?? null,
            sectionId: built.payload.sectionId ?? null
          },
          {
            ...currentStep,
            id: `seed-${currentStep.stepOrder}`
          }
        );

        auditMetadata = {
          ...(auditMetadata ?? {}),
          ownerUserId: resolvedCurrentOwner.ownerUserId
        };

        return tx.academicRequest.create({
          data: {
            studentId,
            type,
            status: "SUBMITTED",
            currentStepOrder: currentStep.stepOrder,
            termId: built.payload.termId ?? null,
            sectionId: built.payload.sectionId ?? null,
            reason: built.payload.reason,
            requestedCredits: built.payload.requestedCredits ?? null,
            requiredApproverRole: currentStep.requiredApproverRole,
            ownerUserId: resolvedCurrentOwner.ownerUserId,
            activeRequestKey: built.activeRequestKey ?? null,
            steps: {
              create: seededSteps.map((step) => ({
                stepOrder: step.stepOrder,
                stepKey: step.stepKey,
                label: step.label,
                requiredApproverRole: step.requiredApproverRole,
                ownerStrategy: step.ownerStrategy,
                ownerResolutionRefId: step.ownerResolutionRefId,
                ownerResolvedAt: step.stepOrder === currentStep.stepOrder ? resolvedCurrentOwner.ownerResolvedAt : null,
                initialOwnerUserId:
                  step.stepOrder === currentStep.stepOrder ? resolvedCurrentOwner.initialOwnerUserId : step.initialOwnerUserId,
                ownerUserId: step.stepOrder === currentStep.stepOrder ? resolvedCurrentOwner.ownerUserId : step.ownerUserId,
                status: step.status
              }))
            }
          },
          include: academicRequestInclude
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
