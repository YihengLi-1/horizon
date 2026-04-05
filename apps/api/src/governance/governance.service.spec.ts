import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { GovernanceService } from "./governance.service";

function createGovernanceService() {
  const prisma = {
    systemSetting: {
      findUnique: jest.fn()
    },
    term: {
      findUnique: jest.fn()
    },
    section: {
      findUnique: jest.fn()
    },
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn()
    },
    advisorAssignment: {
      findFirst: jest.fn()
    },
    enrollment: {
      findMany: jest.fn()
    },
    academicRequest: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    academicRequestStep: {
      update: jest.fn(),
      updateMany: jest.fn()
    },
    studentHold: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn()
    },
    $transaction: jest.fn()
  } as any;

  prisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => callback(prisma));

  const auditService = {
    log: jest.fn().mockResolvedValue(undefined)
  } as any;

  return {
    prisma,
    auditService,
    service: new GovernanceService(prisma, auditService)
  };
}

function makeStep(overrides?: Partial<any>) {
  const ownerUserId = Object.prototype.hasOwnProperty.call(overrides ?? {}, "ownerUserId")
    ? overrides?.ownerUserId ?? null
    : "advisor-1";
  const initialOwnerUserId = Object.prototype.hasOwnProperty.call(overrides ?? {}, "initialOwnerUserId")
    ? overrides?.initialOwnerUserId ?? null
    : ownerUserId;
  const ownerResolvedAt = Object.prototype.hasOwnProperty.call(overrides ?? {}, "ownerResolvedAt")
    ? overrides?.ownerResolvedAt ?? null
    : ownerUserId
      ? new Date("2026-08-01T00:00:00Z")
      : null;
  const ownerResolutionRefId = Object.prototype.hasOwnProperty.call(overrides ?? {}, "ownerResolutionRefId")
    ? overrides?.ownerResolutionRefId ?? null
    : ownerUserId;

  return {
    id: "step-1",
    stepOrder: 1,
    stepKey: "advisor_review",
    label: "Advisor Review",
    requiredApproverRole: "ADVISOR",
    ownerStrategy: "DIRECT_USER",
    ownerResolutionRefId,
    ownerResolvedAt,
    initialOwnerUserId,
    ownerUserId,
    status: "PENDING",
    owner: null,
    decidedBy: null,
    decisionNote: null,
    decidedAt: null,
    ...overrides
  };
}

function makeRequest(overrides?: Partial<any>) {
  return {
    id: "request-1",
    studentId: "student-1",
    termId: "term-1",
    sectionId: null,
    type: "CREDIT_OVERLOAD",
    status: "SUBMITTED",
    currentStepOrder: 1,
    requiredApproverRole: "ADVISOR",
    ownerUserId: "advisor-1",
    activeRequestKey: "student-1:term-1:CREDIT_OVERLOAD",
    reason: "Need more credits",
    requestedCredits: 21,
    submittedAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    decisionAt: null,
    decisionNote: null,
    student: {
      id: "student-1",
      email: "student1@sis.edu",
      studentId: "S2601",
      studentProfile: {
        legalName: "Student One",
        programMajor: "CS",
        academicStatus: "Good Standing"
      },
      adviseeAssignments: [{ id: "assignment-1" }]
    },
    term: { id: "term-1", name: "Fall 2026", maxCredits: 18 },
    section: null,
    owner: null,
    decidedBy: null,
    steps: [makeStep()],
    ...overrides
  };
}

