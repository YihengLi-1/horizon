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
    user: {
      findFirst: jest.fn()
    },
    advisorAssignment: {
      findFirst: jest.fn()
    },
    academicRequest: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    studentHold: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn()
    },
    $transaction: jest.fn()
  } as any;

  const auditService = {
    log: jest.fn().mockResolvedValue(undefined)
  } as any;

  return {
    prisma,
    auditService,
    service: new GovernanceService(prisma, auditService)
  };
}

describe("GovernanceService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("submits a credit overload request with the assigned advisor as owner", async () => {
    const { prisma, auditService, service } = createGovernanceService();
    prisma.systemSetting.findUnique.mockResolvedValue({ value: "18" });
    prisma.term.findUnique.mockResolvedValue({ id: "term-1", name: "Fall 2026", maxCredits: 18 });
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => callback(prisma));
    prisma.advisorAssignment.findFirst.mockResolvedValue({
      advisorId: "advisor-1",
      advisor: { id: "advisor-1", role: "ADVISOR", email: "advisor1@sis.edu", advisorProfile: { displayName: "Advisor One" } }
    });
    prisma.academicRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.academicRequest.create.mockResolvedValue({
      id: "request-1",
      type: "CREDIT_OVERLOAD",
      termId: "term-1",
      requestedCredits: 21,
      ownerUserId: "advisor-1",
      owner: { id: "advisor-1", email: "advisor1@sis.edu", advisorProfile: { displayName: "Advisor One" } },
      term: { id: "term-1", name: "Fall 2026", maxCredits: 18 }
    });

    const request = await service.submitCreditOverloadRequest("student-1", {
      termId: "term-1",
      requestedCredits: 21,
      reason: "Need 21 credits to stay on track for graduation"
    });

    expect(prisma.academicRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: "student-1",
          activeRequestKey: "student-1:term-1:CREDIT_OVERLOAD",
          ownerUserId: "advisor-1",
          requiredApproverRole: "ADVISOR"
        })
      })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "student-1",
        action: "academic_request_submit",
        entityId: "request-1"
      })
    );
    expect(request.id).toBe("request-1");
  });

  it("rejects overload submission when no active advisor is assigned", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.systemSetting.findUnique.mockResolvedValue({ value: "18" });
    prisma.term.findUnique.mockResolvedValue({ id: "term-1", name: "Fall 2026", maxCredits: 18 });
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => callback(prisma));
    prisma.advisorAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.submitCreditOverloadRequest("student-1", {
        termId: "term-1",
        requestedCredits: 21,
        reason: "Need this overload"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("prevents advisors from deciding requests they do not own", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.academicRequest.findFirst.mockResolvedValue({
      id: "request-1",
      requiredApproverRole: "ADVISOR",
      ownerUserId: "advisor-2",
      status: "SUBMITTED",
      student: { adviseeAssignments: [{ id: "assignment-1" }] }
    });

    await expect(
      service.decideAdvisorRequest("advisor-1", "request-1", { decision: "APPROVED", decisionNote: "Looks good" })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows the assigned advisor to approve a submitted overload request", async () => {
    const { prisma, auditService, service } = createGovernanceService();
    prisma.academicRequest.findFirst.mockResolvedValue({
      id: "request-1",
      studentId: "student-1",
      termId: "term-1",
      type: "CREDIT_OVERLOAD",
      requiredApproverRole: "ADVISOR",
      ownerUserId: "advisor-1",
      status: "SUBMITTED",
      student: { adviseeAssignments: [{ id: "assignment-1" }] },
      term: { id: "term-1", name: "Fall 2026" }
    });
    prisma.academicRequest.update.mockResolvedValue({
      id: "request-1",
      studentId: "student-1",
      termId: "term-1",
      type: "CREDIT_OVERLOAD",
      status: "APPROVED"
    });

    const decided = await service.decideAdvisorRequest("advisor-1", "request-1", {
      decision: "APPROVED",
      decisionNote: "Student remains in good academic standing"
    });

    expect(prisma.academicRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "request-1" },
        data: expect.objectContaining({
          status: "APPROVED",
          activeRequestKey: null,
          ownerUserId: null,
          requiredApproverRole: null,
          decidedByUserId: "advisor-1"
        })
      })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "advisor-1",
        action: "academic_request_decision",
        entityId: "request-1"
      })
    );
    expect(decided.status).toBe("APPROVED");
  });

  it("rejects invalid lifecycle transitions once a request is already terminal", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.academicRequest.findFirst.mockResolvedValue({
      id: "request-1",
      studentId: "student-1",
      termId: "term-1",
      type: "CREDIT_OVERLOAD",
      requiredApproverRole: "ADVISOR",
      ownerUserId: "advisor-1",
      status: "APPROVED",
      student: { adviseeAssignments: [{ id: "assignment-1" }] },
      term: { id: "term-1", name: "Fall 2026" }
    });

    await expect(
      service.decideAdvisorRequest("advisor-1", "request-1", {
        decision: "REJECTED",
        decisionNote: "Reversing a terminal state is not allowed"
      })
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "REQUEST_ALREADY_DECIDED" })
    });
  });

  it("rejects duplicate pending overload requests for the same student and term", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.systemSetting.findUnique.mockResolvedValue({ value: "18" });
    prisma.term.findUnique.mockResolvedValue({ id: "term-1", name: "Fall 2026", maxCredits: 18 });
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => callback(prisma));
    prisma.advisorAssignment.findFirst.mockResolvedValue({
      advisorId: "advisor-1",
      advisor: { id: "advisor-1", role: "ADVISOR", email: "advisor1@sis.edu", advisorProfile: { displayName: "Advisor One" } }
    });
    prisma.academicRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "request-pending",
        status: "SUBMITTED"
      });

    await expect(
      service.submitCreditOverloadRequest("student-1", {
        termId: "term-1",
        requestedCredits: 21,
        reason: "Need one additional overload course"
      })
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "REQUEST_ALREADY_PENDING" })
    });
  });

  it("maps academic request unique key violations to a clean duplicate-request error", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.systemSetting.findUnique.mockResolvedValue({ value: "18" });
    prisma.term.findUnique.mockResolvedValue({ id: "term-1", name: "Fall 2026", maxCredits: 18 });
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => {
      prisma.advisorAssignment.findFirst.mockResolvedValue({
        advisorId: "advisor-1",
        advisor: { id: "advisor-1", role: "ADVISOR", email: "advisor1@sis.edu", advisorProfile: { displayName: "Advisor One" } }
      });
      prisma.academicRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      prisma.academicRequest.create.mockRejectedValue({ code: "P2002" });
      return callback(prisma);
    });

    await expect(
      service.submitCreditOverloadRequest("student-1", {
        termId: "term-1",
        requestedCredits: 21,
        reason: "Need one additional overload course"
      })
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "REQUEST_ALREADY_PENDING" })
    });
  });

  it("throws when a blocking registration hold is active", async () => {
    const { prisma, service } = createGovernanceService();
    prisma.studentHold.findMany.mockResolvedValue([
      {
        id: "hold-1",
        type: "FINANCIAL",
        reason: "Outstanding balance",
        note: "Contact finance office",
        expiresAt: null
      }
    ]);

    await expect(service.assertNoBlockingHolds(prisma, "student-1")).rejects.toBeInstanceOf(BadRequestException);
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
});
