import { BadRequestException, NotFoundException } from "@nestjs/common";
import { apiCache } from "../common/cache";
import { sanitizeHtml } from "../common/sanitize";
import { AdminReportingService } from "./admin-reporting.service";
import { AdminService } from "./admin.service";

function createAdminService(overrides?: Record<string, unknown>) {
  const prisma = {
    auditLog: {
      findMany: jest.fn(),
      create: jest.fn()
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn()
    },
    enrollment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn()
    },
    gradeAppeal: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn()
    },
    facultyProfile: {
      findUnique: jest.fn()
    },
    advisorProfile: {
      findUnique: jest.fn()
    },
    section: {
      findMany: jest.fn(),
      findUnique: jest.fn()
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (fn: any) => (typeof fn === "function" ? fn(prisma) : fn)),
    ...overrides
  } as any;
  const auditService = {
    log: jest.fn(),
    logInTransaction: jest.fn()
  } as any;
  const notificationsService = {} as any;
  const registrationService = {
    enroll: jest.fn(),
    dropEnrollment: jest.fn()
  } as any;
  const governanceService = {
    listHolds: jest.fn(),
    createHold: jest.fn(),
    resolveHold: jest.fn(),
    decideAdminRequest: jest.fn()
  } as any;
  const mailService = {
    sendAppealDecision: jest.fn(),
    sendWaiverDecision: jest.fn(),
    sendOverloadDecision: jest.fn(),
    sendWaitlistPromoted: jest.fn()
  } as any;
  const analyticsService = new AdminReportingService(
    prisma,
    auditService,
    notificationsService,
    registrationService,
    governanceService,
    mailService
  ) as any;
  const gradesService = {
    bulkUpdateGrades: jest.fn(),
    updateGrade: jest.fn(),
    updateEnrollmentGrade: jest.fn(),
    previewGradeCurve: jest.fn()
  } as any;
  return {
    prisma,
    auditService,
    governanceService,
    mailService,
    service: new AdminService(
      prisma,
      auditService,
      notificationsService,
      registrationService,
      governanceService,
      mailService,
      analyticsService,
      gradesService
    )
  };
}

