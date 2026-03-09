import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AcademicRequestType, Prisma, Role } from "@prisma/client";
import type { SubmitCreditOverloadRequestInput } from "@sis/shared";

type SubmissionRouting = {
  requiredApproverRole: Role | null;
  ownerUserId: string | null;
  activeRequestKey?: string | null;
};

type SubmissionPayload = {
  termId?: string | null;
  sectionId?: string | null;
  reason: string;
  requestedCredits?: number | null;
};

type SubmissionBuildResult = {
  routing: SubmissionRouting;
  payload: SubmissionPayload;
  auditMetadata?: Record<string, unknown>;
};

type SubmissionContext<TInput> = {
  tx: Prisma.TransactionClient;
  studentId: string;
  input: TInput;
  getEffectiveMaxCredits: (defaultMaxCredits: number) => Promise<number>;
  buildActiveRequestKey: (studentId: string, termId: string, type: AcademicRequestType) => string;
};

type ApprovedEffectRequest = {
  requestedCredits: number | null;
};

export interface AcademicRequestPolicy<TInput> {
  type: AcademicRequestType;
  duplicatePendingError: {
    code: string;
    message: string;
  };
  buildSubmission(context: SubmissionContext<TInput>): Promise<SubmissionBuildResult>;
  applyApprovedEffect?(request: ApprovedEffectRequest | null, baseValue: number): number;
}

const creditOverloadPolicy: AcademicRequestPolicy<SubmitCreditOverloadRequestInput> = {
  type: "CREDIT_OVERLOAD",
  duplicatePendingError: {
    code: "REQUEST_ALREADY_PENDING",
    message: "An overload request is already pending for this term"
  },
  async buildSubmission({ tx, studentId, input, getEffectiveMaxCredits, buildActiveRequestKey }) {
    const term = await tx.term.findUnique({
      where: { id: input.termId },
      select: { id: true, name: true, maxCredits: true }
    });
    if (!term) {
      throw new NotFoundException({ code: "TERM_NOT_FOUND", message: "Term not found" });
    }

    const effectiveMaxCredits = await getEffectiveMaxCredits(term.maxCredits);
    if (input.requestedCredits <= effectiveMaxCredits) {
      throw new BadRequestException({
        code: "CREDIT_OVERLOAD_NOT_REQUIRED",
        message: `Requested credits must exceed the standard limit of ${effectiveMaxCredits}`
      });
    }

    const assignment = await tx.advisorAssignment.findFirst({
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

    const existingApproved = await tx.academicRequest.findFirst({
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

    return {
      routing: {
        requiredApproverRole: "ADVISOR",
        ownerUserId: assignment.advisorId,
        activeRequestKey: buildActiveRequestKey(studentId, input.termId, "CREDIT_OVERLOAD")
      },
      payload: {
        termId: input.termId,
        reason: input.reason.trim(),
        requestedCredits: input.requestedCredits
      },
      auditMetadata: {
        termId: input.termId,
        requestedCredits: input.requestedCredits,
        ownerUserId: assignment.advisorId
      }
    };
  },
  applyApprovedEffect(request, baseValue) {
    if (!request?.requestedCredits || request.requestedCredits <= baseValue) {
      return baseValue;
    }
    return request.requestedCredits;
  }
};

const POLICY_REGISTRY: Record<AcademicRequestType, AcademicRequestPolicy<any>> = {
  CREDIT_OVERLOAD: creditOverloadPolicy
};

export function getAcademicRequestPolicy<TInput>(type: AcademicRequestType): AcademicRequestPolicy<TInput> {
  return POLICY_REGISTRY[type] as AcademicRequestPolicy<TInput>;
}
