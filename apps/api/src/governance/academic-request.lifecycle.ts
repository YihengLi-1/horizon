import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AcademicRequestStatus, AcademicRequestStepOwnerStrategy, AcademicRequestStepStatus, Role } from "@prisma/client";

export type WorkflowStepTemplate = {
  stepKey: string;
  label: string;
  requiredApproverRole: Role;
  ownerStrategy: AcademicRequestStepOwnerStrategy;
  ownerResolutionRefId?: string | null;
};

export type WorkflowRequestStep = {
  id: string;
  stepOrder: number;
  stepKey: string;
  label: string;
  requiredApproverRole: Role;
  ownerStrategy: AcademicRequestStepOwnerStrategy;
  ownerResolutionRefId: string | null;
  ownerResolvedAt: Date | null;
  initialOwnerUserId: string | null;
  ownerUserId: string | null;
  status: AcademicRequestStepStatus;
};

type RequestOwnershipParams = {
  actorUserId: string;
  actorRole: Role;
  ownerUserId: string | null;
  requiredApproverRole: Role | null;
};

export function buildWorkflowStepSeeds(templates: WorkflowStepTemplate[]) {
  if (templates.length === 0) {
    throw new Error("Academic request workflow must define at least one step");
  }

  return templates.map((step, index) => ({
    ...step,
    ownerResolutionRefId: step.ownerResolutionRefId ?? null,
    ownerResolvedAt: null,
    initialOwnerUserId: null,
    ownerUserId: null,
    stepOrder: index + 1,
    status: index === 0 ? ("PENDING" as const) : ("WAITING" as const)
  }));
}

export function assertAcademicRequestOwnership(params: RequestOwnershipParams) {
  const { actorUserId, actorRole, ownerUserId, requiredApproverRole } = params;
  if (requiredApproverRole !== actorRole || ownerUserId !== actorUserId) {
    throw new ForbiddenException({ code: "REQUEST_FORBIDDEN", message: "您无权操作该申请" });
  }
}

export function assertAcademicRequestOpen(currentStatus: AcademicRequestStatus) {
  if (currentStatus !== "SUBMITTED") {
    throw new BadRequestException({
      code: "REQUEST_ALREADY_DECIDED",
      message: "仅待审批状态的申请可进行审批操作"
    });
  }
}

export function getCurrentAcademicRequestStep(request: {
  currentStepOrder: number | null;
  steps: WorkflowRequestStep[];
}) {
  if (!request.currentStepOrder) {
    throw new BadRequestException({
      code: "REQUEST_STEP_INVALID",
      message: "该申请暂无活跃审批步骤"
    });
  }

  const step = request.steps.find((candidate) => candidate.stepOrder === request.currentStepOrder);
  if (!step) {
    throw new BadRequestException({
      code: "REQUEST_STEP_INVALID",
      message: "申请审批流程状态异常"
    });
  }

  if (step.status !== "PENDING") {
    throw new BadRequestException({
      code: "REQUEST_STEP_INVALID",
      message: "当前审批步骤不处于待审批状态"
    });
  }

  if (!step.ownerUserId) {
    throw new BadRequestException({
      code: "REQUEST_STEP_UNRESOLVED",
      message: "当前审批步骤未分配审批人"
    });
  }

  return step;
}

export function buildStepDecisionUpdate(
  actorUserId: string,
  nextStatus: Extract<AcademicRequestStepStatus, "APPROVED" | "REJECTED">,
  decisionNote: string
) {
  return {
    status: nextStatus,
    decisionNote: decisionNote.trim(),
    decidedAt: new Date(),
    decidedByUserId: actorUserId
  } as const;
}

export function buildFinalDecisionUpdate(actorUserId: string, nextStatus: AcademicRequestStatus, decisionNote: string) {
  return {
    status: nextStatus,
    activeRequestKey: null,
    currentStepOrder: null,
    decisionAt: new Date(),
    decisionNote: decisionNote.trim(),
    decidedByUserId: actorUserId,
    requiredApproverRole: null,
    ownerUserId: null
  } as const;
}

export function buildWorkflowProgressionUpdate(nextStep: WorkflowRequestStep) {
  return {
    currentStepOrder: nextStep.stepOrder,
    requiredApproverRole: nextStep.requiredApproverRole,
    ownerUserId: nextStep.ownerUserId
  } as const;
}

export function buildStepReassignmentUpdate(ownerUserId: string | null) {
  return {
    ownerUserId
  } as const;
}

export function buildStepOwnerResolutionUpdate(
  ownerUserId: string,
  initialOwnerUserId: string | null,
  ownerResolvedAt: Date
) {
  return {
    ownerUserId,
    initialOwnerUserId: initialOwnerUserId ?? ownerUserId,
    ownerResolvedAt
  } as const;
}
