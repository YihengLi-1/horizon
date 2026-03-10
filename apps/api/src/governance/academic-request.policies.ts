import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AcademicRequestType, Prisma, Role } from "@prisma/client";
import type { SubmitCreditOverloadRequestInput, SubmitPrereqOverrideRequestInput } from "@sis/shared";
import { PrismaService } from "../common/prisma.service";

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

const prereqOverridePolicy: AcademicRequestPolicy<SubmitPrereqOverrideRequestInput> = {
  type: "PREREQ_OVERRIDE",
  duplicatePendingError: {
    code: "REQUEST_ALREADY_PENDING",
    message: "A prerequisite override request is already pending for this section"
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
        },
        instructorUser: {
          select: {
            id: true,
            role: true,
            email: true,
            facultyProfile: { select: { displayName: true } }
          }
        }
      }
    });

    if (!section) {
      throw new NotFoundException({ code: "SECTION_NOT_FOUND", message: "Section not found" });
    }

    if (section.course.prerequisiteLinks.length === 0) {
      throw new BadRequestException({
        code: "PREREQ_OVERRIDE_NOT_REQUIRED",
        message: "This section does not require a prerequisite override"
      });
    }

    if (!section.instructorUserId || !section.instructorUser || section.instructorUser.role !== "FACULTY") {
      throw new BadRequestException({
        code: "PREREQ_OVERRIDE_UNAVAILABLE",
        message: "This section does not have an assigned faculty reviewer"
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
        message: "Prerequisite requirements are already satisfied"
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
        message: "A prerequisite override has already been approved for this section"
      });
    }

    const missingPrereqCodes = missingLinks.map((link) => link.prerequisiteCourse.code);

    return {
      routing: {
        requiredApproverRole: "FACULTY",
        ownerUserId: section.instructorUserId,
        activeRequestKey: buildActiveRequestKey(studentId, section.id, "PREREQ_OVERRIDE")
      },
      payload: {
        termId: section.termId,
        sectionId: section.id,
        reason: input.reason.trim()
      },
      auditMetadata: {
        termId: section.termId,
        sectionId: section.id,
        ownerUserId: section.instructorUserId,
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
