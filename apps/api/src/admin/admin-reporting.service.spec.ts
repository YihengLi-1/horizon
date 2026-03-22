import { NotFoundException } from "@nestjs/common";
import { AdminReportingService } from "./admin-reporting.service";

function createReportingService() {
  const prisma = {
    user: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    enrollment: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    section: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    meetingTime: { findMany: jest.fn() },
    course: { findMany: jest.fn(), findUnique: jest.fn() },
    term: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    hold: { findMany: jest.fn(), count: jest.fn() },
    studentHold: { count: jest.fn() },
    gradeAppeal: { findMany: jest.fn(), count: jest.fn() },
    prerequisiteWaiverRequest: { findMany: jest.fn(), count: jest.fn() },
    coursePrerequisite: { findMany: jest.fn() },
    calendarEvent: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
    studentNote: { findMany: jest.fn(), create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    auditLog: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
    cartItem: { count: jest.fn() },
    notificationLog: { create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(async (fn: any) => (typeof fn === "function" ? fn(prisma) : Promise.all(fn))),
  } as any;
  const auditService = { log: jest.fn().mockResolvedValue(undefined) } as any;
  const notificationsService = { sendMail: jest.fn().mockResolvedValue(true) } as any;
  const registrationService = {} as any;
  const governanceService = {} as any;
  const mailService = {} as any;
  return {
    service: new AdminReportingService(
      prisma,
      auditService,
      notificationsService,
      registrationService,
      governanceService,
      mailService
    ),
    prisma,
    auditService,
    notificationsService
  };
}

describe("AdminReportingService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSystemAlerts", () => {
    it("返回 waitlist / appeal / hold / near-capacity / not-closed-out 告警", async () => {
      const { service, prisma } = createReportingService();
      prisma.gradeAppeal.count.mockResolvedValueOnce(2);
      prisma.enrollment.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(4);
      prisma.studentHold.count.mockResolvedValue(5);
      prisma.term.findMany
        .mockResolvedValueOnce([{ id: "future-term" }])
        .mockResolvedValueOnce([{ id: "past-term" }]);
      prisma.section.findMany.mockResolvedValue([
        { course: { code: "CS101" }, capacity: 10, _count: { enrollments: 9 } },
        { course: { code: "MATH201" }, capacity: 20, _count: { enrollments: 19 } }
      ]);

      const alerts = await service.getSystemAlerts();

      expect(alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "missing-grades", severity: "error", count: 3 }),
          expect.objectContaining({ id: "grade-appeals", severity: "error", count: 2 }),
          expect.objectContaining({ id: "active-holds", severity: "warning", count: 5 }),
          expect.objectContaining({ id: "near-capacity", severity: "info", count: 2 }),
          expect.objectContaining({ id: "not-closed-out", severity: "warning", count: 4 })
        ])
      );
    });

    it("全部为 0 时返回空数组", async () => {
      const { service, prisma } = createReportingService();
      prisma.gradeAppeal.count.mockResolvedValue(0);
      prisma.enrollment.count.mockResolvedValue(0);
      prisma.studentHold.count.mockResolvedValue(0);
      prisma.term.findMany.mockResolvedValue([]);

      await expect(service.getSystemAlerts()).resolves.toEqual([]);
    });
  });

  describe("getGraduationClearance", () => {
    it("学分达标学生标记为 eligible", async () => {
      const { service, prisma } = createReportingService();
      prisma.user.findMany.mockResolvedValue([
        {
          id: "u1",
          email: "s1@test.com",
          studentProfile: { legalName: "张小明", programMajor: "计算机科学" },
          enrollments: Array.from({ length: 6 }, () => ({ status: "COMPLETED", finalGrade: "A", section: { credits: 3 } }))
        }
      ]);
      prisma.gradeAppeal.findMany.mockResolvedValue([]);

      const result = await service.getGraduationClearance(15);

      expect(result).toEqual([
        expect.objectContaining({ userId: "u1", creditsDone: 18, eligible: true, creditsNeeded: 0 })
      ]);
    });

    it("学分不足学生标记为 ineligible", async () => {
      const { service, prisma } = createReportingService();
      prisma.user.findMany.mockResolvedValue([
        {
          id: "u1",
          email: "s1@test.com",
          studentProfile: { legalName: "李雅文", programMajor: "数学" },
          enrollments: Array.from({ length: 3 }, () => ({ status: "COMPLETED", finalGrade: "B", section: { credits: 3 } }))
        }
      ]);
      prisma.gradeAppeal.findMany.mockResolvedValue([]);

      const [row] = await service.getGraduationClearance(15);
      expect(row).toMatchObject({ creditsDone: 9, creditsNeeded: 6, eligible: false });
    });

    it("无学生时返回空列表", async () => {
      const { service, prisma } = createReportingService();
      prisma.user.findMany.mockResolvedValue([]);
      prisma.gradeAppeal.findMany.mockResolvedValue([]);
      await expect(service.getGraduationClearance(15)).resolves.toEqual([]);
    });
  });

  describe("getEnrollmentAudit", () => {
    it("无过滤返回所有记录和 summary", async () => {
      const { service, prisma } = createReportingService();
      prisma.enrollment.findMany.mockResolvedValue([
        {
          id: "e1",
          status: "ENROLLED",
          finalGrade: null,
          createdAt: new Date("2026-03-01T00:00:00Z"),
          droppedAt: null,
          student: { email: "a@test.com", studentId: "U1" },
          section: { sectionCode: "S1", course: { code: "CS101", title: "导论" }, term: { name: "2025秋" } }
        },
        {
          id: "e2",
          status: "COMPLETED",
          finalGrade: "A",
          createdAt: new Date("2026-03-02T00:00:00Z"),
          droppedAt: null,
          student: { email: "b@test.com", studentId: "U2" },
          section: { sectionCode: "S2", course: { code: "MATH101", title: "微积分" }, term: { name: "2025秋" } }
        },
        {
          id: "e3",
          status: "WAITLISTED",
          finalGrade: null,
          createdAt: new Date("2026-03-03T00:00:00Z"),
          droppedAt: null,
          student: { email: "c@test.com", studentId: null },
          section: { sectionCode: "S3", course: { code: "ENG101", title: "英语" }, term: { name: "2025秋" } }
        }
      ]);

      const result = await service.getEnrollmentAudit();
      expect(result.summary).toMatchObject({ total: 3, enrolled: 1, completed: 1, waitlisted: 1, dropped: 0 });
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].enrolledAt).toBe("2026-03-01");
    });

    it("按 status 过滤传给 Prisma", async () => {
      const { service, prisma } = createReportingService();
      prisma.enrollment.findMany.mockResolvedValue([]);
      await service.getEnrollmentAudit(undefined, "COMPLETED");
      expect(prisma.enrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ status: "COMPLETED" })
      }));
    });

    it("按 termId 过滤传给 Prisma", async () => {
      const { service, prisma } = createReportingService();
      prisma.enrollment.findMany.mockResolvedValue([]);
      await service.getEnrollmentAudit("term-1");
      expect(prisma.enrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ section: { termId: "term-1" } })
      }));
    });
  });

  describe("getPrereqViolations", () => {
    it("无先修要求课程时返回空数组", async () => {
      const { service, prisma } = createReportingService();
      prisma.course.findMany.mockResolvedValue([]);
      await expect(service.getPrereqViolations()).resolves.toEqual([]);
    });

    it("缺少先修课时返回违规记录，已满足时不返回", async () => {
      const { service, prisma } = createReportingService();
      prisma.course.findMany.mockResolvedValue([
        {
          id: "c2",
          code: "CS201",
          title: "数据结构",
          prerequisiteLinks: [{ prerequisiteCourse: { id: "c1", code: "CS101" } }]
        }
      ]);
      prisma.enrollment.findMany
        .mockResolvedValueOnce([
          {
            studentId: "s1",
            status: "ENROLLED",
            student: { email: "s1@test.com", studentProfile: { legalName: "张小明" } },
            section: { term: { name: "2025秋" } }
          },
          {
            studentId: "s2",
            status: "COMPLETED",
            student: { email: "s2@test.com", studentProfile: { legalName: "李雅文" } },
            section: { term: { name: "2025秋" } }
          }
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ section: { course: { code: "CS101" } } }]);

      const result = await service.getPrereqViolations();
      expect(result).toEqual([
        expect.objectContaining({ studentId: "s1", courseCode: "CS201", missingPrereqs: ["CS101"] })
      ]);
    });
  });

  describe("学生备注与标签", () => {
    it("getStudentNotes 返回按时间倒序的备注", async () => {
      const { service, prisma } = createReportingService();
      prisma.studentNote.findMany.mockResolvedValue([{ id: "n1", content: "需要关注" }]);
      await expect(service.getStudentNotes("stu-1")).resolves.toEqual([{ id: "n1", content: "需要关注" }]);
    });

    it("createStudentNote 成功创建备注并记审计", async () => {
      const { service, prisma, auditService } = createReportingService();
      prisma.user.findUnique.mockResolvedValue({ id: "stu-1" });
      prisma.studentNote.create.mockResolvedValue({ id: "note-1", studentId: "stu-1", admin: { email: "admin@test.com" } });

      const result = await service.createStudentNote("admin-1", "stu-1", "<p>关注</p><script>x</script>", "FOLLOW_UP");

      expect(prisma.studentNote.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ content: "<p>关注</p>", flag: "FOLLOW_UP" })
      }));
      expect(auditService.log).toHaveBeenCalled();
      expect(result.id).toBe("note-1");
    });

    it("createStudentNote 学生不存在时抛错", async () => {
      const { service, prisma } = createReportingService();
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.createStudentNote("admin-1", "missing", "内容")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("deleteStudentNote 删除不存在备注时抛错", async () => {
      const { service, prisma } = createReportingService();
      prisma.studentNote.findUnique.mockResolvedValue(null);
      await expect(service.deleteStudentNote("admin-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("deleteStudentNote 成功删除", async () => {
      const { service, prisma, auditService } = createReportingService();
      prisma.studentNote.findUnique.mockResolvedValue({ id: "note-1", studentId: "stu-1" });
      prisma.studentNote.delete.mockResolvedValue({ id: "note-1" });
      await expect(service.deleteStudentNote("admin-1", "note-1")).resolves.toEqual({ deleted: true });
      expect(auditService.log).toHaveBeenCalled();
    });

    it("getStudentTags 在学生不存在时抛错", async () => {
      const { service, prisma } = createReportingService();
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.getStudentTags("missing")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("getStudentTags 返回最新标签", async () => {
      const { service, prisma } = createReportingService();
      prisma.user.findFirst.mockResolvedValue({ id: "stu-1" });
      prisma.auditLog.findFirst.mockResolvedValue({ metadata: { tags: ["预警", "重点关注"] } });
      await expect(service.getStudentTags("stu-1")).resolves.toEqual({ studentId: "stu-1", tags: ["预警", "重点关注"] });
    });

    it("setStudentTags 规范化后写审计", async () => {
      const { service, prisma, auditService } = createReportingService();
      prisma.user.findFirst.mockResolvedValue({ id: "stu-1" });
      await expect(service.setStudentTags("admin-1", "stu-1", [" 预警 ", "重点关注", "预警", ""]))
        .resolves.toEqual({ studentId: "stu-1", tags: ["预警", "重点关注"] });
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
        metadata: { tags: ["预警", "重点关注"] }
      }));
    });

    it("getBulkStudentTags 空数组返回空对象", async () => {
      const { service } = createReportingService();
      await expect(service.getBulkStudentTags([])).resolves.toEqual({});
    });

    it("getBulkStudentTags 返回批量标签映射", async () => {
      const { service, prisma } = createReportingService();
      prisma.$queryRaw.mockResolvedValue([{ entityId: "stu-1", metadata: { tags: ["预警"] } }]);
      await expect(service.getBulkStudentTags(["stu-1", "stu-2"]))
        .resolves.toEqual({ "stu-1": ["预警"], "stu-2": [] });
    });
  });

  describe("日历与搜索", () => {
    it("createCalendarEvent 成功创建事件", async () => {
      const { service, prisma, auditService } = createReportingService();
      prisma.calendarEvent.create.mockResolvedValue({ id: "ev-1", title: "选课开放", term: { id: "t1", name: "2025秋" } });
      const result = await service.createCalendarEvent("admin-1", {
        title: "<b>选课开放</b>",
        eventDate: "2026-03-21T00:00:00.000Z",
        type: "INFO",
        termId: "t1"
      });
      expect(prisma.calendarEvent.create).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
      expect(result.id).toBe("ev-1");
    });

    it("unifiedSearch 空查询返回空结果", async () => {
      const { service, prisma } = createReportingService();
      await expect(service.unifiedSearch("   ")).resolves.toEqual({ students: [], courses: [], sections: [] });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.course.findMany).not.toHaveBeenCalled();
    });

    it("unifiedSearch 按 student 类型只搜用户", async () => {
      const { service, prisma } = createReportingService();
      prisma.user.findMany.mockResolvedValue([{ id: "stu-1", email: "s1@test.com", studentProfile: { legalName: "张小明", programMajor: "计算机科学" } }]);
      await service.unifiedSearch("张", "student");
      expect(prisma.user.findMany).toHaveBeenCalled();
      expect(prisma.course.findMany).not.toHaveBeenCalled();
      expect(prisma.section.findMany).not.toHaveBeenCalled();
    });

    it("unifiedSearch all 返回三类结果", async () => {
      const { service, prisma } = createReportingService();
      prisma.user.findMany.mockResolvedValue([{ id: "stu-1", email: "s1@test.com", studentProfile: { legalName: "张小明", programMajor: "计算机科学" } }]);
      prisma.course.findMany.mockResolvedValue([{ id: "c1", code: "CS101", title: "导论", credits: 3 }]);
      prisma.section.findMany.mockResolvedValue([{ id: "sec-1", sectionCode: "A", instructorName: "张老师", course: { code: "CS101", title: "导论" }, term: { name: "2025秋" }, _count: { enrollments: 5 } }]);
      const result = await service.unifiedSearch("CS", "all");
      expect(result.students).toHaveLength(1);
      expect(result.courses).toHaveLength(1);
      expect(result.sections).toHaveLength(1);
    });

    it("getPrereqMap 返回节点、边和汇总", async () => {
      const { service, prisma } = createReportingService();
      prisma.course.findMany.mockResolvedValue([
        {
          id: "c1",
          code: "CS101",
          title: "导论",
          credits: 3,
          prerequisiteLinks: []
        },
        {
          id: "c2",
          code: "CS201",
          title: "数据结构",
          credits: 3,
          prerequisiteLinks: [
            { prerequisiteCourse: { id: "c1", code: "CS101", title: "导论" } }
          ]
        }
      ]);

      const result = await service.getPrereqMap();
      expect(result.summary).toMatchObject({ totalCourses: 2, coursesWithPrereqs: 1, totalPrereqRelations: 1 });
      expect(result.edges).toEqual([{ from: "c1", to: "c2", fromCode: "CS101", toCode: "CS201" }]);
    });
  });

  describe("listUsers", () => {
    it("空条件返回分页用户列表", async () => {
      const { service, prisma } = createReportingService();
      const createdAt = new Date("2026-03-21T00:00:00Z");
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([
        { id: "u1", email: "u@test.com", studentId: "U1", role: "STUDENT", emailVerifiedAt: null, lastLoginAt: null, loginAttempts: 0, lockedUntil: null, createdAt }
      ]);
      const result = await service.listUsers({ page: 1, limit: 20 });
      expect(result).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        users: [expect.objectContaining({ id: "u1", email: "u@test.com" })]
      });
    });

    it("带 search 和 role 时透传 where 条件", async () => {
      const { service, prisma } = createReportingService();
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);
      await service.listUsers({ page: 2, limit: 10, search: "u25", role: "STUDENT" });
      expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          role: "STUDENT",
          OR: expect.any(Array)
        }),
        skip: 10,
        take: 10
      }));
    });
  });

  describe("状态邮件与系统信息", () => {
    it("previewStatusEmail 汇总唯一学生与样本收件人", async () => {
      const { service, prisma } = createReportingService();
      prisma.enrollment.findMany.mockResolvedValue([
        {
          studentId: "stu-1",
          student: { email: "stu1@test.com", studentProfile: { legalName: "张小明" } },
          section: { course: { code: "CS101", title: "导论" }, term: { name: "2025秋" } }
        },
        {
          studentId: "stu-1",
          student: { email: "stu1@test.com", studentProfile: { legalName: "张小明" } },
          section: { course: { code: "MATH101", title: "微积分" }, term: { name: "2025秋" } }
        }
      ]);

      const result = await service.previewStatusEmail("term-1", "ENROLLED");
      expect(result).toEqual({
        recipientCount: 1,
        enrollmentCount: 2,
        sampleRecipients: [{ email: "stu1@test.com", name: "张小明" }]
      });
    });

    it("sendStatusEmail 向唯一学生发送邮件并写审计", async () => {
      const { service, prisma, notificationsService, auditService } = createReportingService();
      prisma.enrollment.findMany.mockResolvedValue([
        {
          studentId: "stu-1",
          student: { email: "stu1@test.com", studentProfile: { legalName: "张小明" } }
        },
        {
          studentId: "stu-1",
          student: { email: "stu1@test.com", studentProfile: { legalName: "张小明" } }
        },
        {
          studentId: "stu-2",
          student: { email: "stu2@test.com", studentProfile: { legalName: "李雅文" } }
        }
      ]);
      prisma.notificationLog.create.mockResolvedValue({ id: "nl-1" });

      const result = await service.sendStatusEmail("term-1", "ENROLLED", "主题", "正文", "admin-1");

      expect(result).toEqual({ sent: 2, total: 2 });
      expect(notificationsService.sendMail).toHaveBeenCalledTimes(2);
      expect(prisma.notificationLog.create).toHaveBeenCalledTimes(2);
      expect(auditService.log).toHaveBeenCalled();
    });

    it("getRegistrationWindows 返回状态和优先窗口", async () => {
      const { service, prisma } = createReportingService();
      prisma.term.findMany.mockResolvedValue([
        {
          id: "term-1",
          name: "2025秋季学期",
          startDate: new Date("2025-09-01T00:00:00Z"),
          endDate: new Date("2025-12-31T00:00:00Z"),
          registrationOpenAt: new Date("2025-08-01T00:00:00Z"),
          registrationCloseAt: new Date("2025-08-31T00:00:00Z")
        }
      ]);

      const [row] = await service.getRegistrationWindows();
      expect(row).toMatchObject({
        id: "term-1",
        name: "2025秋季学期"
      });
      expect(row.status).toBeDefined();
      expect(row.priorityWindows.some((item: string) => item.includes("大四"))).toBe(true);
    });

    it("getSystemHealth 返回数据库状态与当前学期摘要", async () => {
      const { service, prisma } = createReportingService();
      prisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
      prisma.term.findFirst
        .mockResolvedValueOnce({ id: "term-1", name: "2025秋季学期" });
      prisma.user.count.mockResolvedValue(5);
      prisma.enrollment.count.mockResolvedValue(42);
      prisma.auditLog.count.mockResolvedValue(1);

      const result = await service.getSystemHealth();
      expect(result).toMatchObject({
        dbOk: true,
        totalStudents: 5,
        totalEnrollments: 42,
        activeTermName: "2025秋季学期",
        recentErrors: 1
      });
    });
  });

  describe("中段统计方法", () => {
    it("getRegistrationHeatmap 生成 7x24 网格与热点时段", async () => {
      const { service, prisma } = createReportingService();
      prisma.$queryRaw.mockResolvedValue([
        { dow: 1, hour: 9, count: BigInt(5) },
        { dow: 1, hour: 10, count: BigInt(3) },
        { dow: 2, hour: 14, count: BigInt(7) }
      ]);

      const result = await service.getRegistrationHeatmap("term-1");
      expect(result.grid).toHaveLength(7);
      expect(result.grid[1][9]).toBe(5);
      expect(result.maxCount).toBe(7);
      expect(result.totalRegistrations).toBe(15);
      expect(result.topSlots[0]).toEqual({ day: "Tue", hour: 14, count: 7 });
    });

    it("getCreditLoadDistribution 统计学生负载分布", async () => {
      const { service, prisma } = createReportingService();
      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: "s1", section: { course: { credits: 3 } } },
        { studentId: "s1", section: { course: { credits: 3 } } },
        { studentId: "s2", section: { course: { credits: 12 } } },
        { studentId: "s3", section: { course: { credits: 19 } } }
      ]);

      const result = await service.getCreditLoadDistribution("term-1");
      expect(result.totalStudents).toBe(3);
      expect(result.mean).toBeCloseTo((6 + 12 + 19) / 3, 1);
      expect(result.distribution).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: "< 9", count: 1 }),
          expect.objectContaining({ label: "12–15", count: 1 }),
          expect.objectContaining({ label: "> 18", count: 1 })
        ])
      );
    });

    it("getGradeDistribution 缺参数时返回空结构", async () => {
      const { service } = createReportingService();
      await expect(service.getGradeDistribution(undefined, undefined)).resolves.toEqual({
        courseCode: "",
        courseTitle: "",
        termName: "",
        gradeBreakdown: [],
        meanGpa: 0,
        passRate: 0
      });
    });

    it("getGradeDistribution 返回成绩分布和均值", async () => {
      const { service, prisma } = createReportingService();
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { grade: "A", count: 2 },
          { grade: "B+", count: 1 }
        ])
        .mockResolvedValueOnce([
          { courseCode: "CS101", courseTitle: "导论", termName: "2025秋", meanGpa: 3.8, passRate: 100 }
        ]);

      const result = await service.getGradeDistribution("term-1", "course-1");
      expect(result).toEqual({
        courseCode: "CS101",
        courseTitle: "导论",
        termName: "2025秋",
        gradeBreakdown: [
          { grade: "A", count: 2 },
          { grade: "B+", count: 1 }
        ],
        meanGpa: 3.8,
        passRate: 100
      });
    });

    it("getDropoutRisk 只返回风险分数达到阈值的学生", async () => {
      const { service, prisma } = createReportingService();
      prisma.$queryRaw.mockResolvedValue([
        { userId: "s1", name: "张小明", email: "s1@test.com", programMajor: "计算机科学", dropCount: 2, gpa: 1.8, enrolledCredits: 0, riskScore: 100 },
        { userId: "s2", name: "李雅文", email: "s2@test.com", programMajor: "数学", dropCount: 0, gpa: 3.6, enrolledCredits: 12, riskScore: 10 }
      ]);

      const result = await service.getDropoutRisk();
      expect(result).toEqual([
        {
          userId: "s1",
          name: "张小明",
          email: "s1@test.com",
          programMajor: "计算机科学",
          dropCount: 2,
          gpa: 1.8,
          enrolledCredits: 0,
          riskScore: 100
        }
      ]);
    });

    it("getSectionAnalytics 汇总教学班成绩和时间线", async () => {
      const { service, prisma } = createReportingService();
      jest.spyOn(service, "getSectionEnrollmentTimeline").mockResolvedValue({
        sectionId: "sec-1",
        points: [{ day: 0, date: "2026-03-01", enrolled: 10, waitlisted: 2 }]
      } as any);
      prisma.section.findUnique.mockResolvedValue({
        id: "sec-1",
        sectionCode: "A",
        capacity: 40,
        course: { code: "CS101", title: "计算机科学导论" },
        term: { name: "2025秋季学期" },
        enrollments: [
          { status: "ENROLLED", finalGrade: null },
          { status: "WAITLISTED", finalGrade: null },
          { status: "DROPPED", finalGrade: "W" },
          { status: "COMPLETED", finalGrade: "A" }
        ]
      });
      prisma.$queryRaw
        .mockResolvedValueOnce([{ grade: "A", count: 1 }, { grade: "W", count: 1 }])
        .mockResolvedValueOnce([{ avgGpa: 4 }]);

      const result = await service.getSectionAnalytics("sec-1");
      expect(result).toMatchObject({
        sectionId: "sec-1",
        courseCode: "CS101",
        enrolled: 1,
        waitlisted: 1,
        dropCount: 1,
        avgGpa: 4
      });
      expect(result.gradeBreakdown).toEqual([{ grade: "A", count: 1 }, { grade: "W", count: 1 }]);
      expect(result.enrollmentTimeline).toEqual([{ day: 0, date: "2026-03-01", enrolled: 10, waitlisted: 2 }]);
    });

    it("getFacultySchedule 聚合同一教师的教学班并挂上上课时间", async () => {
      const { service, prisma } = createReportingService();
      prisma.$queryRaw.mockResolvedValue([
        {
          instructorId: "fac-1",
          instructorName: "王老师",
          email: "faculty@test.com",
          sectionId: "sec-1",
          sectionCode: "A",
          courseCode: "CS101",
          courseTitle: "导论",
          capacity: 40,
          enrolled: BigInt(30),
          waitlisted: BigInt(2)
        },
        {
          instructorId: "fac-1",
          instructorName: "王老师",
          email: "faculty@test.com",
          sectionId: "sec-2",
          sectionCode: "B",
          courseCode: "CS201",
          courseTitle: "数据结构",
          capacity: 35,
          enrolled: BigInt(28),
          waitlisted: BigInt(1)
        }
      ]);
      prisma.meetingTime.findMany.mockResolvedValue([
        { sectionId: "sec-1", weekday: 1, startMinutes: 540, endMinutes: 630 },
        { sectionId: "sec-2", weekday: 3, startMinutes: 600, endMinutes: 690 }
      ]);

      const result = await service.getFacultySchedule("term-1");

      expect(prisma.meetingTime.findMany).toHaveBeenCalledWith({
        where: { sectionId: { in: ["sec-1", "sec-2"] } },
        select: {
          sectionId: true,
          weekday: true,
          startMinutes: true,
          endMinutes: true
        },
        orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }]
      });
      expect(result).toEqual([
        {
          instructorId: "fac-1",
          instructorName: "王老师",
          email: "faculty@test.com",
          totalSections: 2,
          totalEnrolled: 58,
          totalCapacity: 75,
          sections: [
            {
              sectionId: "sec-1",
              sectionCode: "A",
              courseCode: "CS101",
              courseTitle: "导论",
              capacity: 40,
              enrolled: 30,
              waitlisted: 2,
              meetingTimes: [{ weekday: 1, startMinutes: 540, endMinutes: 630 }]
            },
            {
              sectionId: "sec-2",
              sectionCode: "B",
              courseCode: "CS201",
              courseTitle: "数据结构",
              capacity: 35,
              enrolled: 28,
              waitlisted: 1,
              meetingTimes: [{ weekday: 3, startMinutes: 600, endMinutes: 690 }]
            }
          ]
        }
      ]);
    });

    it("getFacultySchedule 无教学班时直接返回空数组", async () => {
      const { service, prisma } = createReportingService();
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(service.getFacultySchedule()).resolves.toEqual([]);
      expect(prisma.meetingTime.findMany).not.toHaveBeenCalled();
    });

    it("getCapacityPlan 返回数值化后的容量规划结果", async () => {
      const { service, prisma } = createReportingService();
      prisma.$queryRaw.mockResolvedValue([
        {
          sectionId: "sec-1",
          courseCode: "CS101",
          courseTitle: "导论",
          sectionCode: "A",
          capacity: BigInt(40),
          enrolled: BigInt(38),
          waitlisted: BigInt(5),
          utilizationPct: 95.5,
          projectedDemand: 43
        }
      ]);

      await expect(service.getCapacityPlan("term-1")).resolves.toEqual([
        {
          sectionId: "sec-1",
          courseCode: "CS101",
          courseTitle: "导论",
          sectionCode: "A",
          capacity: 40,
          enrolled: 38,
          waitlisted: 5,
          utilizationPct: 95.5,
          projectedDemand: 43
        }
      ]);
    });

    it("getStudentProgress 返回映射后的学生进度列表", async () => {
      const { service, prisma } = createReportingService();
      prisma.$queryRaw.mockResolvedValue([
        {
          userId: "stu-1",
          name: "张小明",
          email: "stu1@test.com",
          dept: "计算机科学",
          creditsCompleted: BigInt(24),
          creditsEnrolled: BigInt(12),
          gpa: 3.45,
          enrollmentStatus: "Active"
        },
        {
          userId: "stu-2",
          name: "李雅文",
          email: "stu2@test.com",
          dept: "数学",
          creditsCompleted: BigInt(6),
          creditsEnrolled: BigInt(0),
          gpa: 1.95,
          enrollmentStatus: "AtRisk"
        }
      ]);

      await expect(service.getStudentProgress("term-1", "计算机科学")).resolves.toEqual([
        {
          userId: "stu-1",
          name: "张小明",
          email: "stu1@test.com",
          dept: "计算机科学",
          creditsCompleted: 24,
          creditsEnrolled: 12,
          gpa: 3.45,
          enrollmentStatus: "Active"
        },
        {
          userId: "stu-2",
          name: "李雅文",
          email: "stu2@test.com",
          dept: "数学",
          creditsCompleted: 6,
          creditsEnrolled: 0,
          gpa: 1.95,
          enrollmentStatus: "AtRisk"
        }
      ]);
    });

    it("getCourseDemandComparison 按课程聚合跨学期需求", async () => {
      const { service, prisma } = createReportingService();
      prisma.$queryRaw.mockResolvedValue([
        {
          courseId: "course-1",
          courseCode: "CS101",
          courseTitle: "导论",
          credits: 3,
          termId: "term-1",
          termName: "2025秋",
          termStart: new Date("2025-09-01T00:00:00Z"),
          enrolled: BigInt(30),
          completed: BigInt(5),
          dropped: BigInt(2),
          waitlisted: BigInt(4),
          capacity: BigInt(40)
        },
        {
          courseId: "course-1",
          courseCode: "CS101",
          courseTitle: "导论",
          credits: 3,
          termId: "term-2",
          termName: "2026春",
          termStart: new Date("2026-02-01T00:00:00Z"),
          enrolled: BigInt(25),
          completed: BigInt(3),
          dropped: BigInt(1),
          waitlisted: BigInt(0),
          capacity: BigInt(35)
        }
      ]);

      await expect(service.getCourseDemandComparison("course-1")).resolves.toEqual([
        {
          courseId: "course-1",
          courseCode: "CS101",
          courseTitle: "导论",
          credits: 3,
          terms: [
            {
              termId: "term-1",
              termName: "2025秋",
              enrolled: 30,
              completed: 5,
              dropped: 2,
              waitlisted: 4,
              capacity: 40,
              total: 41
            },
            {
              termId: "term-2",
              termName: "2026春",
              enrolled: 25,
              completed: 3,
              dropped: 1,
              waitlisted: 0,
              capacity: 35,
              total: 29
            }
          ]
        }
      ]);
    });

    it("getWaitlistAnalytics 统计教学班和专业维度候补概况", async () => {
      const { service, prisma } = createReportingService();
      prisma.$queryRaw.mockResolvedValue([
        {
          enrollmentId: "e1",
          studentId: "stu-1",
          sectionId: "sec-1",
          sectionCode: "A",
          courseCode: "CS101",
          courseTitle: "导论",
          termName: "2025秋",
          capacity: 40,
          enrolledCount: BigInt(40),
          waitlistPosition: 1,
          programMajor: "计算机科学"
        },
        {
          enrollmentId: "e2",
          studentId: "stu-2",
          sectionId: "sec-1",
          sectionCode: "A",
          courseCode: "CS101",
          courseTitle: "导论",
          termName: "2025秋",
          capacity: 40,
          enrolledCount: BigInt(40),
          waitlistPosition: 2,
          programMajor: "计算机科学"
        },
        {
          enrollmentId: "e3",
          studentId: "stu-3",
          sectionId: "sec-2",
          sectionCode: "B",
          courseCode: "MATH101",
          courseTitle: "微积分",
          termName: "2025秋",
          capacity: 35,
          enrolledCount: BigInt(30),
          waitlistPosition: 1,
          programMajor: null
        }
      ]);

      const result = await service.getWaitlistAnalytics("term-1");
      expect(result).toMatchObject({
        totalWaitlisted: 3,
        uniqueStudents: 3,
        sectionsWithWaitlist: 2
      });
      expect(result.sections[0]).toMatchObject({
        sectionId: "sec-1",
        waitlistCount: 2,
        avgPosition: 2,
        maxPosition: 2,
        utilizationPct: 100
      });
      expect(result.byDept).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ dept: "计算机科学", waitlistCount: 2, sectionsAffected: 1 }),
          expect.objectContaining({ dept: "Unknown", waitlistCount: 1, sectionsAffected: 1 })
        ])
      );
    });

    it("getCourseOfferingHistory 汇总课程历次开课情况", async () => {
      const { service, prisma } = createReportingService();
      prisma.$queryRaw.mockResolvedValue([
        {
          sid: "sec-1",
          sectionCode: "A",
          instructorName: "王老师",
          capacity: 40,
          courseId: "course-1",
          courseCode: "CS101",
          courseTitle: "导论",
          credits: 3,
          termId: "term-1",
          termName: "2025秋",
          termEndDate: new Date("2025-12-31T00:00:00Z"),
          enrolledCount: BigInt(32),
          avgRating: 4.25
        },
        {
          sid: "sec-2",
          sectionCode: "B",
          instructorName: "李老师",
          capacity: 35,
          courseId: "course-1",
          courseCode: "CS101",
          courseTitle: "导论",
          credits: 3,
          termId: "term-2",
          termName: "2026春",
          termEndDate: new Date("2026-05-31T00:00:00Z"),
          enrolledCount: BigInt(28),
          avgRating: null
        }
      ]);

      const [result] = await service.getCourseOfferingHistory("course-1");
      expect(result).toMatchObject({
        courseId: "course-1",
        courseCode: "CS101",
        termCount: 2,
        avgUtilization: 80
      });
      expect(result.offerings[0]).toMatchObject({
        sectionId: "sec-1",
        enrolled: 32,
        utilizationPct: 80,
        avgRating: 4.3
      });
    });
  });
});
