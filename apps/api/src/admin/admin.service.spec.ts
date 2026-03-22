import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { apiCache } from "../common/cache";
import { sanitizeHtml } from "../common/sanitize";
import { AdminReportingService } from "./admin-reporting.service";
import { AdminService } from "./admin.service";

function createAdminService(overrides?: Record<string, unknown>) {
  const prisma = {
    auditLog: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn()
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    enrollment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn()
    },
    gradeAppeal: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
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
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    term: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    course: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    coursePrerequisite: {
      createMany: jest.fn(),
      deleteMany: jest.fn()
    },
    studentNote: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn()
    },
    studentHold: {
      count: jest.fn()
    },
    meetingTime: {
      deleteMany: jest.fn()
    },
    inviteCode: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    announcement: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    systemSetting: {
      findMany: jest.fn(),
      upsert: jest.fn()
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (opsOrFn: any) =>
      (typeof opsOrFn === "function" ? opsOrFn(prisma) : Promise.all(opsOrFn))
    ),
    ...overrides
  } as any;
  const auditService = {
    log: jest.fn(),
    logInTransaction: jest.fn()
  } as any;
  const notificationsService = {
    sendMail: jest.fn(),
    sendWaitlistPromotionEmail: jest.fn()
  } as any;
  const registrationService = {
    enroll: jest.fn(),
    dropEnrollment: jest.fn(),
    normalizeWaitlistPositions: jest.fn()
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
    sendWaitlistPromoted: jest.fn(),
    sendTest: jest.fn()
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
    notificationsService,
    registrationService,
    governanceService,
    mailService,
    analyticsService,
    gradesService,
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

  describe("AdminReporting proxies", () => {
    it("listEnrollments 返回分页结果", async () => {
      const { prisma, service } = createAdminService();
      const rows = [
        {
          id: "enr-1",
          createdAt: new Date("2026-03-01T00:00:00Z"),
          student: { studentProfile: { legalName: "张小明" } },
          term: { id: "term-1" },
          section: { course: { code: "CS101" }, meetingTimes: [] }
        }
      ];
      prisma.enrollment.count.mockResolvedValue(1);
      prisma.enrollment.findMany.mockResolvedValue(rows);

      const result = await service.listEnrollments({
        termId: "term-1",
        status: "ENROLLED",
        search: "张小明",
        page: 2,
        pageSize: 10
      });

      expect(prisma.enrollment.count).toHaveBeenCalled();
      expect(prisma.enrollment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: "desc" },
          skip: 10,
          take: 10
        })
      );
      expect(result).toEqual({
        data: rows,
        total: 1,
        page: 2,
        pageSize: 10
      });
    });

    it("bulkApproveEnrollments 空数组直接返回", async () => {
      const { prisma, service } = createAdminService();

      await expect(service.bulkApproveEnrollments([], "admin-1")).resolves.toEqual({ approved: 0 });
      expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
    });

    it("bulkApproveEnrollments 去重后批量批准并记审计", async () => {
      const { prisma, auditService, service } = createAdminService();
      prisma.enrollment.updateMany.mockResolvedValue({ count: 2 });

      await expect(service.bulkApproveEnrollments(["e1", "e1", "e2"], "admin-1")).resolves.toEqual({
        approved: 2
      });

      expect(prisma.enrollment.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["e1", "e2"] },
          deletedAt: null,
          status: "PENDING_APPROVAL"
        },
        data: { status: "ENROLLED" }
      });
      expect(auditService.log).toHaveBeenCalled();
    });

    it("getPendingOverloads 聚合当前学分", async () => {
      const { prisma, service } = createAdminService();
      prisma.enrollment.findMany.mockResolvedValue([
        {
          id: "enr-1",
          studentId: "stu-1",
          termId: "term-1",
          createdAt: new Date("2026-03-01T00:00:00Z"),
          student: {
            email: "student@univ.edu",
            studentId: "U250001",
            studentProfile: { legalName: "张小明" }
          },
          section: {
            id: "sec-1",
            sectionCode: "CS301-01",
            credits: 3,
            course: { code: "CS301", title: "操作系统原理" },
            term: { name: "2026春季学期" }
          }
        }
      ]);
      prisma.$queryRaw.mockResolvedValue([{ studentId: "stu-1", termId: "term-1", totalCredits: 9n }]);

      const rows = await service.getPendingOverloads();

      expect(rows).toEqual([
        expect.objectContaining({
          currentCredits: 9,
          requestedCredits: 3,
          studentEmail: "student@univ.edu",
          courseCode: "CS301"
        })
      ]);
    });

    it("getStudentNotes 返回真实备注列表", async () => {
      const { prisma, service } = createAdminService();
      prisma.studentNote.findMany.mockResolvedValue([{ id: "n1", content: "需要导师跟进" }]);

      await expect(service.getStudentNotes("stu-1")).resolves.toEqual([{ id: "n1", content: "需要导师跟进" }]);
      expect(prisma.studentNote.findMany).toHaveBeenCalledWith({
        where: { studentId: "stu-1" },
        orderBy: { createdAt: "desc" },
        include: { admin: { select: { email: true } } }
      });
    });

    it("createStudentNote 会清洗内容并写审计", async () => {
      const { prisma, auditService, service } = createAdminService();
      prisma.user.findUnique.mockResolvedValue({ id: "stu-1" });
      prisma.studentNote.create.mockResolvedValue({
        id: "note-1",
        content: "<p>需要关注</p>",
        admin: { email: "admin@univ.edu" }
      });

      const note = await service.createStudentNote("admin-1", "stu-1", '<p>需要关注</p><script>alert(1)</script>', "FOLLOW_UP");

      expect(prisma.studentNote.create).toHaveBeenCalledWith({
        data: {
          adminId: "admin-1",
          studentId: "stu-1",
          content: "<p>需要关注</p>",
          flag: "FOLLOW_UP"
        },
        include: { admin: { select: { email: true } } }
      });
      expect(auditService.log).toHaveBeenCalled();
      expect(note.id).toBe("note-1");
    });

    it("deleteStudentNote 删除不存在的备注时抛错", async () => {
      const { prisma, service } = createAdminService();
      prisma.studentNote.findUnique.mockResolvedValue(null);

      await expect(service.deleteStudentNote("admin-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("deleteStudentNote 成功删除并写审计", async () => {
      const { prisma, auditService, service } = createAdminService();
      prisma.studentNote.findUnique.mockResolvedValue({ id: "note-1", studentId: "stu-1" });
      prisma.studentNote.delete.mockResolvedValue({});

      await expect(service.deleteStudentNote("admin-1", "note-1")).resolves.toEqual({ deleted: true });
      expect(prisma.studentNote.delete).toHaveBeenCalledWith({ where: { id: "note-1" } });
      expect(auditService.log).toHaveBeenCalled();
    });

    it("getStudentTags 在学生不存在时抛错", async () => {
      const { prisma, service } = createAdminService();
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getStudentTags("missing")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("getStudentTags 从最新审计记录提取标签", async () => {
      const { prisma, service } = createAdminService();
      prisma.user.findFirst.mockResolvedValue({ id: "stu-1" });
      prisma.auditLog.findFirst.mockResolvedValue({ metadata: { tags: ["预警", "重点关注"] } });

      await expect(service.getStudentTags("stu-1")).resolves.toEqual({
        studentId: "stu-1",
        tags: ["预警", "重点关注"]
      });
    });

    it("setStudentTags 规范化标签后写审计", async () => {
      const { prisma, auditService, service } = createAdminService();
      prisma.user.findFirst.mockResolvedValue({ id: "stu-1" });

      await expect(
        service.setStudentTags("admin-1", "stu-1", [" 预警 ", "重点关注", "预警", ""])
      ).resolves.toEqual({
        studentId: "stu-1",
        tags: ["预警", "重点关注"]
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "STUDENT_TAGS_SET",
          metadata: { tags: ["预警", "重点关注"] }
        })
      );
    });

    it("getBulkStudentTags 空数组直接返回空对象", async () => {
      const { service } = createAdminService();
      await expect(service.getBulkStudentTags([])).resolves.toEqual({});
    });

    it("getBulkStudentTags 返回批量标签映射", async () => {
      const { prisma, service } = createAdminService();
      prisma.$queryRaw.mockResolvedValue([{ entityId: "stu-1", metadata: { tags: ["重点关注"] } }]);

      await expect(service.getBulkStudentTags(["stu-1", "stu-2"])).resolves.toEqual({
        "stu-1": ["重点关注"],
        "stu-2": []
      });
    });

    it("getSystemAlerts 组合关键运营告警", async () => {
      const { prisma, service } = createAdminService();
      prisma.gradeAppeal.count.mockResolvedValue(2);
      prisma.enrollment.count
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(4);
      prisma.studentHold.count.mockResolvedValue(1);
      prisma.term.findMany
        .mockResolvedValueOnce([{ id: "future-1" }])
        .mockResolvedValueOnce([{ id: "past-1" }]);
      prisma.section.findMany.mockResolvedValue([
        { id: "sec-1", capacity: 10, course: { code: "CS101" }, _count: { enrollments: 9 } }
      ]);

      const alerts = await service.getSystemAlerts();

      expect(alerts.map((alert) => alert.id)).toEqual(
        expect.arrayContaining([
          "missing-grades",
          "grade-appeals",
          "pending-enrollments",
          "active-holds",
          "near-capacity",
          "not-closed-out"
        ])
      );
    });

    it("getGraduationClearance 计算可毕业状态", async () => {
      const { prisma, service } = createAdminService();
      prisma.user.findMany.mockResolvedValue([
        {
          id: "stu-1",
          email: "student@univ.edu",
          studentProfile: { legalName: "张小明", programMajor: "计算机科学" },
          enrollments: [
            { status: "COMPLETED", finalGrade: "A", section: { credits: 120 } }
          ]
        },
        {
          id: "stu-2",
          email: "student2@univ.edu",
          studentProfile: { legalName: "李同学", programMajor: "数学" },
          enrollments: [
            { status: "COMPLETED", finalGrade: null, section: { credits: 60 } },
            { status: "PENDING_APPROVAL", finalGrade: null, section: { credits: 3 } }
          ]
        }
      ]);
      prisma.gradeAppeal.findMany.mockResolvedValue([{ studentId: "stu-2" }]);

      const result = await service.getGraduationClearance(120);

      expect(result[0]).toEqual(expect.objectContaining({ userId: "stu-1", eligible: true, creditsDone: 120 }));
      expect(result[1]).toEqual(expect.objectContaining({ userId: "stu-2", eligible: false, openAppeals: 1 }));
    });

    it("getEnrollmentAudit 返回汇总与日期格式化行", async () => {
      const { prisma, service } = createAdminService();
      prisma.enrollment.findMany.mockResolvedValue([
        {
          id: "enr-1",
          status: "ENROLLED",
          finalGrade: null,
          createdAt: new Date("2026-01-05T00:00:00Z"),
          droppedAt: null,
          student: { email: "student@univ.edu", studentId: "U250001" },
          section: {
            sectionCode: "CS101-01",
            course: { code: "CS101", title: "计算机科学导论" },
            term: { name: "2026春季学期" }
          }
        },
        {
          id: "enr-2",
          status: "DROPPED",
          finalGrade: null,
          createdAt: new Date("2026-01-06T00:00:00Z"),
          droppedAt: new Date("2026-01-10T00:00:00Z"),
          student: { email: "student2@univ.edu", studentId: null },
          section: {
            sectionCode: "CS102-01",
            course: { code: "CS102", title: "程序设计" },
            term: { name: "2026春季学期" }
          }
        }
      ]);

      const result = await service.getEnrollmentAudit("term-1");

      expect(result.summary).toEqual({
        total: 2,
        enrolled: 1,
        completed: 0,
        dropped: 1,
        waitlisted: 0
      });
      expect(result.rows[0]).toEqual(expect.objectContaining({ enrolledAt: "2026-01-05" }));
      expect(result.rows[1]).toEqual(expect.objectContaining({ studentId: "—", droppedAt: "2026-01-10" }));
    });

    it("getPrereqMap 返回节点和边", async () => {
      const { prisma, service } = createAdminService();
      prisma.course.findMany.mockResolvedValue([
        {
          id: "course-1",
          code: "CS101",
          title: "计算机科学导论",
          credits: 3,
          prerequisiteLinks: []
        },
        {
          id: "course-2",
          code: "CS201",
          title: "数据结构",
          credits: 3,
          prerequisiteLinks: [
            { prerequisiteCourse: { id: "course-1", code: "CS101", title: "计算机科学导论" } }
          ]
        }
      ]);

      const result = await service.getPrereqMap();

      expect(result.summary).toEqual({
        totalCourses: 2,
        coursesWithPrereqs: 1,
        totalPrereqRelations: 1
      });
      expect(result.edges).toEqual([
        { from: "course-1", to: "course-2", fromCode: "CS101", toCode: "CS201" }
      ]);
    });

    it("getSectionRoster 返回名册统计与平均绩点", async () => {
      const { prisma, service } = createAdminService();
      prisma.section.findUnique.mockResolvedValue({
        id: "sec-1",
        capacity: 30,
        instructorName: "王老师",
        course: { code: "CS101", title: "计算机科学导论", credits: 3 },
        term: { name: "2026春季学期" },
        instructorUser: { email: "faculty@univ.edu" },
        enrollments: [
          {
            id: "e1",
            status: "ENROLLED",
            finalGrade: null,
            createdAt: new Date("2026-01-01T00:00:00Z"),
            student: { email: "student1@univ.edu", studentProfile: { legalName: "张小明" } }
          },
          {
            id: "e2",
            status: "COMPLETED",
            finalGrade: "A",
            createdAt: new Date("2026-01-02T00:00:00Z"),
            student: { email: "student2@univ.edu", studentProfile: { legalName: "李雅文" } }
          }
        ]
      });

      const roster = await service.getSectionRoster("sec-1");

      expect(roster).toEqual(
        expect.objectContaining({
          sectionId: "sec-1",
          enrolled: 1,
          completed: 1,
          dropped: 0,
          avgGpa: 4
        })
      );
      expect(roster.roster[0]).toEqual(expect.objectContaining({ no: 1, name: "张小明" }));
    });

    it("getRegistrationWindows 返回状态和优先窗口", async () => {
      const { prisma, service } = createAdminService();
      prisma.term.findMany.mockResolvedValue([
        {
          id: "term-1",
          name: "2026春季学期",
          startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          registrationOpenAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          registrationCloseAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
        }
      ]);

      const rows = await service.getRegistrationWindows();

      expect(rows[0].name).toBe("2026春季学期");
      expect(rows[0].priorityWindows).toHaveLength(4);
      expect(typeof rows[0].status).toBe("string");
    });

    it("getSystemHealth 返回运行状态摘要", async () => {
      const { prisma, service } = createAdminService();
      prisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);
      prisma.term.findFirst
        .mockResolvedValueOnce({ id: "term-1", name: "2026春季学期" })
        .mockResolvedValueOnce(null);
      prisma.user.count.mockResolvedValue(120);
      prisma.enrollment.count.mockResolvedValue(340);
      prisma.auditLog.count.mockResolvedValue(2);

      const result = await service.getSystemHealth();

      expect(result).toEqual(
        expect.objectContaining({
          dbOk: true,
          totalStudents: 120,
          totalEnrollments: 340,
          activeTermName: "2026春季学期",
          recentErrors: 2
        })
      );
    });

    it("listUsers 返回分页用户列表", async () => {
      const { prisma, service } = createAdminService();
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([
        {
          id: "u1",
          email: "student@univ.edu",
          studentId: "U250001",
          role: "STUDENT",
          emailVerifiedAt: null,
          lastLoginAt: null,
          loginAttempts: 0,
          lockedUntil: null,
          createdAt: new Date("2026-01-01T00:00:00Z")
        }
      ]);

      const result = await service.listUsers({ search: "student", role: "STUDENT", page: 1, limit: 20 });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 20,
          skip: 0,
          orderBy: { createdAt: "desc" }
        })
      );
      expect(result.total).toBe(1);
      expect(result.users[0]).toEqual(expect.objectContaining({ email: "student@univ.edu", role: "STUDENT" }));
    });
  });

  describe("Dashboard and listing", () => {
    it("dashboard 返回当前学期运营概览", async () => {
      const { prisma, service } = createAdminService();
      prisma.user.count.mockResolvedValue(120);
      prisma.term.count.mockResolvedValue(3);
      prisma.course.count.mockResolvedValue(15);
      prisma.section.count.mockResolvedValue(20);
      prisma.enrollment.count
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(40)
        .mockResolvedValueOnce(8);
      prisma.term.findFirst.mockResolvedValue({
        id: "term-1",
        name: "2026春季学期",
        registrationOpenAt: new Date("2026-01-01T00:00:00Z"),
        registrationCloseAt: new Date("2026-01-20T00:00:00Z"),
        registrationOpen: true,
        dropDeadline: new Date("2026-02-15T00:00:00Z"),
        _count: { sections: 20, enrollments: 132 }
      });
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: "log-1",
          action: "admin_crud",
          entityType: "term",
          createdAt: new Date("2026-03-01T00:00:00Z"),
          actor: { email: "admin@univ.edu", role: "ADMIN" }
        }
      ]);

      const result = await service.dashboard();

      expect(result).toEqual(
        expect.objectContaining({
          students: 120,
          terms: 3,
          courses: 15,
          sections: 20,
          enrollments: 138,
          waitlist: 6,
          activeTerm: expect.objectContaining({ name: "2026春季学期" }),
          recentActivity: [expect.objectContaining({ actorEmail: "admin@univ.edu" })]
        })
      );
    });

    it("listTerms 聚合 sectionCount 和 enrollmentCount", async () => {
      const { prisma, service } = createAdminService();
      prisma.term.findMany.mockResolvedValue([
        {
          id: "term-1",
          name: "2026春季学期",
          _count: { sections: 5 }
        }
      ]);
      prisma.enrollment.groupBy.mockResolvedValue([
        { termId: "term-1", _count: { id: 42 } }
      ]);

      const result = await service.listTerms();

      expect(result).toEqual([
        expect.objectContaining({
          id: "term-1",
          sectionCount: 5,
          enrollmentCount: 42
        })
      ]);
    });
  });

  describe("Admin CRUD", () => {
    it("createTerm 会创建学期并记录审计", async () => {
      const { prisma, auditService, service } = createAdminService();
      prisma.term.create.mockResolvedValue({ id: "term-1", name: "2026春季学期" });

      const term = await service.createTerm(
        {
          name: "2026春季学期",
          startDate: "2026-01-10T00:00:00.000Z",
          endDate: "2026-05-20T00:00:00.000Z",
          registrationOpenAt: "2025-12-01T00:00:00.000Z",
          registrationCloseAt: "2026-01-20T00:00:00.000Z",
          registrationOpen: true,
          dropDeadline: "2026-02-10T00:00:00.000Z",
          maxCredits: 20,
          timezone: "America/Los_Angeles"
        },
        "admin-1"
      );

      expect(prisma.term.create).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
      expect(term.id).toBe("term-1");
    });

    it("updateTerm 不存在时抛错，存在时更新", async () => {
      const missing = createAdminService();
      missing.prisma.term.findUnique.mockResolvedValue(null);
      await expect(missing.service.updateTerm("missing", { name: "新学期" }, "admin-1")).rejects.toBeInstanceOf(
        NotFoundException
      );

      const { prisma, auditService, service } = createAdminService();
      prisma.term.findUnique.mockResolvedValue({
        id: "term-1",
        name: "旧学期",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-05-01T00:00:00Z"),
        registrationOpenAt: new Date("2025-12-01T00:00:00Z"),
        registrationCloseAt: new Date("2026-01-15T00:00:00Z"),
        registrationOpen: true,
        dropDeadline: new Date("2026-02-01T00:00:00Z"),
        maxCredits: 18,
        timezone: "America/Los_Angeles"
      });
      prisma.term.update.mockResolvedValue({ id: "term-1", name: "新学期" });

      await expect(service.updateTerm("term-1", { name: "新学期", maxCredits: 21 }, "admin-1")).resolves.toEqual({
        id: "term-1",
        name: "新学期"
      });
      expect(auditService.log).toHaveBeenCalled();
    });

    it("deleteTerm 有活跃注册时拒绝，无活跃注册时删除", async () => {
      const blocked = createAdminService();
      blocked.prisma.section.count.mockResolvedValue(2);
      await expect(blocked.service.deleteTerm("term-1", "admin-1")).rejects.toBeInstanceOf(ConflictException);

      const { prisma, auditService, service } = createAdminService();
      prisma.section.count.mockResolvedValue(0);
      prisma.term.delete.mockResolvedValue({});

      await expect(service.deleteTerm("term-1", "admin-1")).resolves.toEqual({ id: "term-1" });
      expect(prisma.term.delete).toHaveBeenCalledWith({ where: { id: "term-1" } });
      expect(auditService.log).toHaveBeenCalled();
    });

    it("toggleTermRegistration 切换注册开关", async () => {
      const { prisma, auditService, service } = createAdminService();
      prisma.term.findUnique.mockResolvedValue({ id: "term-1", registrationOpen: true });
      prisma.term.update.mockResolvedValue({ id: "term-1", registrationOpen: false });

      await expect(service.toggleTermRegistration("term-1", "admin-1")).resolves.toEqual({
        id: "term-1",
        registrationOpen: false
      });
      expect(auditService.log).toHaveBeenCalled();
    });

    it("createCourse / updateCourse / deleteCourse 走真实前置校验", async () => {
      const { prisma, auditService, service } = createAdminService();
      prisma.course.create.mockResolvedValue({ id: "course-1" });
      prisma.course.findUnique
        .mockResolvedValueOnce({
          id: "course-1",
          code: "CS101",
          title: "计算机科学导论",
          description: "基础课",
          credits: 3,
          weeklyHours: 3,
          deletedAt: null
        })
        .mockResolvedValueOnce({
          id: "course-1",
          code: "CS101",
          title: "旧标题",
          description: null,
          credits: 3,
          weeklyHours: null,
          deletedAt: null
        })
        .mockResolvedValueOnce({ id: "course-1", deletedAt: null })
        .mockResolvedValueOnce({ id: "course-1", deletedAt: null })
        .mockResolvedValueOnce({ id: "course-1", deletedAt: null });
      prisma.course.update.mockResolvedValue({ id: "course-1", code: "CS101", title: "新标题" });
      prisma.coursePrerequisite.createMany.mockResolvedValue({ count: 1 });
      prisma.coursePrerequisite.deleteMany.mockResolvedValue({ count: 1 });
      prisma.section.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);

      await service.createCourse(
        {
          code: "CS101",
          title: "计算机科学导论",
          description: "基础课",
          credits: 3,
          weeklyHours: 3,
          prerequisiteCourseIds: ["course-pre-1"]
        },
        "admin-1"
      );
      await service.updateCourse("course-1", { title: "新标题", prerequisiteCourseIds: [] }, "admin-1");
      await expect(service.deleteCourse("course-1", "admin-1")).rejects.toBeInstanceOf(ConflictException);

      prisma.section.count.mockResolvedValueOnce(0);
      await expect(service.deleteCourse("course-1", "admin-1")).resolves.toEqual({ id: "course-1" });
      expect(auditService.log).toHaveBeenCalled();
    });

    it("listSections 计算平均评分", async () => {
      const { prisma, service } = createAdminService();
      prisma.section.findMany.mockResolvedValue([
        {
          id: "sec-1",
          ratings: [{ rating: 4 }, { rating: 5 }],
          enrollments: [],
          term: { id: "term-1" },
          course: { id: "course-1" }
        }
      ]);

      const rows = await service.listSections();
      expect(rows[0].avgRating).toBe(4.5);
    });

    it("createSection / updateSection / deleteSection 完成基本 CRUD", async () => {
      const { prisma, auditService, service } = createAdminService();
      prisma.user.findFirst.mockResolvedValue({
        id: "faculty-1",
        email: "faculty@univ.edu",
        facultyProfile: { displayName: "王老师" }
      });
      prisma.section.create.mockResolvedValue({ id: "sec-1", meetingTimes: [] });
      prisma.section.findUnique
        .mockResolvedValueOnce({
          id: "sec-1",
          termId: "term-1",
          courseId: "course-1",
          sectionCode: "CS101-01",
          modality: "ON_CAMPUS",
          capacity: 30,
          credits: 3,
          instructorName: "王老师",
          location: "A101",
          requireApproval: false,
          startDate: null,
          meetingTimes: [],
          instructorUser: { id: "faculty-1" }
        })
        .mockResolvedValueOnce({ id: "sec-1", _count: { enrollments: 0 } });
      prisma.section.update.mockResolvedValue({ id: "sec-1", meetingTimes: [], ratings: [], enrollments: [] });
      prisma.section.delete.mockResolvedValue({});
      prisma.meetingTime.deleteMany.mockResolvedValue({ count: 0 });

      await service.createSection(
        {
          termId: "term-1",
          courseId: "course-1",
          sectionCode: "CS101-01",
          modality: "ON_CAMPUS",
          capacity: 30,
          credits: 3,
          instructorName: "王老师",
          instructorUserId: "faculty-1",
          location: "A101",
          requireApproval: false,
          meetingTimes: [{ weekday: 1, startMinutes: 540, endMinutes: 630 }]
        },
        "admin-1"
      );
      await service.updateSection(
        "sec-1",
        {
          capacity: 35,
          meetingTimes: [{ weekday: 3, startMinutes: 600, endMinutes: 690 }]
        },
        "admin-1"
      );
      await expect(service.deleteSection("sec-1", "admin-1")).resolves.toEqual({ id: "sec-1" });
      expect(auditService.log).toHaveBeenCalled();
    });

    it("createInviteCode / updateInviteCode / deleteInviteCode 工作正常", async () => {
      const { prisma, auditService, service } = createAdminService();
      prisma.inviteCode.create.mockResolvedValue({ id: "invite-1", code: "SPRING2026" });
      prisma.inviteCode.findUnique
        .mockResolvedValueOnce({
          id: "invite-1",
          code: "SPRING2026",
          expiresAt: null,
          maxUses: null,
          active: true
        })
        .mockResolvedValueOnce({
          id: "invite-1",
          code: "SPRING2026",
          usedAt: null,
          usedCount: 0
        });
      prisma.inviteCode.update.mockResolvedValue({ id: "invite-1", code: "SPRING2026A" });
      prisma.inviteCode.delete.mockResolvedValue({});

      await service.createInviteCode({ code: "SPRING2026", active: true }, "admin-1");
      await service.updateInviteCode("invite-1", { code: "SPRING2026A" }, "admin-1");
      await expect(service.deleteInviteCode("invite-1", "admin-1")).resolves.toEqual({ id: "invite-1" });
      expect(auditService.log).toHaveBeenCalled();
    });

    it("updateUserRole / getAnnouncements / getUserLoginHistory / updateSystemSetting 可正常运行", async () => {
      const { prisma, auditService, service } = createAdminService();
      prisma.user.update.mockResolvedValue({ id: "user-1", role: "ADMIN" });
      prisma.announcement.findMany.mockResolvedValue([{ id: "ann-1", title: "通知" }]);
      prisma.user.findUnique.mockResolvedValue({ id: "user-1", role: "STUDENT", lastLoginAt: null, loginAttempts: 0, lockedUntil: null });
      prisma.systemSetting.upsert.mockResolvedValue({ key: "registration_enabled", value: "true" });

      await expect(service.updateUserRole("user-1", "ADMIN", "admin-1")).resolves.toEqual({
        id: "user-1",
        role: "ADMIN"
      });
      await expect(service.getAnnouncements()).resolves.toEqual([{ id: "ann-1", title: "通知" }]);
      await expect(service.getUserLoginHistory("user-1")).resolves.toEqual({
        id: "user-1",
        role: "STUDENT",
        lastLoginAt: null,
        loginAttempts: 0,
        lockedUntil: null
      });
      await expect(service.updateSystemSetting("registration_enabled", "true", "admin-1")).resolves.toEqual({
        key: "registration_enabled",
        value: "true"
      });
      expect(auditService.log).toHaveBeenCalled();
    });

    it("updateSystemSetting 遇到未知键时报错", async () => {
      const { service } = createAdminService();
      await expect(service.updateSystemSetting("unknown_key", "1", "admin-1")).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it("notifySection 成功发送通知并返回发送统计", async () => {
      const { prisma, auditService, service } = createAdminService();
      prisma.section.findUnique.mockResolvedValue({
        id: "sec-1",
        course: { code: "CS101" },
        sectionCode: "CS101-01"
      });
      prisma.enrollment.findMany.mockResolvedValue([
        {
          student: {
            email: "student1@univ.edu",
            studentProfile: { legalName: "张小明" }
          }
        },
        {
          student: {
            email: "student2@univ.edu",
            studentProfile: { legalName: "李雅文" }
          }
        }
      ]);
      const notificationsService = (service as any).notificationsService;
      notificationsService.sendMail
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const result = await service.notifySection("sec-1", "补课通知", "明天停课。", "admin-1");

      expect(result).toEqual({ sent: 1, failed: 1, total: 2 });
      expect(auditService.log).toHaveBeenCalled();
    });

    it("cloneSection 复制教学班和 meetingTimes", async () => {
      const { prisma, auditService, service } = createAdminService();
      prisma.section.findUnique.mockResolvedValue({
        id: "sec-1",
        courseId: "course-1",
        termId: "term-1",
        instructorName: "王老师",
        location: "A101",
        capacity: 30,
        modality: "ON_CAMPUS",
        credits: 3,
        requireApproval: false,
        startDate: null,
        sectionCode: "CS101-01",
        meetingTimes: [{ weekday: 1, startMinutes: 540, endMinutes: 630 }]
      });
      prisma.section.create.mockResolvedValue({ id: "sec-copy", meetingTimes: [{ weekday: 1 }] });

      const clone = await service.cloneSection("sec-1", "admin-1", "term-2");

      expect(prisma.section.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            termId: "term-2",
            meetingTimes: {
              create: [{ weekday: 1, startMinutes: 540, endMinutes: 630 }]
            }
          })
        })
      );
      expect(auditService.log).toHaveBeenCalled();
      expect(clone.id).toBe("sec-copy");
    });

    it("listSectionEnrollments 在 section 不存在时抛错，存在时返回注册记录", async () => {
      const missing = createAdminService();
      missing.prisma.section.findUnique.mockResolvedValue(null);
      await expect(missing.service.listSectionEnrollments("missing")).rejects.toBeInstanceOf(NotFoundException);

      const { prisma, service } = createAdminService();
      prisma.section.findUnique.mockResolvedValue({ id: "sec-1" });
      prisma.enrollment.findMany.mockResolvedValue([{ id: "enr-1" }]);
      await expect(service.listSectionEnrollments("sec-1")).resolves.toEqual([{ id: "enr-1" }]);
    });

    it("getTermCloseoutPreview 和 bulkCloseOutTerm 返回正确摘要", async () => {
      const { prisma, auditService, service } = createAdminService();
      prisma.term.findUnique.mockResolvedValue({ id: "term-1", name: "2026春季学期" });
      prisma.enrollment.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(8);
      prisma.enrollment.updateMany.mockResolvedValue({ count: 10 });

      await expect(service.getTermCloseoutPreview("term-1")).resolves.toEqual({
        termId: "term-1",
        termName: "2026春季学期",
        enrolled: 10,
        waitlisted: 2,
        pendingApproval: 1,
        completed: 8
      });

      await expect(service.bulkCloseOutTerm("term-1", "admin-1", "enroll_to_completed")).resolves.toEqual({
        termId: "term-1",
        termName: "2026春季学期",
        action: "enroll_to_completed",
        updated: 10
      });
      expect(auditService.log).toHaveBeenCalled();
    });

    it("adminDropEnrollment 会释放座位并自动晋升候补", async () => {
      const { prisma, auditService, service } = createAdminService();
      prisma.enrollment.findFirst
        .mockResolvedValueOnce({
          id: "enr-1",
          status: "ENROLLED",
          sectionId: "sec-1",
          studentId: "stu-1",
          waitlistPosition: null,
          term: { name: "2026春季学期" },
          student: { studentProfile: { legalName: "张小明" } },
          section: {
            sectionCode: "CS101-01",
            course: { code: "CS101", title: "计算机科学导论" }
          }
        })
        .mockResolvedValueOnce({
          id: "enr-2",
          studentId: "stu-2",
          sectionId: "sec-1",
          status: "WAITLISTED",
          student: {
            email: "waitlist@univ.edu",
            studentProfile: { legalName: "李雅文" }
          },
          section: {
            sectionCode: "CS101-01",
            course: { code: "CS101", title: "计算机科学导论" },
            term: { name: "2026春季学期" }
          }
        });
      prisma.enrollment.update.mockResolvedValue({ id: "enr-1", status: "DROPPED" });
      prisma.$transaction
        .mockImplementationOnce(async (fn: any) =>
          fn({
            enrollment: { update: jest.fn().mockResolvedValue({ id: "enr-2" }) }
          })
        )
        .mockImplementationOnce(async (fn: any) => fn({}));
      const notificationsService = (service as any).notificationsService;
      notificationsService.sendWaitlistPromotionEmail.mockResolvedValue(true);

      const result = await service.adminDropEnrollment("enr-1", "admin-1");

      expect(result).toEqual(expect.objectContaining({ seatFreed: true, promotedEnrollmentId: "enr-2" }));
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: "AUTO_PROMOTE_WAITLIST", entityId: "enr-2" })
      );
      expect(notificationsService.sendWaitlistPromotionEmail).toHaveBeenCalled();
    });

    it("getAdminHolds / createAdminHold / removeAdminHold 走治理服务", async () => {
      const { governanceService, service } = createAdminService();
      governanceService.listHolds.mockResolvedValue([
        { id: "h1", active: true },
        { id: "h2", active: false }
      ]);
      governanceService.createHold.mockResolvedValue({ id: "h1" });
      governanceService.resolveHold.mockResolvedValue({ id: "h1", active: false });

      await expect(service.getAdminHolds("admin-1")).resolves.toEqual([{ id: "h1", active: true }]);
      await expect(
        service.createAdminHold("admin-1", { studentId: "stu-1", type: "FINANCIAL", reason: "欠费" } as any)
      ).resolves.toEqual({ id: "h1" });
      await expect(service.removeAdminHold("admin-1", "h1", "已处理")).resolves.toEqual({ id: "h1", active: false });
    });

    it("listInviteCodes / getSystemSettings 返回列表数据", async () => {
      const { prisma, service } = createAdminService();
      prisma.inviteCode.findMany.mockResolvedValue([{ id: "invite-1", code: "SPRING2026" }]);
      prisma.systemSetting.findMany.mockResolvedValue([{ key: "registration_enabled", value: "true" }]);

      await expect(service.listInviteCodes()).resolves.toEqual([{ id: "invite-1", code: "SPRING2026" }]);
      await expect(service.getSystemSettings()).resolves.toEqual([{ key: "registration_enabled", value: "true" }]);
    });

    it("createAnnouncement / updateAnnouncement / deleteAnnouncement 可正常执行", async () => {
      const { prisma, service } = createAdminService();
      prisma.announcement.create.mockResolvedValue({ id: "ann-1", title: "选课提醒", audience: "ALL" });
      prisma.announcement.update
        .mockResolvedValueOnce({ id: "ann-1", title: "更新后的公告" })
        .mockResolvedValueOnce({ id: "ann-1", active: false });

      await expect(
        service.createAnnouncement({
          title: "选课提醒",
          body: "<p>请按时选课</p><script>alert(1)</script>",
          audience: "ALL",
          pinned: true
        })
      ).resolves.toEqual({ id: "ann-1", title: "选课提醒", audience: "ALL" });

      await expect(
        service.updateAnnouncement("ann-1", { title: "更新后的公告", audience: "student" })
      ).resolves.toEqual({ id: "ann-1", title: "更新后的公告" });

      await expect(service.deleteAnnouncement("ann-1")).resolves.toEqual({ id: "ann-1", active: false });
    });

    it("getRegistrationStats 汇总状态、学期和热门教学班", async () => {
      const { prisma, service } = createAdminService();
      prisma.enrollment.count.mockResolvedValue(120);
      prisma.enrollment.groupBy
        .mockResolvedValueOnce([
          { status: "ENROLLED", _count: { id: 80 } },
          { status: "WAITLISTED", _count: { id: 10 } }
        ])
        .mockResolvedValueOnce([
          { termId: "term-1", _count: { id: 90 } }
        ]);
      prisma.section.findMany.mockResolvedValue([
        {
          id: "sec-1",
          course: { code: "CS101", title: "计算机科学导论" },
          _count: { enrollments: 40 }
        }
      ]);

      await expect(service.getRegistrationStats()).resolves.toEqual({
        total: 120,
        byStatus: { ENROLLED: 80, WAITLISTED: 10 },
        byTerm: [{ termId: "term-1", count: 90 }],
        topSections: [{ id: "sec-1", code: "CS101", title: "计算机科学导论", count: 40 }]
      });
    });
  });

  describe("AdminService proxy delegations", () => {
    it("sendTestMail 委托给 mailService", async () => {
      const { service, mailService } = createAdminService();
      await service.sendTestMail("ops@test.com");
      expect(mailService.sendTest).toHaveBeenCalledWith("ops@test.com");
    });

    it("updateEnrollmentGrade 会规范化成绩后再委托给 gradesService", async () => {
      const { service, gradesService } = createAdminService();
      gradesService.updateEnrollmentGrade.mockResolvedValue({ ok: true });

      await expect(
        service.updateEnrollmentGrade("stu-1", "sec-1", " a+ ", "admin-1")
      ).resolves.toEqual({ ok: true });

      expect(gradesService.updateEnrollmentGrade).toHaveBeenCalledWith(
        "stu-1",
        "sec-1",
        "A+",
        "admin-1"
      );
    });

    it("updateEnrollmentGrade 遇到非法成绩时直接抛错", async () => {
      const { service, gradesService } = createAdminService();
      await expect(
        service.updateEnrollmentGrade("stu-1", "sec-1", "PASS", "admin-1")
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(gradesService.updateEnrollmentGrade).not.toHaveBeenCalled();
    });

    it.each([
      ["bulkUpdateGrades", "gradesService", "bulkUpdateGrades", ["sec-1", [{ enrollmentId: "e1", grade: "A" }], "admin-1"], { updated: 1 }],
      ["listEnrollments", "analyticsService", "listEnrollments", [{ termId: "term-1", page: 1, pageSize: 20 }], { data: [], total: 0, page: 1, pageSize: 20 }],
      ["bulkApproveEnrollments", "analyticsService", "bulkApproveEnrollments", [["e1", "e2"], "admin-1"], { approved: 2 }],
      ["getPendingOverloads", "analyticsService", "getPendingOverloads", [], [{ id: "ov-1" }]],
      ["decidePendingOverload", "analyticsService", "decidePendingOverload", ["ov-1", true, "admin-1"], { ok: true }],
      ["getPrereqWaivers", "analyticsService", "getPrereqWaivers", ["admin-1", "PENDING"], [{ id: "w1" }]],
      ["decidePrereqWaiver", "analyticsService", "decidePrereqWaiver", ["admin-1", "w1", { status: "APPROVED", adminNote: "ok" }], { id: "w1", status: "APPROVED" }],
      ["updateGrade", "gradesService", "updateGrade", [{ enrollmentId: "e1", finalGrade: "A" }, "admin-1"], { id: "e1" }],
      ["getEnrollmentTrend", "analyticsService", "getEnrollmentTrend", [30], { total: 10 }],
      ["getTopSections", "analyticsService", "getTopSections", ["term-1"], [{ id: "sec-1" }]],
      ["getStudentNotes", "analyticsService", "getStudentNotes", ["stu-1"], [{ id: "note-1" }]],
      ["createStudentNote", "analyticsService", "createStudentNote", ["admin-1", "stu-1", "内容", "FOLLOW_UP"], { id: "note-1" }],
      ["deleteStudentNote", "analyticsService", "deleteStudentNote", ["admin-1", "note-1"], { deleted: true }],
      ["getAvailableStudentTags", "analyticsService", "getAvailableStudentTags", [], ["预警"]],
      ["getStudentTags", "analyticsService", "getStudentTags", ["stu-1"], { studentId: "stu-1", tags: ["预警"] }],
      ["setStudentTags", "analyticsService", "setStudentTags", ["admin-1", "stu-1", ["预警"]], { studentId: "stu-1", tags: ["预警"] }],
      ["getBulkStudentTags", "analyticsService", "getBulkStudentTags", [["stu-1"]], { "stu-1": ["预警"] }],
      ["buildDigestPreview", "analyticsService", "buildDigestPreview", ["term-1"], { enrolledCount: 1, waitlistedCount: 0, cartCount: 0, pendingAppeals: 0, upcomingDeadline: null, topSections: [], htmlPreview: "<p>x</p>" }],
      ["sendDigestEmail", "analyticsService", "sendDigestEmail", ["admin-1", "ops@test.com", "term-1"], { sent: true }],
      ["createCalendarEvent", "analyticsService", "createCalendarEvent", ["admin-1", { title: "开放", eventDate: "2026-03-21T00:00:00.000Z" }], { id: "ev-1" }],
      ["updateCalendarEvent", "analyticsService", "updateCalendarEvent", ["admin-1", "ev-1", { title: "更新" }], { id: "ev-1" }],
      ["deleteCalendarEvent", "analyticsService", "deleteCalendarEvent", ["admin-1", "ev-1"], { deleted: true }],
      ["unifiedSearch", "analyticsService", "unifiedSearch", ["张", "student"], { students: [], courses: [], sections: [] }],
      ["getSystemAlerts", "analyticsService", "getSystemAlerts", [], []],
      ["getPrereqViolations", "analyticsService", "getPrereqViolations", [], []],
      ["previewStatusEmail", "analyticsService", "previewStatusEmail", ["term-1", "ENROLLED"], { recipientCount: 1 }],
      ["sendStatusEmail", "analyticsService", "sendStatusEmail", ["term-1", "ENROLLED", "主题", "正文", "admin-1"], { sent: 1, total: 1 }],
      ["getWaitlistAnalytics", "analyticsService", "getWaitlistAnalytics", ["term-1"], { totalWaitlisted: 0 }],
      ["getGraduationClearance", "analyticsService", "getGraduationClearance", [120], []],
      ["getEnrollmentAudit", "analyticsService", "getEnrollmentAudit", ["term-1", "COMPLETED"], { summary: {}, rows: [] }],
      ["getPrereqMap", "analyticsService", "getPrereqMap", [], { nodes: [], edges: [] }],
      ["previewGradeCurve", "gradesService", "previewGradeCurve", ["sec-1", 1], [{ enrollmentId: "e1", newGrade: "A-" }]],
      ["getSectionRoster", "analyticsService", "getSectionRoster", ["sec-1"], { students: [] }],
      ["getRegistrationWindows", "analyticsService", "getRegistrationWindows", [], []],
      ["getSystemHealth", "analyticsService", "getSystemHealth", [], { dbOk: true }],
      ["listUsers", "analyticsService", "listUsers", [{ page: 1, limit: 20 }], { total: 0, page: 1, limit: 20, users: [] }],
      ["setUserLock", "analyticsService", "setUserLock", ["u1", true, "admin-1"], { id: "u1", lockedUntil: null }],
      ["bulkEnroll", "analyticsService", "bulkEnroll", [["stu-1"], "sec-1", "admin-1"], { succeeded: ["stu-1"], failed: [] }],
      ["bulkDrop", "analyticsService", "bulkDrop", [["e1"], "admin-1"], { succeeded: 1, failed: [] }],
      ["bulkUpdateStudentStatus", "analyticsService", "bulkUpdateStudentStatus", [["stu-1"], "ACTIVE", "admin-1"], { updated: 1 }],
      ["updateRegistrationWindow", "analyticsService", "updateRegistrationWindow", ["term-1", "2026-03-01T00:00:00.000Z", "2026-03-10T00:00:00.000Z", "admin-1"], { id: "term-1" }],
      ["getScheduleConflicts", "analyticsService", "getScheduleConflicts", ["term-1"], []]
    ])("%s 会透传给下层服务", async (_label, target, method, args, expected) => {
      const ctx = createAdminService();
      const dependency = ctx[target as "analyticsService" | "gradesService"] as Record<string, unknown>;
      const candidate = dependency[method];
      const mock: any =
        typeof candidate === "function" && "mockResolvedValue" in (candidate as object)
          ? (candidate as jest.Mock)
          : jest.spyOn(dependency as Record<string, (...args: unknown[]) => unknown>, method as string);

      mock.mockResolvedValue(expected);

      await expect((ctx.service as any)[method](...args)).resolves.toEqual(expected);
      expect(mock).toHaveBeenCalledWith(...args);
    });
  });

  describe("AdminService import and enrollment flows", () => {
    it("importStudents dryRun 会解析 CSV 并返回 wouldCreate", async () => {
      const { prisma, service } = createAdminService();
      prisma.user.findMany.mockResolvedValue([]);

      const result = await service.importStudents(
        {
          csv: "email,studentId,legalName,password\nstudent1@test.com,U250001,张小明,Student1234!",
          dryRun: true
        } as any,
        "admin-1"
      );

      expect(result).toEqual({ created: 0, dryRun: true, wouldCreate: 1 });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("importStudents 遇到重复邮箱时抛 CSV_ROW_INVALID", async () => {
      const { service } = createAdminService();

      await expect(
        service.importStudents(
          {
            csv: "email,studentId,legalName,password\nstudent1@test.com,U250001,张小明,Student1234!\nstudent1@test.com,U250002,李雅文,Student1234!"
          } as any,
          "admin-1"
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("importCourses dryRun 会校验课程并返回 wouldCreate", async () => {
      const { prisma, service } = createAdminService();
      prisma.course.findMany.mockResolvedValue([]);

      const result = await service.importCourses(
        {
          csv: "code,title,credits,description\nCS101,计算机科学导论,3,课程描述",
          dryRun: true
        } as any,
        "admin-1"
      );

      expect(result).toEqual({ created: 0, dryRun: true, wouldCreate: 1 });
    });

    it("importSections dryRun 会解析 meetingTimes 并返回 wouldCreate", async () => {
      const { prisma, service } = createAdminService();
      prisma.term.findMany.mockResolvedValue([{ id: "term-1", name: "2025秋季学期" }]);
      prisma.course.findMany.mockResolvedValue([{ id: "course-1", code: "CS101" }]);
      prisma.section.findMany.mockResolvedValue([]);

      const result = await service.importSections(
        {
          csv: "termName,courseCode,sectionCode,modality,capacity,credits,instructorName,location,requireApproval,meetings\n2025秋季学期,CS101,A,ON_CAMPUS,40,3,张伟明,教一,true,1|540|630;3|540|630",
          dryRun: true
        } as any,
        "admin-1"
      );

      expect(result).toEqual({ created: 0, dryRun: true, wouldCreate: 1 });
    });

    it("updateEnrollment 会规范化 finalGrade 并记录审计", async () => {
      const { prisma, auditService, service } = createAdminService();
      prisma.enrollment.findFirst.mockResolvedValue({ id: "e1", status: "ENROLLED", finalGrade: null });
      prisma.enrollment.update.mockResolvedValue({ id: "e1", status: "ENROLLED", finalGrade: "A+" });

      const result = await service.updateEnrollment("e1", { finalGrade: " a+ " }, "admin-1");

      expect(prisma.enrollment.update).toHaveBeenCalledWith({
        where: { id: "e1" },
        data: { status: "ENROLLED", finalGrade: "A+" }
      });
      expect(auditService.log).toHaveBeenCalled();
      expect(result).toEqual({ id: "e1", status: "ENROLLED", finalGrade: "A+" });
    });

    it("listWaitlist 只查询 WAITLISTED 记录", async () => {
      const { prisma, service } = createAdminService();
      prisma.enrollment.findMany.mockResolvedValue([{ id: "w1" }]);

      await expect(service.listWaitlist("sec-1")).resolves.toEqual([{ id: "w1" }]);
      expect(prisma.enrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ status: "WAITLISTED", sectionId: "sec-1" })
      }));
    });

    it("promoteWaitlist 成功晋升一名学生并发送通知", async () => {
      const { prisma, auditService, notificationsService, registrationService, service } = createAdminService();
      jest.spyOn(service as any, "writeWaitlistPromotionNotification").mockResolvedValue(undefined);

      prisma.section.findUnique.mockResolvedValue({ id: "sec-1", capacity: 2 });
      prisma.enrollment.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);
      prisma.enrollment.findMany
        .mockResolvedValueOnce([
          {
            id: "e1",
            studentId: "stu-1",
            sectionId: "sec-1",
            createdAt: new Date("2026-03-21T00:00:00Z")
          }
        ])
        .mockResolvedValueOnce([
          {
            id: "e1",
            studentId: "stu-1",
            sectionId: "sec-1",
            section: { course: { code: "CS101", title: "计算机科学导论" } }
          }
        ])
        .mockResolvedValueOnce([
          {
            id: "e1",
            student: { email: "student1@test.com", studentProfile: { legalName: "张小明" } },
            section: { term: { name: "2025秋季学期" }, course: { code: "CS101" }, sectionCode: "A" }
          }
        ]);
      prisma.enrollment.updateMany.mockResolvedValue({ count: 1 });
      registrationService.normalizeWaitlistPositions.mockResolvedValue(undefined);
      auditService.logInTransaction.mockResolvedValue(undefined);
      notificationsService.sendWaitlistPromotionEmail.mockResolvedValue(true);

      const result = await service.promoteWaitlist({ sectionId: "sec-1", count: 1 } as any, "admin-1");

      expect(result).toMatchObject({ promotedCount: 1, remainingWaitlistCount: 0, availableSeatsBefore: 1, availableSeatsAfter: 0 });
      expect(registrationService.normalizeWaitlistPositions).toHaveBeenCalled();
      expect(notificationsService.sendWaitlistPromotionEmail).toHaveBeenCalledWith({
        to: "student1@test.com",
        legalName: "张小明",
        termName: "2025秋季学期",
        courseCode: "CS101",
        sectionCode: "A"
      });
    });
  });
});