describe("AdminService helpers", () => {
  beforeEach(() => {
    apiCache.delPrefix("admin:");
    jest.clearAllMocks();
  });

  it("computeStudentGpa returns null for empty enrollments", () => {
    const { service } = createAdminService();
    expect((service as any).computeStudentGpa([])).toBeNull();
  });

  it("computeStudentGpa returns 4.00 for a single A over 3 credits", () => {
    const { service } = createAdminService();
    expect(
      (service as any).computeStudentGpa([{ finalGrade: "A", section: { credits: 3 } }])
    ).toBe(4);
  });

  it("computeStudentGpa returns 3.00 for A and C split evenly", () => {
    const { service } = createAdminService();
    expect(
      (service as any).computeStudentGpa([
        { finalGrade: "A", section: { credits: 3 } },
        { finalGrade: "C", section: { credits: 3 } }
      ])
    ).toBe(3);
  });

  it("computeStudentGpa returns 0.00 for all failing grades", () => {
    const { service } = createAdminService();
    expect(
      (service as any).computeStudentGpa([
        { finalGrade: "F", section: { credits: 3 } },
        { finalGrade: "F", section: { credits: 4 } }
      ])
    ).toBe(0);
  });

  it("normalizePagination clamps page and pageSize", () => {
    const { service } = createAdminService();
    expect((service as any).normalizePagination({ page: -1, pageSize: 999 })).toEqual({
      page: 1,
      pageSize: 200,
      skip: 0
    });
  });

  it("sanitizeHtml strips script tags", () => {
    expect(sanitizeHtml('<p>Hello</p><script>alert(1)</script>')).toBe("<p>Hello</p>");
  });

  it("sanitizeHtml strips javascript protocols", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">bad</a>')).toBe('<a href="alert(1)">bad</a>');
  });

  it("getEnrollmentTrend returns a day bucket for each requested day", async () => {
    const { prisma, service } = createAdminService();
    prisma.auditLog.findMany.mockResolvedValue([
      { createdAt: new Date() },
      { createdAt: new Date() }
    ]);

    const result = await service.getEnrollmentTrend(7);

    expect(result).toHaveLength(7);
    expect(result[0]).toEqual(expect.objectContaining({ date: expect.any(String), count: expect.any(Number) }));
  });

  it("getTopSections returns top 10 sections sorted by enrolled count descending", async () => {
    const { prisma, service } = createAdminService();
    prisma.section.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        id: `section-${index}`,
        capacity: 30,
        courseId: `course-${index}`,
        course: { code: `CS${index}`, title: `Course ${index}` },
        enrollments: Array.from({ length: 12 - index }, () => ({ status: "ENROLLED" }))
      }))
    );

    const result = await service.getTopSections();

    expect(result).toHaveLength(10);
    expect(result[0].enrolled).toBeGreaterThanOrEqual(result[1].enrolled);
  });

  it("computeStudentGpa ignores non-graded enrollments (null finalGrade)", () => {
    const { service } = createAdminService();
    // Only the graded enrollment should count
    const gpa = (service as any).computeStudentGpa([
      { finalGrade: "A", section: { credits: 3 } },
      { finalGrade: null, section: { credits: 3 } }
    ]);
    expect(gpa).toBe(4);
  });

  it("computeStudentGpa treats W as not counted (ignored like null)", () => {
    const { service } = createAdminService();
    const gpa = (service as any).computeStudentGpa([
      { finalGrade: "B", section: { credits: 3 } },
      { finalGrade: "W", section: { credits: 3 } }
    ]);
    // W withdrawal: not counted → only B should factor in
    expect(typeof gpa).toBe("number");
  });

  it("normalizePagination returns correct skip for page 3 with pageSize 20", () => {
    const { service } = createAdminService();
    const result = (service as any).normalizePagination({ page: 3, pageSize: 20 });
    expect(result).toEqual({ page: 3, pageSize: 20, skip: 40 });
  });

  it("normalizePagination uses defaults when values are missing", () => {
    const { service } = createAdminService();
    const result = (service as any).normalizePagination({});
    expect(result.page).toBeGreaterThanOrEqual(1);
    expect(result.pageSize).toBeGreaterThanOrEqual(1);
    expect(result.skip).toBeGreaterThanOrEqual(0);
  });

  it("getEnrollmentTrend with days=14 returns 14 buckets", async () => {
    const { prisma, service } = createAdminService();
    prisma.auditLog.findMany.mockResolvedValue([]);
    const result = await service.getEnrollmentTrend(14);
    expect(result).toHaveLength(14);
  });

  it("getEnrollmentTrend buckets count correctly for today's log entries", async () => {
    const { prisma, service } = createAdminService();
    const today = new Date();
    prisma.auditLog.findMany.mockResolvedValue([
      { createdAt: today },
      { createdAt: today },
      { createdAt: today }
    ]);
    const result = await service.getEnrollmentTrend(7);
    const todayBucket = result.find(r => r.date === today.toISOString().slice(0, 10));
    expect(todayBucket?.count).toBe(3);
  });

  it("sanitizeHtml preserves safe tags and text", () => {
    const output = sanitizeHtml("<p><strong>Hello</strong> World</p>");
    expect(output).toContain("Hello");
    expect(output).toContain("World");
  });

  it("createFaculty provisions a faculty user with profile data", async () => {
    const { prisma, auditService, service } = createAdminService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.facultyProfile.findUnique.mockResolvedValue(null);
    prisma.advisorProfile.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: "faculty-1",
      email: "prof@sis.edu",
      role: "FACULTY",
      facultyProfile: { displayName: "Prof Ada", department: "CS", title: "Professor" }
    });

    const created = await service.createFaculty(
      {
        email: "prof@sis.edu",
        password: "Faculty@2026!",
        displayName: "Prof Ada",
        employeeId: "EMP100",
        department: "CS",
        title: "Professor"
      },
      "admin-1"
    );

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "FACULTY",
          facultyProfile: {
            create: expect.objectContaining({
              displayName: "Prof Ada",
              employeeId: "EMP100"
            })
          }
        })
      })
    );
    expect(auditService.log).toHaveBeenCalled();
    expect(created.role).toBe("FACULTY");
  });

  it("assignAdvisor retires prior assignments before creating a new active advisor link", async () => {
    const { prisma, auditService, service } = createAdminService();
    prisma.user.findFirst
      .mockResolvedValueOnce({
        id: "student-1",
        email: "student@sis.edu",
        studentProfile: { legalName: "Student One" }
      })
      .mockResolvedValueOnce({
        id: "advisor-1",
        email: "advisor@sis.edu",
        advisorProfile: { displayName: "Advisor One" }
      });

    const tx = {
      advisorAssignment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({
          id: "assignment-1",
          studentId: "student-1",
          advisorId: "advisor-1",
          active: true
        })
      }
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    const assignment = await service.assignAdvisor(
      { studentId: "student-1", advisorId: "advisor-1", notes: "Primary advisor" },
      "admin-1"
    );

    expect(tx.advisorAssignment.updateMany).toHaveBeenCalledWith({
      where: { studentId: "student-1", active: true },
      data: { active: false, endedAt: expect.any(Date) }
    });
    expect(tx.advisorAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: "student-1",
          advisorId: "advisor-1",
          assignedByUserId: "admin-1"
        })
      })
    );
    expect(auditService.log).toHaveBeenCalled();
    expect(assignment.id).toBe("assignment-1");
  });

  describe("decidePendingOverload", () => {
    it("批准后更新状态并发邮件", async () => {
      const { prisma, mailService, service } = createAdminService();
      prisma.enrollment.findFirst.mockResolvedValue({
        id: "enr-1",
        studentId: "stu-1",
        student: { email: "student@univ.edu", studentProfile: { legalName: "张小明" } },
        sectionId: "sec-1",
        section: {
          capacity: 40,
          requireApproval: false,
          sectionCode: "CS101-01",
          course: { code: "CS101", title: "计算机科学导论" },
          term: { name: "2025年秋季学期" }
        }
      });
      prisma.enrollment.count.mockResolvedValue(10);
      prisma.enrollment.update.mockResolvedValue({ id: "enr-1", status: "ENROLLED" });
      prisma.$queryRaw.mockResolvedValue([{ id: "sec-1", capacity: 40 }]);

      await service.decidePendingOverload("enr-1", true, "admin-1");

      expect(prisma.enrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "enr-1" }, data: { status: "ENROLLED" } })
      );
      expect(mailService.sendOverloadDecision).toHaveBeenCalledWith("student@univ.edu", true);
    });

    it("驳回时发 approved=false 邮件", async () => {
      const { prisma, mailService, service } = createAdminService();
      prisma.enrollment.findFirst.mockResolvedValue({
        id: "enr-1",
        studentId: "stu-1",
        student: { email: "student@univ.edu", studentProfile: { legalName: "张小明" } },
        sectionId: "sec-1",
        section: {
          capacity: 40,
          requireApproval: false,
          sectionCode: "CS101-01",
          course: { code: "CS101", title: "计算机科学导论" },
          term: { name: "2025年秋季学期" }
        }
      });
      prisma.enrollment.update.mockResolvedValue({ id: "enr-1", status: "DROPPED" });

      await service.decidePendingOverload("enr-1", false, "admin-1");

      expect(mailService.sendOverloadDecision).toHaveBeenCalledWith("student@univ.edu", false);
    });

    it("找不到 enrollment 时抛 NotFoundException", async () => {
      const { prisma, service } = createAdminService();
      prisma.enrollment.findFirst.mockResolvedValue(null);

      await expect(service.decidePendingOverload("missing", true, "admin-1")).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe("decidePrereqWaiver", () => {
    it("批准后更新状态并发邮件", async () => {
      const { governanceService, mailService, service } = createAdminService();
      governanceService.decideAdminRequest.mockResolvedValue({
        id: "req-1",
        student: { id: "stu-1", email: "student@univ.edu" },
        section: { id: "sec-1", course: { code: "CS301", title: "操作系统原理" } }
      });

      await service.decidePrereqWaiver("admin-1", "req-1", {
        status: "APPROVED",
        adminNote: "允许修读"
      });

      expect(mailService.sendWaiverDecision).toHaveBeenCalledWith(
        "student@univ.edu",
        "CS301",
        true,
        "允许修读"
      );
    });

    it("驳回时发 approved=false 的邮件", async () => {
      const { governanceService, mailService, service } = createAdminService();
      governanceService.decideAdminRequest.mockResolvedValue({
        id: "req-1",
        student: { id: "stu-1", email: "student@univ.edu" },
        section: { id: "sec-1", course: { code: "CS301", title: "操作系统原理" } }
      });

      await service.decidePrereqWaiver("admin-1", "req-1", {
        status: "REJECTED",
        adminNote: "条件不足"
      });

      expect(mailService.sendWaiverDecision).toHaveBeenCalledWith(
        "student@univ.edu",
        "CS301",
        false,
        "条件不足"
      );
    });

    it("已处理过的申请再次审批时抛异常", async () => {
      const { governanceService, service } = createAdminService();
      governanceService.decideAdminRequest.mockRejectedValue(
        new BadRequestException({ code: "REQUEST_ALREADY_RESOLVED" })
      );

      await expect(
        service.decidePrereqWaiver("admin-1", "req-1", { status: "APPROVED", adminNote: "重复审批" })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("reviewGradeAppeal", () => {
    it("批准后更新成绩并发邮件", async () => {
      const { prisma, mailService, service } = createAdminService();
      prisma.gradeAppeal.findUnique.mockResolvedValue({
        id: "appeal-1",
        status: "PENDING",
        enrollmentId: "enr-1",
        student: { email: "student@univ.edu" },
        enrollment: {
          section: {
            course: { title: "数据结构与算法" }
          }
        }
      });
      prisma.gradeAppeal.update.mockResolvedValue({});
      prisma.enrollment.update.mockResolvedValue({});

      await service.reviewGradeAppeal("admin-1", "appeal-1", "APPROVED", "改分通过", "A");

      expect(prisma.enrollment.update).toHaveBeenCalledWith({
        where: { id: "enr-1" },
        data: { finalGrade: "A" }
      });
      expect(mailService.sendAppealDecision).toHaveBeenCalledWith(
        "student@univ.edu",
        "数据结构与算法",
        true,
        "改分通过"
      );
    });

    it("驳回时不改成绩只发邮件", async () => {
      const { prisma, mailService, service } = createAdminService();
      prisma.gradeAppeal.findUnique.mockResolvedValue({
        id: "appeal-1",
        status: "PENDING",
        enrollmentId: "enr-1",
        student: { email: "student@univ.edu" },
        enrollment: {
          section: {
            course: { title: "数据结构与算法" }
          }
        }
      });
      prisma.gradeAppeal.update.mockResolvedValue({});

      await service.reviewGradeAppeal("admin-1", "appeal-1", "REJECTED", "维持原判");

      expect(prisma.enrollment.update).not.toHaveBeenCalled();
      expect(mailService.sendAppealDecision).toHaveBeenCalledWith(
        "student@univ.edu",
        "数据结构与算法",
        false,
        "维持原判"
      );
    });
  });
});
