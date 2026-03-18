import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AcademicRequestType, Prisma, Role } from "@prisma/client";
import type { SubmitCreditOverloadRequestInput, SubmitPrereqOverrideRequestInput } from "@sis/shared";
import { PrismaService } from "../common/prisma.service";
import type { WorkflowStepTemplate } from "./academic-request.lifecycle";

type SubmissionPayload = {
  termId?: string | null;
  sectionId?: string | null;
  reason: string;
  requestedCredits?: number | null;
};

type SubmissionBuildResult = {
  activeRequestKey?: string | null;
  payload: SubmissionPayload;
  workflowSteps: [WorkflowStepTemplate, ...WorkflowStepTemplate[]];
  auditMetadata?: Record<string, unknown>;
};

type SubmissionContext<TInput> = {
  tx: Prisma.TransactionClient;
  studentId: string;
  input: TInput;
  getEffectiveMaxCredits: (defaultMaxCredits: number) => Promise<number>;
  buildActiveRequestKey: (studentId: string, scopeId: string, type: AcademicRequestType) => string;
};

type ApprovedEffectRequest = {
  requestedCredits: number | null;
};

type ApprovedSectionEffectContext = {
  client: Prisma.TransactionClient | PrismaService;
  studentId: string;
  sectionId: string;
};

export interface AcademicRequestPolicy<TInput> {
  type: AcademicRequestType;
  duplicatePendingError: {
    code: string;
    message: string;
  };
  buildSubmission(context: SubmissionContext<TInput>): Promise<SubmissionBuildResult>;
  applyApprovedEffect?(request: ApprovedEffectRequest | null, baseValue: number): number;
  hasApprovedSectionEffect?(context: ApprovedSectionEffectContext): Promise<boolean>;
}

const creditOverloadPolicy: AcademicRequestPolicy<SubmitCreditOverloadRequestInput> = {
  type: "CREDIT_OVERLOAD",
  duplicatePendingError: {
    code: "REQUEST_ALREADY_PENDING",
    message: "该学期已有待审批的超学分申请"
  },
  async buildSubmission({ tx, studentId, input, getEffectiveMaxCredits, buildActiveRequestKey }) {
    const term = await tx.term.findUnique({
      where: { id: input.termId },
      select: { id: true, name: true, maxCredits: true }
    });
    if (!term) {
      throw new NotFoundException({ code: "TERM_NOT_FOUND", message: "学期不存在" });
    }

    const effectiveMaxCredits = await getEffectiveMaxCredits(term.maxCredits);
    if (input.requestedCredits <= effectiveMaxCredits) {
      throw new BadRequestException({
        code: "CREDIT_OVERLOAD_NOT_REQUIRED",
        message: `申请学分数必须超过当前上限 ${effectiveMaxCredits}`
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
        message: "暂无活跃导师可审批超学分申请"
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
        message: `已有已批准的超学分申请，上限为 ${existingApproved.requestedCredits} 学分`
      });
    }

    return {
      activeRequestKey: buildActiveRequestKey(studentId, input.termId, "CREDIT_OVERLOAD"),
      payload: {
        termId: input.termId,
        reason: input.reason.trim(),
        requestedCredits: input.requestedCredits
      },
      workflowSteps: [
        {
          stepKey: "advisor_review",
          label: "Advisor Review",
          requiredApproverRole: "ADVISOR",
          ownerStrategy: "DIRECT_USER",
          ownerResolutionRefId: assignment.advisorId
        }
      ],
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

const prereqOverridePolicy: AcademicRequestPolicy<SubmitPrereqOverrideRequestInput> = {
  type: "PREREQ_OVERRIDE",
  duplicatePendingError: {
    code: "REQUEST_ALREADY_PENDING",
    message: "该教学班已有待审批的先修课豁免申请"
  },
  async buildSubmission({ tx, studentId, input, buildActiveRequestKey }) {
    const section = await tx.section.findUnique({
      where: { id: input.sectionId },
      include: {
        course: {
          include: {
            prerequisiteLinks: {
              include: {
                prerequisiteCourse: {
                  select: { id: true, code: true }
                }
              }
            }
          }
        }
      }
    });

    if (!section) {
      throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "教学班不存在" });
    }

    if (section.course.prerequisiteLinks.length === 0) {
      throw new BadRequestException({
        code: "PREREQ_OVERRIDE_NOT_REQUIRED",
        message: "该教学班不需要先修课豁免"
      });
    }

    const prereqCourseIds = section.course.prerequisiteLinks.map((link) => link.prerequisiteCourseId);
    const completed = await tx.enrollment.findMany({
      where: {
        studentId,
        deletedAt: null,
        status: "COMPLETED",
        section: { courseId: { in: prereqCourseIds } }
      },
      select: {
        section: {
          select: {
            courseId: true
          }
        }
      }
    });

    const completedCourseIds = new Set(completed.map((row) => row.section.courseId));
    const missingLinks = section.course.prerequisiteLinks.filter(
      (link) => !completedCourseIds.has(link.prerequisiteCourseId)
    );

    if (missingLinks.length === 0) {
      throw new BadRequestException({
        code: "PREREQ_OVERRIDE_NOT_REQUIRED",
        message: "先修课要求已满足，无需申请豁免"
      });
    }

    const existingApproved = await tx.academicRequest.findFirst({
      where: {
        studentId,
        sectionId: section.id,
        type: "PREREQ_OVERRIDE",
        status: "APPROVED"
      },
      select: { id: true }
    });

    if (existingApproved) {
      throw new BadRequestException({
        code: "REQUEST_ALREADY_APPROVED",
        message: "该教学班的先修课豁免申请已获批准"
      });
    }

    const missingPrereqCodes = missingLinks.map((link) => link.prerequisiteCourse.code);

    return {
      activeRequestKey: buildActiveRequestKey(studentId, section.id, "PREREQ_OVERRIDE"),
      payload: {
        termId: section.termId,
        sectionId: section.id,
        reason: input.reason.trim()
      },
      workflowSteps: [
        {
          stepKey: "faculty_review",
          label: "Faculty Review",
          requiredApproverRole: "FACULTY",
          ownerStrategy: "SECTION_INSTRUCTOR",
          ownerResolutionRefId: section.id
        },
        {
          stepKey: "registrar_finalization",
          label: "Registrar Finalization",
          requiredApproverRole: "ADMIN",
          ownerStrategy: "ADMIN_REVIEWER",
          ownerResolutionRefId: null
        }
      ],
      auditMetadata: {
        termId: section.termId,
        sectionId: section.id,
        missingPrereqCodes
      }
    };
  },
  async hasApprovedSectionEffect({ client, studentId, sectionId }) {
    const approved = await client.academicRequest.findFirst({
      where: {
        studentId,
        sectionId,
        type: "PREREQ_OVERRIDE",
        status: "APPROVED"
      },
      select: { id: true }
    });

    return Boolean(approved);
  }
};

const POLICY_REGISTRY: Record<AcademicRequestType, AcademicRequestPolicy<any>> = {
  CREDIT_OVERLOAD: creditOverloadPolicy,
  PREREQ_OVERRIDE: prereqOverridePolicy
};

export function getAcademicRequestPolicy<TInput>(type: AcademicRequestType): AcademicRequestPolicy<TInput> {
  return POLICY_REGISTRY[type] as AcademicRequestPolicy<TInput>;
}
