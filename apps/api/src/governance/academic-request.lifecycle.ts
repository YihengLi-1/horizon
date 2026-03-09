import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AcademicRequestStatus, Role } from "@prisma/client";

const ALLOWED_TRANSITIONS: Record<AcademicRequestStatus, AcademicRequestStatus[]> = {
  SUBMITTED: ["APPROVED", "REJECTED", "WITHDRAWN"],
  APPROVED: [],
  REJECTED: [],
  WITHDRAWN: []
};

type RequestOwnershipParams = {
  actorUserId: string;
  actorRole: Role;
  ownerUserId: string | null;
  requiredApproverRole: Role | null;
};

export function assertAcademicRequestOwnership(params: RequestOwnershipParams) {
  const { actorUserId, actorRole, ownerUserId, requiredApproverRole } = params;
  if (requiredApproverRole !== actorRole || ownerUserId !== actorUserId) {
    throw new ForbiddenException({ code: "REQUEST_FORBIDDEN", message: "You do not own this request" });
  }
}

export function assertAcademicRequestTransition(
  currentStatus: AcademicRequestStatus,
  nextStatus: AcademicRequestStatus
) {
  if (currentStatus === nextStatus) {
    throw new BadRequestException({
      code: "REQUEST_TRANSITION_INVALID",
      message: `Academic request is already ${currentStatus.toLowerCase()}`
    });
  }

  const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    if (currentStatus !== "SUBMITTED") {
      throw new BadRequestException({
        code: "REQUEST_ALREADY_DECIDED",
        message: "Only submitted requests can be decided"
      });
    }

    throw new BadRequestException({
      code: "REQUEST_TRANSITION_INVALID",
      message: `Cannot transition request from ${currentStatus} to ${nextStatus}`
    });
  }
}

export function buildDecisionUpdate(actorUserId: string, nextStatus: AcademicRequestStatus, decisionNote: string) {
  return {
    status: nextStatus,
    activeRequestKey: null,
    decisionAt: new Date(),
    decisionNote: decisionNote.trim(),
    decidedByUserId: actorUserId,
    requiredApproverRole: null,
    ownerUserId: null
  } as const;
}