describe("GovernanceService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("submits a credit overload request with a seeded advisor workflow step", async () => {
    const { prisma, auditService, service } = createGovernanceService();
    prisma.systemSetting.findUnique.mockResolvedValue({ value: "18" });
    prisma.term.findUnique.mockResolvedValue({ id: "term-1", name: "Fall 2026", maxCredits: 18 });
    prisma.user.findFirst.mockResolvedValue({ id: "advisor-1" });
    prisma.advisorAssignment.findFirst.mockResolvedValue({
      advisorId: "advisor-1",
      advisor: { id: "advisor-1", role: "ADVISOR", email: "advisor1@sis.edu", advisorProfile: { displayName: "Advisor One" } }
    });
    prisma.academicRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.academicRequest.create.mockResolvedValue(
      makeRequest({
        ownerUserId: "advisor-1",
        requiredApproverRole: "ADVISOR",
        steps: [makeStep()] 
      })
    );

    const request = await service.submitCreditOverloadRequest("student-1", {
      termId: "term-1",
      requestedCredits: 21,
      reason: "Need 21 credits to stay on track"
    });

    expect(prisma.academicRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: "student-1",
          activeRequestKey: "student-1:term-1:CREDIT_OVERLOAD",
          ownerUserId: "advisor-1",
          requiredApproverRole: "ADVISOR",
          currentStepOrder: 1,
          steps: {
            create: [
              expect.objectContaining({
                stepKey: "advisor_review",
                status: "PENDING",
                requiredApproverRole: "ADVISOR",
                ownerStrategy: "DIRECT_USER",
                ownerResolutionRefId: "advisor-1",
                ownerUserId: "advisor-1",
                initialOwnerUserId: "advisor-1"
              })
            ]
          }
        })
      })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: "student-1", action: "academic_request_submit", entityId: request.id })
    );
  });

  it("submits a prerequisite override request with faculty and registrar workflow steps", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.section.findUnique.mockResolvedValue({
      id: "section-1",
      termId: "term-1",
      instructorUserId: "faculty-1",
      instructorUser: {
        id: "faculty-1",
        role: "FACULTY",
        deletedAt: null
      },
      course: {
        prerequisiteLinks: [
          {
            prerequisiteCourseId: "course-1",
            prerequisiteCourse: { id: "course-1", code: "CS101" }
          }
        ]
      }
    });
    prisma.enrollment.findMany.mockResolvedValue([]);
    prisma.academicRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.user.findFirst.mockResolvedValue({ id: "faculty-1" });
    prisma.academicRequest.create.mockResolvedValue(
      makeRequest({
        id: "request-2",
        type: "PREREQ_OVERRIDE",
        sectionId: "section-1",
        ownerUserId: "faculty-1",
        requiredApproverRole: "FACULTY",
        activeRequestKey: "student-1:section-1:PREREQ_OVERRIDE",
        requestedCredits: null,
        section: {
          id: "section-1",
          instructorUserId: "faculty-1",
          sectionCode: "CS201-F1",
          course: { code: "CS201", title: "Data Structures" }
        },
        steps: [
          makeStep({
            id: "step-1",
            stepKey: "faculty_review",
            label: "Faculty Review",
            requiredApproverRole: "FACULTY",
            ownerStrategy: "SECTION_INSTRUCTOR",
            ownerResolutionRefId: "section-1",
            ownerUserId: "faculty-1",
            status: "PENDING"
          }),
          makeStep({
            id: "step-2",
            stepOrder: 2,
            stepKey: "registrar_finalization",
            label: "Registrar Finalization",
            requiredApproverRole: "ADMIN",
            ownerStrategy: "ADMIN_REVIEWER",
            ownerResolutionRefId: null,
            ownerUserId: null,
            initialOwnerUserId: null,
            ownerResolvedAt: null,
            status: "WAITING"
          })
        ]
      })
    );

    const request = await service.submitPrereqOverrideRequest("student-1", {
      sectionId: "section-1",
      reason: "I have equivalent prior experience and need a prerequisite override"
    });

    expect(prisma.academicRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: "student-1",
          sectionId: "section-1",
          ownerUserId: "faculty-1",
          requiredApproverRole: "FACULTY",
          currentStepOrder: 1,
          activeRequestKey: "student-1:section-1:PREREQ_OVERRIDE",
          steps: {
            create: [
              expect.objectContaining({
                stepKey: "faculty_review",
                stepOrder: 1,
                status: "PENDING",
                ownerStrategy: "SECTION_INSTRUCTOR",
                ownerResolutionRefId: "section-1",
                ownerUserId: "faculty-1",
                initialOwnerUserId: "faculty-1"
              }),
              expect.objectContaining({
                stepKey: "registrar_finalization",
                stepOrder: 2,
                status: "WAITING",
                ownerStrategy: "ADMIN_REVIEWER",
                ownerResolutionRefId: null,
                ownerUserId: null,
                initialOwnerUserId: null
              })
            ]
          }
        })
      })
    );
    expect(request.type).toBe("PREREQ_OVERRIDE");
  });

  it("fails prerequisite override submission when the active faculty step cannot resolve an owner", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.section.findUnique.mockResolvedValue({
      id: "section-1",
      termId: "term-1",
      instructorUserId: null,
      course: {
        prerequisiteLinks: [
          {
            prerequisiteCourseId: "course-1",
            prerequisiteCourse: { id: "course-1", code: "CS101" }
          }
        ]
      }
    });
    prisma.enrollment.findMany.mockResolvedValue([]);
    prisma.academicRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(
      service.submitPrereqOverrideRequest("student-1", {
        sectionId: "section-1",
        reason: "Need faculty review for prerequisite override"
      })
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "REQUEST_STEP_UNRESOLVED"
      })
    });
  });

  it("advances a prerequisite override from faculty review to registrar finalization", async () => {
    const { prisma, auditService, service } = createGovernanceService();
    prisma.user.findFirst.mockResolvedValue({ id: "admin-1" });
    prisma.academicRequest.findFirst.mockResolvedValue(
      makeRequest({
        id: "request-4",
        type: "PREREQ_OVERRIDE",
        sectionId: "section-1",
        ownerUserId: "faculty-1",
        requiredApproverRole: "FACULTY",
        currentStepOrder: 1,
        student: {
          id: "student-1",
          email: "student1@sis.edu",
          studentId: "S2601",
          studentProfile: { legalName: "Student One", programMajor: "CS", academicStatus: "Good Standing" },
          adviseeAssignments: []
        },
        section: {
          id: "section-1",
          instructorUserId: "faculty-1",
          sectionCode: "CS201-F1",
          course: { code: "CS201", title: "Data Structures" }
        },
        steps: [
          makeStep({
            id: "step-faculty",
            stepKey: "faculty_review",
            label: "Faculty Review",
            requiredApproverRole: "FACULTY",
            ownerStrategy: "SECTION_INSTRUCTOR",
            ownerResolutionRefId: "section-1",
            ownerUserId: "faculty-1",
            status: "PENDING"
          }),
          makeStep({
            id: "step-admin",
            stepOrder: 2,
            stepKey: "registrar_finalization",
            label: "Registrar Finalization",
            requiredApproverRole: "ADMIN",
            ownerStrategy: "ADMIN_REVIEWER",
            ownerResolutionRefId: null,
            ownerUserId: null,
            initialOwnerUserId: null,
            ownerResolvedAt: null,
            status: "WAITING"
          })
        ]
      })
    );
    prisma.academicRequest.findUniqueOrThrow.mockResolvedValue(
      makeRequest({
        id: "request-4",
        type: "PREREQ_OVERRIDE",
        sectionId: "section-1",
        status: "SUBMITTED",
        ownerUserId: "admin-1",
        requiredApproverRole: "ADMIN",
        currentStepOrder: 2,
        student: {
          id: "student-1",
          email: "student1@sis.edu",
          studentId: "S2601",
          studentProfile: { legalName: "Student One", programMajor: "CS", academicStatus: "Good Standing" }
        },
        section: {
          id: "section-1",
          instructorUserId: "faculty-1",
          sectionCode: "CS201-F1",
          course: { code: "CS201", title: "Data Structures" }
        },
        steps: [
          makeStep({
            id: "step-faculty",
            stepKey: "faculty_review",
            label: "Faculty Review",
            requiredApproverRole: "FACULTY",
            ownerStrategy: "SECTION_INSTRUCTOR",
            ownerResolutionRefId: "section-1",
            ownerUserId: "faculty-1",
            status: "APPROVED",
            decisionNote: "Faculty supports the override"
          }),
          makeStep({
            id: "step-admin",
            stepOrder: 2,
            stepKey: "registrar_finalization",
            label: "Registrar Finalization",
            requiredApproverRole: "ADMIN",
            ownerStrategy: "ADMIN_REVIEWER",
            ownerResolutionRefId: null,
            ownerUserId: "admin-1",
            initialOwnerUserId: "admin-1",
            status: "PENDING"
          })
        ]
      })
    );

    const decided = await service.decideFacultyRequest("faculty-1", "request-4", {
      decision: "APPROVED",
      decisionNote: "Faculty supports the override"
    });

    expect(prisma.academicRequestStep.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "step-faculty" },
        data: expect.objectContaining({ status: "APPROVED", decidedByUserId: "faculty-1" })
      })
    );
    expect(prisma.academicRequestStep.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: "step-admin" },
        data: expect.objectContaining({
          status: "PENDING",
          ownerUserId: "admin-1",
          initialOwnerUserId: "admin-1",
          ownerResolvedAt: expect.any(Date)
        })
      })
    );
    expect(prisma.academicRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "request-4" },
        data: expect.objectContaining({
          currentStepOrder: 2,
          ownerUserId: "admin-1",
          requiredApproverRole: "ADMIN"
        })
      })
    );
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: "academic_request_step_decision" }));
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: "academic_request_owner_transition" }));
    expect(decided.status).toBe("SUBMITTED");
    expect(decided.currentStepOrder).toBe(2);
  });

  it("allows the registrar to finalize an approved prerequisite override", async () => {
    const { prisma, auditService, service } = createGovernanceService();
    prisma.user.findFirst.mockResolvedValue({ id: "admin-1" });
    prisma.academicRequest.findFirst.mockResolvedValue(
      makeRequest({
        id: "request-5",
        type: "PREREQ_OVERRIDE",
        sectionId: "section-1",
        ownerUserId: "admin-1",
        requiredApproverRole: "ADMIN",
        currentStepOrder: 2,
        student: {
          id: "student-1",
          email: "student1@sis.edu",
          studentId: "S2601",
          studentProfile: { legalName: "Student One", programMajor: "CS", academicStatus: "Good Standing" },
          adviseeAssignments: []
        },
        section: {
          id: "section-1",
          instructorUserId: "faculty-1",
          sectionCode: "CS201-F1",
          course: { code: "CS201", title: "Data Structures" }
        },
        steps: [
          makeStep({
            id: "step-faculty",
            stepKey: "faculty_review",
            label: "Faculty Review",
            requiredApproverRole: "FACULTY",
            ownerUserId: "faculty-1",
            status: "APPROVED",
            decisionNote: "Faculty supports the override"
          }),
          makeStep({
            id: "step-admin",
            stepOrder: 2,
            stepKey: "registrar_finalization",
            label: "Registrar Finalization",
            requiredApproverRole: "ADMIN",
            ownerUserId: "admin-1",
            status: "PENDING"
          })
        ]
      })
    );
    prisma.academicRequest.findUniqueOrThrow.mockResolvedValue(
      makeRequest({
        id: "request-5",
        type: "PREREQ_OVERRIDE",
        sectionId: "section-1",
        ownerUserId: null,
        requiredApproverRole: null,
        status: "APPROVED",
        currentStepOrder: null,
        activeRequestKey: null,
        decisionNote: "Registrar final approval granted",
        student: {
          id: "student-1",
          email: "student1@sis.edu",
          studentId: "S2601",
          studentProfile: { legalName: "Student One", programMajor: "CS", academicStatus: "Good Standing" }
        },
        section: {
          id: "section-1",
          instructorUserId: "faculty-1",
          sectionCode: "CS201-F1",
          course: { code: "CS201", title: "Data Structures" }
        },
        steps: [
          makeStep({
            id: "step-faculty",
            stepKey: "faculty_review",
            label: "Faculty Review",
            requiredApproverRole: "FACULTY",
            ownerUserId: "faculty-1",
            status: "APPROVED",
            decisionNote: "Faculty supports the override"
          }),
          makeStep({
            id: "step-admin",
            stepOrder: 2,
            stepKey: "registrar_finalization",
            label: "Registrar Finalization",
            requiredApproverRole: "ADMIN",
            ownerUserId: "admin-1",
            status: "APPROVED",
            decisionNote: "Registrar final approval granted"
          })
        ]
      })
    );

    const decided = await service.decideAdminRequest("admin-1", "request-5", {
      decision: "APPROVED",
      decisionNote: "Registrar final approval granted"
    });

    expect(prisma.academicRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "request-5" },
        data: expect.objectContaining({
          status: "APPROVED",
          ownerUserId: null,
          requiredApproverRole: null,
          currentStepOrder: null,
          activeRequestKey: null
        })
      })
    );
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: "academic_request_step_decision" }));
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: "academic_request_decision" }));
    expect(decided.status).toBe("APPROVED");
  });

  it("prevents admins from deciding a request before the workflow reaches registrar ownership", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.user.findFirst.mockResolvedValue({ id: "admin-1" });
    prisma.academicRequest.findFirst.mockResolvedValue(
      makeRequest({
        id: "request-6",
        type: "PREREQ_OVERRIDE",
        ownerUserId: "faculty-1",
        requiredApproverRole: "FACULTY",
        currentStepOrder: 1,
        student: {
          id: "student-1",
          email: "student1@sis.edu",
          studentId: "S2601",
          studentProfile: { legalName: "Student One", programMajor: "CS", academicStatus: "Good Standing" },
          adviseeAssignments: []
        },
        section: {
          id: "section-1",
          instructorUserId: "faculty-1",
          sectionCode: "CS201-F1",
          course: { code: "CS201", title: "Data Structures" }
        },
        steps: [
          makeStep({
            id: "step-faculty",
            stepKey: "faculty_review",
            label: "Faculty Review",
            requiredApproverRole: "FACULTY",
            ownerUserId: "faculty-1",
            status: "PENDING"
          }),
          makeStep({
            id: "step-admin",
            stepOrder: 2,
            stepKey: "registrar_finalization",
            label: "Registrar Finalization",
            requiredApproverRole: "ADMIN",
            ownerUserId: "admin-1",
            status: "WAITING"
          })
        ]
      })
    );

    await expect(
      service.decideAdminRequest("admin-1", "request-6", {
        decision: "APPROVED",
        decisionNote: "Registrar approval"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows admins to reassign the active workflow step to another valid reviewer", async () => {
    const { prisma, auditService, service } = createGovernanceService();
    prisma.user.findFirst
      .mockResolvedValueOnce({ id: "admin-1" })
      .mockResolvedValueOnce({ id: "faculty-2" });
    prisma.academicRequest.findUnique.mockResolvedValue(
      makeRequest({
        id: "request-8",
        type: "PREREQ_OVERRIDE",
        sectionId: "section-1",
        ownerUserId: "faculty-1",
        requiredApproverRole: "FACULTY",
        currentStepOrder: 1,
        steps: [
          makeStep({
            id: "step-faculty",
            stepKey: "faculty_review",
            label: "Faculty Review",
            requiredApproverRole: "FACULTY",
            initialOwnerUserId: "faculty-1",
            ownerUserId: "faculty-1",
            status: "PENDING"
          }),
          makeStep({
            id: "step-admin",
            stepOrder: 2,
            stepKey: "registrar_finalization",
            label: "Registrar Finalization",
            requiredApproverRole: "ADMIN",
            initialOwnerUserId: "admin-1",
            ownerUserId: "admin-1",
            status: "WAITING"
          })
        ]
      })
    );
    prisma.academicRequest.findUniqueOrThrow.mockResolvedValue(
      makeRequest({
        id: "request-8",
        type: "PREREQ_OVERRIDE",
        sectionId: "section-1",
        ownerUserId: "faculty-2",
        requiredApproverRole: "FACULTY",
        currentStepOrder: 1,
        steps: [
          makeStep({
            id: "step-faculty",
            stepKey: "faculty_review",
            label: "Faculty Review",
            requiredApproverRole: "FACULTY",
            initialOwnerUserId: "faculty-1",
            ownerUserId: "faculty-2",
            status: "PENDING"
          }),
          makeStep({
            id: "step-admin",
            stepOrder: 2,
            stepKey: "registrar_finalization",
            label: "Registrar Finalization",
            requiredApproverRole: "ADMIN",
            initialOwnerUserId: "admin-1",
            ownerUserId: "admin-1",
            status: "WAITING"
          })
        ]
      })
    );

    const request = await service.reassignCurrentRequestStep("admin-1", "request-8", {
      ownerUserId: "faculty-2",
      note: "Faculty workload balancing"
    });

    expect(prisma.academicRequestStep.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "step-faculty" },
        data: { ownerUserId: "faculty-2" }
      })
    );
    expect(prisma.academicRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "request-8" },
        data: { ownerUserId: "faculty-2" }
      })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "academic_request_step_reassigned" })
    );
    expect(request.ownerUserId).toBe("faculty-2");
  });

  it("removes decision authority from the previous owner after reassignment", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.academicRequest.findFirst.mockResolvedValue(
      makeRequest({
        id: "request-9",
        type: "PREREQ_OVERRIDE",
        sectionId: "section-1",
        ownerUserId: "faculty-2",
        requiredApproverRole: "FACULTY",
        currentStepOrder: 1,
        student: {
          id: "student-1",
          email: "student1@sis.edu",
          studentId: "S2601",
          studentProfile: { legalName: "Student One", programMajor: "CS", academicStatus: "Good Standing" },
          adviseeAssignments: []
        },
        section: {
          id: "section-1",
          instructorUserId: "faculty-1",
          sectionCode: "CS201-F1",
          course: { code: "CS201", title: "Data Structures" }
        },
        steps: [
          makeStep({
            id: "step-faculty",
            stepKey: "faculty_review",
            label: "Faculty Review",
            requiredApproverRole: "FACULTY",
            initialOwnerUserId: "faculty-1",
            ownerUserId: "faculty-2",
            status: "PENDING"
          }),
          makeStep({
            id: "step-admin",
            stepOrder: 2,
            stepKey: "registrar_finalization",
            label: "Registrar Finalization",
            requiredApproverRole: "ADMIN",
            initialOwnerUserId: "admin-1",
            ownerUserId: "admin-1",
            status: "WAITING"
          })
        ]
      })
    );

    await expect(
      service.decideFacultyRequest("faculty-1", "request-9", {
        decision: "APPROVED",
        decisionNote: "Old owner should not retain access"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows the reassigned faculty owner to decide the active step", async () => {
    const { prisma, auditService, service } = createGovernanceService();
    prisma.user.findFirst.mockResolvedValue({ id: "admin-1" });
    prisma.academicRequest.findFirst.mockResolvedValue(
      makeRequest({
        id: "request-9b",
        type: "PREREQ_OVERRIDE",
        sectionId: "section-1",
        ownerUserId: "faculty-2",
        requiredApproverRole: "FACULTY",
        currentStepOrder: 1,
        student: {
          id: "student-1",
          email: "student1@sis.edu",
          studentId: "S2601",
          studentProfile: { legalName: "Student One", programMajor: "CS", academicStatus: "Good Standing" },
          adviseeAssignments: []
        },
        section: {
          id: "section-1",
          instructorUserId: "faculty-1",
          sectionCode: "CS201-F1",
          course: { code: "CS201", title: "Data Structures" }
        },
        steps: [
          makeStep({
            id: "step-faculty",
            stepKey: "faculty_review",
            label: "Faculty Review",
            requiredApproverRole: "FACULTY",
            ownerStrategy: "SECTION_INSTRUCTOR",
            ownerResolutionRefId: "section-1",
            initialOwnerUserId: "faculty-1",
            ownerUserId: "faculty-2",
            status: "PENDING"
          }),
          makeStep({
            id: "step-admin",
            stepOrder: 2,
            stepKey: "registrar_finalization",
            label: "Registrar Finalization",
            requiredApproverRole: "ADMIN",
            ownerStrategy: "ADMIN_REVIEWER",
            ownerResolutionRefId: null,
            initialOwnerUserId: null,
            ownerUserId: null,
            ownerResolvedAt: null,
            status: "WAITING"
          })
        ]
      })
    );
    prisma.academicRequest.findUniqueOrThrow.mockResolvedValue(
      makeRequest({
        id: "request-9b",
        type: "PREREQ_OVERRIDE",
        sectionId: "section-1",
        ownerUserId: "admin-1",
        requiredApproverRole: "ADMIN",
        currentStepOrder: 2,
        student: {
          id: "student-1",
          email: "student1@sis.edu",
          studentId: "S2601",
          studentProfile: { legalName: "Student One", programMajor: "CS", academicStatus: "Good Standing" }
        },
        section: {
          id: "section-1",
          instructorUserId: "faculty-1",
          sectionCode: "CS201-F1",
          course: { code: "CS201", title: "Data Structures" }
        },
        steps: [
          makeStep({
            id: "step-faculty",
            stepKey: "faculty_review",
            label: "Faculty Review",
            requiredApproverRole: "FACULTY",
            ownerStrategy: "SECTION_INSTRUCTOR",
            ownerResolutionRefId: "section-1",
            initialOwnerUserId: "faculty-1",
            ownerUserId: "faculty-2",
            status: "APPROVED",
            decisionNote: "Reassigned faculty approved"
          }),
          makeStep({
            id: "step-admin",
            stepOrder: 2,
            stepKey: "registrar_finalization",
            label: "Registrar Finalization",
            requiredApproverRole: "ADMIN",
            ownerStrategy: "ADMIN_REVIEWER",
            ownerResolutionRefId: null,
            initialOwnerUserId: "admin-1",
            ownerUserId: "admin-1",
            status: "PENDING"
          })
        ]
      })
    );

    const decided = await service.decideFacultyRequest("faculty-2", "request-9b", {
      decision: "APPROVED",
      decisionNote: "Reassigned faculty approved"
    });

    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: "academic_request_owner_transition" }));
    expect(decided.currentStepOrder).toBe(2);
    expect(decided.ownerUserId).toBe("admin-1");
  });

  it("rejects duplicate pending overload requests for the same student and term", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.systemSetting.findUnique.mockResolvedValue({ value: "18" });
    prisma.term.findUnique.mockResolvedValue({ id: "term-1", name: "Fall 2026", maxCredits: 18 });
    prisma.advisorAssignment.findFirst.mockResolvedValue({
      advisorId: "advisor-1",
      advisor: { id: "advisor-1", role: "ADVISOR", email: "advisor1@sis.edu", advisorProfile: { displayName: "Advisor One" } }
    });
    prisma.academicRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "request-pending", status: "SUBMITTED" });

    await expect(
      service.submitCreditOverloadRequest("student-1", {
        termId: "term-1",
        requestedCredits: 21,
        reason: "Need one additional overload course"
      })
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "REQUEST_ALREADY_PENDING" }) });
  });

  it("maps academic request unique key violations to a clean duplicate-request error", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.systemSetting.findUnique.mockResolvedValue({ value: "18" });
    prisma.term.findUnique.mockResolvedValue({ id: "term-1", name: "Fall 2026", maxCredits: 18 });
    prisma.user.findFirst.mockResolvedValue({ id: "advisor-1" });
    prisma.advisorAssignment.findFirst.mockResolvedValue({
      advisorId: "advisor-1",
      advisor: { id: "advisor-1", role: "ADVISOR", email: "advisor1@sis.edu", advisorProfile: { displayName: "Advisor One" } }
    });
    prisma.academicRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.academicRequest.create.mockRejectedValue({ code: "P2002" });

    await expect(
      service.submitCreditOverloadRequest("student-1", {
        termId: "term-1",
        requestedCredits: 21,
        reason: "Need one additional overload course"
      })
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "REQUEST_ALREADY_PENDING" }) });
  });

  it("rejects invalid lifecycle transitions once a request is already terminal", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.academicRequest.findFirst.mockResolvedValue(
      makeRequest({
        id: "request-7",
        status: "APPROVED",
        ownerUserId: "advisor-1",
        requiredApproverRole: "ADVISOR",
        currentStepOrder: null,
        steps: [makeStep({ status: "APPROVED" })]
      })
    );

    await expect(
      service.decideAdvisorRequest("advisor-1", "request-7", {
        decision: "REJECTED",
        decisionNote: "Reversing a terminal state is not allowed"
      })
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "REQUEST_ALREADY_DECIDED" })
    });
  });

  it("applies approved overload effect through the request policy", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.academicRequest.findFirst
      .mockResolvedValueOnce({ requestedCredits: 21 })
      .mockResolvedValueOnce({ requestedCredits: 15 })
      .mockResolvedValueOnce(null);

    await expect(service.getApprovedCreditLimit(prisma, "student-1", "term-1", 18)).resolves.toBe(21);
    await expect(service.getApprovedCreditLimit(prisma, "student-1", "term-1", 18)).resolves.toBe(18);
    await expect(service.getApprovedCreditLimit(prisma, "student-1", "term-1", 18)).resolves.toBe(18);
  });

  it("uses the prerequisite override policy to check section-level approval effect", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.academicRequest.findFirst.mockResolvedValueOnce({ id: "request-5" }).mockResolvedValueOnce(null);

    await expect(service.hasApprovedPrerequisiteOverride(prisma, "student-1", "section-1")).resolves.toBe(true);
    await expect(service.hasApprovedPrerequisiteOverride(prisma, "student-1", "section-1")).resolves.toBe(false);
  });

  it("creates and resolves holds only for admins", async () => {
    const { prisma, auditService, service } = createGovernanceService();
    prisma.user.findFirst.mockResolvedValueOnce({ id: "admin-1" }).mockResolvedValueOnce({ id: "student-1" }).mockResolvedValueOnce({ id: "admin-1" });
    prisma.studentHold.create.mockResolvedValue({
      id: "hold-1",
      studentId: "student-1",
      type: "REGISTRATION",
      reason: "Registrar review",
      expiresAt: null,
      student: { id: "student-1", email: "student1@sis.edu" }
    });
    prisma.studentHold.findUnique.mockResolvedValue({
      id: "hold-1",
      studentId: "student-1",
      type: "REGISTRATION",
      active: true,
      note: null
    });
    prisma.studentHold.update.mockResolvedValue({
      id: "hold-1",
      studentId: "student-1",
      type: "REGISTRATION",
      active: false
    });

    await service.createHold("admin-1", {
      studentId: "student-1",
      type: "REGISTRATION",
      reason: "Registrar review",
      note: "Need updated paperwork",
      expiresAt: null
    });
    await service.resolveHold("admin-1", "hold-1", { resolutionNote: "Paperwork received" });

    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: "student_hold_create" }));
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: "student_hold_resolve" }));
  });

  it("listMyHolds delegates to getActiveBlockingHolds", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.studentHold.findMany.mockResolvedValue([
      { id: "hold-1", type: "FINANCIAL", active: true }
    ]);

    const result = await service.listMyHolds("student-1");
    expect(result).toHaveLength(1);
    expect(prisma.studentHold.findMany).toHaveBeenCalled();
  });

  it("listMyAcademicRequests returns requests filtered by studentId", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.academicRequest.findMany.mockResolvedValue([
      { id: "req-1", type: "CREDIT_OVERLOAD", status: "SUBMITTED" }
    ]);

    const result = await service.listMyAcademicRequests("student-1");
    expect(result).toHaveLength(1);
    expect(prisma.academicRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studentId: "student-1" })
      })
    );
  });

  it("listMyAcademicRequests filters by termId when provided", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.academicRequest.findMany.mockResolvedValue([]);

    await service.listMyAcademicRequests("student-1", "term-1");
    expect(prisma.academicRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studentId: "student-1", termId: "term-1" })
      })
    );
  });

  it("listAdminRequests delegates findMany to prisma after asserting admin", async () => {
    const { prisma, service } = createGovernanceService();
    // Admin exists
    prisma.user.findFirst.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    prisma.academicRequest.findMany.mockResolvedValue([{ id: "req-1" }]);

    const result = await service.listAdminRequests("admin-1");
    expect(result).toHaveLength(1);
  });

  it("listHolds returns all holds for admin (no filter)", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.user.findFirst.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    prisma.studentHold.findMany.mockResolvedValue([
      { id: "h1", active: true },
      { id: "h2", active: false }
    ]);

    const result = await service.listHolds("admin-1");
    expect(result).toHaveLength(2);
  });

  it("listHolds filters by studentId when provided", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.user.findFirst.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    prisma.studentHold.findMany.mockResolvedValue([{ id: "h1", active: true }]);

    await service.listHolds("admin-1", "student-99");
    expect(prisma.studentHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ studentId: "student-99" })
      })
    );
  });

  it("resolveHold throws HOLD_NOT_FOUND when hold does not exist", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.user.findFirst.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    prisma.studentHold.findUnique.mockResolvedValue(null);

    const { NotFoundException } = await import("@nestjs/common");
    await expect(
      service.resolveHold("admin-1", "missing-hold", { resolutionNote: "N/A" })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("resolveHold throws HOLD_ALREADY_RESOLVED when hold is inactive", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.user.findFirst.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    prisma.studentHold.findUnique.mockResolvedValue({ id: "h1", active: false });

    await expect(
      service.resolveHold("admin-1", "h1", { resolutionNote: "N/A" })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
