import { ForbiddenException, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { StudentsService } from "./students.service";

function createStudentsService() {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn()
    },
    enrollment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      groupBy: jest.fn()
    },
    cartItem: {
      findMany: jest.fn()
    },
    notificationLog: {
      create: jest.fn((args) => Promise.resolve(args))
    },
    scheduleSnapshot: {
      create: jest.fn(),
      findUnique: jest.fn()
    },
    section: {
      findMany: jest.fn(),
      findUnique: jest.fn()
    },
    term: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn()
    },
    gradeAppeal: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn()
    },
    announcement: {
      findMany: jest.fn()
    },
    courseRating: {
      findMany: jest.fn(),
      upsert: jest.fn()
    },
    degreeProgram: {
      findUnique: jest.fn()
    },
    studentProfile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn()
    },
    studentHold: {
      count: jest.fn()
    },
    advisorAssignment: {
      findMany: jest.fn()
    },
    advisorNote: {
      findMany: jest.fn()
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (opsOrFn: Array<Promise<unknown>> | ((tx: unknown) => unknown)) => {
      if (typeof opsOrFn === "function") return opsOrFn(prisma);
      return Promise.all(opsOrFn);
    })
  } as any;

  const auditService = {
    log: jest.fn().mockResolvedValue(undefined)
  } as any;

  const governanceService = {
    listMyAcademicRequests: jest.fn(),
    submitPrereqOverrideRequest: jest.fn()
  } as any;

  return {
    prisma,
    auditService,
    governanceService,
    service: new StudentsService(prisma, auditService, governanceService)
  };
}

describe("StudentsService", () => {
  const originalTimezone = process.env.SIS_TIMEZONE;
  const originalShareFlag = process.env.ENABLE_PUBLIC_SCHEDULE_SHARING;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SIS_TIMEZONE;
    delete process.env.ENABLE_PUBLIC_SCHEDULE_SHARING;
  });

  afterAll(() => {
    process.env.SIS_TIMEZONE = originalTimezone;
    process.env.ENABLE_PUBLIC_SCHEDULE_SHARING = originalShareFlag;
  });

  it("getMyProfile 返回用户基本信息和 studentProfile", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({
      id: "student-1",
      email: "student@univ.edu",
      studentId: "U250001",
      role: "STUDENT",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-02T00:00:00Z"),
      studentProfile: {
        legalName: "张小明",
        programMajor: "计算机科学与技术"
      },
      enrollments: [
        {
          id: "enr-1",
          createdAt: new Date("2025-09-01T00:00:00Z"),
          status: "COMPLETED",
          finalGrade: "A",
          waitlistPosition: null,
          section: {
            credits: 3,
            sectionCode: "CS101-A",
            course: { id: "course-1", code: "CS101", title: "计算机科学导论" },
            term: { id: "term-1", name: "2025年秋季学期", endDate: new Date("2025-12-31T00:00:00Z") }
          }
        }
      ]
    });

    const result = await service.getMyProfile("student-1");

    expect(result.user.email).toBe("student@univ.edu");
    expect(result.gpa).toBe(4);
    expect(result.completedCredits).toBe(3);
    expect(result.academicStanding).toBe("Dean's List");
  });

  it("getMyProfile 用户不存在时抛 NotFoundException", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.getMyProfile("missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("getNotifications throws explicit error instead of returning an empty list", async () => {
    const { prisma, service } = createStudentsService();
    prisma.enrollment.findMany.mockRejectedValue(new Error("db down"));

    await expect(service.getNotifications("student-1")).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it("getTranscript 按学期分组返回成绩并计算 GPA", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.enrollment.findMany.mockResolvedValue([
      {
        termId: "term-1",
        term: { id: "term-1", name: "2024年秋季学期", startDate: new Date("2024-09-01T00:00:00Z") },
        finalGrade: "A",
        section: { credits: 3, course: { code: "CS101", title: "导论" } }
      },
      {
        termId: "term-1",
        term: { id: "term-1", name: "2024年秋季学期", startDate: new Date("2024-09-01T00:00:00Z") },
        finalGrade: "B",
        section: { credits: 3, course: { code: "MATH101", title: "微积分" } }
      },
      {
        termId: "term-2",
        term: { id: "term-2", name: "2025年春季学期", startDate: new Date("2025-02-01T00:00:00Z") },
        finalGrade: "A",
        section: { credits: 3, course: { code: "CS201", title: "数据结构" } }
      },
      {
        termId: "term-2",
        term: { id: "term-2", name: "2025年春季学期", startDate: new Date("2025-02-01T00:00:00Z") },
        finalGrade: "B",
        section: { credits: 3, course: { code: "ENG201", title: "学术写作" } }
      }
    ]);

    const result = await service.getTranscript("student-1");

    expect(result).toHaveLength(2);
    expect(result[0].termName).toBe("2025年春季学期");
    expect(result[1].semesterGpa).toBe(3.5);
    expect(result[0].cumulativeGpa).toBe(3.5);
  });

  it("getTranscript 无成绩时返回空数组", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.enrollment.findMany.mockResolvedValue([]);

    await expect(service.getTranscript("student-1")).resolves.toEqual([]);
  });

  it("getTranscript throws explicit error instead of returning an empty list", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.enrollment.findMany.mockRejectedValue(new Error("db down"));

    await expect(service.getTranscript("student-1")).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it("getGpaStats 返回均值、中位数和百分位", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findMany.mockResolvedValue([
      { id: "student-1", enrollments: [{ finalGrade: "A", section: { credits: 3 } }] },
      { id: "student-2", enrollments: [{ finalGrade: "B", section: { credits: 3 } }] },
      { id: "student-3", enrollments: [{ finalGrade: "C", section: { credits: 3 } }] }
    ]);

    const result = await service.getGpaStats("student-1");

    expect(result.myGpa).toBe(4);
    expect(result.count).toBe(3);
    expect(result.mean).toBe(3);
    expect(result.median).toBe(3);
    expect(result.percentile).toBe(67);
  });

  it("getAnnouncements 按角色过滤受众", async () => {
    const { prisma, service } = createStudentsService();
    prisma.announcement.findMany.mockResolvedValue([{ id: "a1" }]);

    await service.getAnnouncements("ADMIN");

    expect(prisma.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ audience: { in: ["ALL", "ADMIN"] } })
      })
    );
  });

  it("getPublicAnnouncements 在指定 audience 时附加过滤", async () => {
    const { prisma, service } = createStudentsService();
    prisma.announcement.findMany.mockResolvedValue([]);

    await service.getPublicAnnouncements("student");

    expect(prisma.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ audience: { in: ["STUDENT", "ALL"] } })
      })
    );
  });

  it("generateIcal uses configured institution timezone", async () => {
    const { prisma, service } = createStudentsService();
    process.env.SIS_TIMEZONE = "America/New_York";
    prisma.enrollment.findMany.mockResolvedValue([
      {
        id: "enrollment-1",
        term: {
          startDate: new Date("2026-09-01T00:00:00Z"),
          endDate: new Date("2026-12-20T00:00:00Z")
        },
        section: {
          location: "Room 101",
          instructorName: "Staff",
          course: { code: "CS101", title: "Intro" },
          meetingTimes: [{ id: "mt-1", weekday: 1, startMinutes: 540, endMinutes: 600 }]
        }
      }
    ]);

    const ical = await service.generateIcal("student-1", "term-1");

    expect(ical).toContain("DTSTART;TZID=America/New_York");
    expect(ical).toContain("BEGIN:VCALENDAR");
  });

  it("getEnrollmentReceipt 返回学期注册收据", async () => {
    const { prisma, service } = createStudentsService();
    prisma.term.findUnique.mockResolvedValue({
      id: "term-1",
      name: "2025年秋季学期",
      startDate: new Date("2025-09-01T00:00:00Z"),
      endDate: new Date("2025-12-20T00:00:00Z")
    });
    prisma.enrollment.findMany.mockResolvedValue([
      {
        id: "enr-1",
        section: {
          sectionCode: "CS101-A",
          instructorName: "张伟明",
          course: { code: "CS101", title: "计算机科学导论", credits: 3 },
          meetingTimes: [{ weekday: 1, startMinutes: 480, endMinutes: 540 }]
        }
      }
    ]);

    const result = await service.getEnrollmentReceipt("student-1", "term-1");

    expect(result.term?.name).toBe("2025年秋季学期");
    expect(result.totalCredits).toBe(3);
    expect(result.items[0].courseCode).toBe("CS101");
  });

  it("createScheduleSnapshot is disabled unless explicitly enabled", async () => {
    const { service } = createStudentsService();

    await expect(service.createScheduleSnapshot("student-1", "term-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("submitContactMessage routes support requests to admin recipients", async () => {
    const { prisma, auditService, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({
      id: "student-1",
      email: "student@sis.edu"
    });
    prisma.user.findMany.mockResolvedValue([{ id: "admin-1", email: "admin@sis.edu" }]);

    const result = await service.submitContactMessage("student-1", {
      subject: "Registration hold",
      message: "Need review",
      category: "registration"
    });

    expect(result).toEqual({ ok: true, routedToAdmins: 1 });
    expect(prisma.notificationLog.create).toHaveBeenCalledTimes(2);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "student_support_request", entityType: "support_request" })
    );
  });

  it("getProfileCompleteness 统计缺失字段", async () => {
    const { prisma, service } = createStudentsService();
    prisma.studentProfile.findUnique.mockResolvedValue({
      legalName: "张小明",
      programMajor: "",
      dob: null,
      address: "上海市",
      emergencyContact: ""
    });

    const result = await service.getProfileCompleteness("student-1");

    expect(result.score).toBe(40);
    expect(result.missing).toEqual(["专业", "出生日期", "紧急联系人"]);
  });

  it("updateStudentProfile 会 upsert 并写审计日志", async () => {
    const { prisma, auditService, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({
      id: "student-1",
      email: "student@univ.edu",
      studentProfile: null
    });
    prisma.studentProfile.upsert.mockResolvedValue({
      id: "profile-1",
      legalName: "张小明",
      programMajor: "计算机科学与技术"
    });

    const result = await service.updateStudentProfile("student-1", {
      legalName: "张小明",
      programMajor: "计算机科学与技术"
    } as never);

    expect(result.id).toBe("profile-1");
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PROFILE_UPDATE", entityId: "profile-1" })
    );
  });

  it("adminListStudents 无分页时返回 GPA 列表", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findMany.mockResolvedValue([
      {
        id: "student-1",
        email: "student1@univ.edu",
        enrollments: [{ finalGrade: "A", section: { credits: 3 } }]
      }
    ]);

    const result = await service.adminListStudents();

    expect(Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) throw new Error("expected array result");
    expect(result[0].gpa).toBe(4);
  });

  it("adminListStudents 分页模式返回 items + totalPages", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findMany.mockResolvedValue([
      {
        id: "student-1",
        email: "student1@univ.edu",
        enrollments: [{ finalGrade: "B", section: { credits: 3 } }]
      }
    ]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.adminListStudents({ page: 1, pageSize: 10, search: "student1" });

    if (Array.isArray(result)) throw new Error("expected paginated result");
    expect(result.items).toHaveLength(1);
    expect(result.totalPages).toBe(1);
    expect(result.items[0].gpa).toBe(3);
  });

  it("submitGradeAppeal 成功创建申诉记录", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    prisma.enrollment.findFirst.mockResolvedValue({ id: "enr-1", studentId: "student-1", status: "COMPLETED" });
    prisma.gradeAppeal.findFirst.mockResolvedValue(null);
    prisma.gradeAppeal.create.mockResolvedValue({ id: "appeal-1", status: "PENDING" });

    const result = await service.submitGradeAppeal("student-1", {
      enrollmentId: "enr-1",
      contestedGrade: "B",
      requestedGrade: "A",
      reason: "成绩录入有误"
    });

    expect(result).toEqual({ id: "appeal-1", status: "PENDING" });
    expect(prisma.gradeAppeal.create).toHaveBeenCalled();
  });

  it("submitGradeAppeal 同一课程已有待处理申诉时返回错误对象", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    prisma.enrollment.findFirst.mockResolvedValue({ id: "enr-1", studentId: "student-1", status: "COMPLETED" });
    prisma.gradeAppeal.findFirst.mockResolvedValue({ id: "appeal-1", status: "PENDING" });

    await expect(
      service.submitGradeAppeal("student-1", {
        enrollmentId: "enr-1",
        contestedGrade: "B",
        requestedGrade: "A",
        reason: "成绩录入有误"
      })
    ).resolves.toEqual({ error: "A pending appeal already exists for this enrollment" });
  });

  it("submitGradeAppeal enrollment 不存在时抛异常", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    prisma.enrollment.findFirst.mockResolvedValue(null);

    await expect(
      service.submitGradeAppeal("student-1", {
        enrollmentId: "missing",
        contestedGrade: "B",
        reason: "成绩录入有误"
      } as never)
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("getCompletedCourseCodes 会排除 F 和 W", async () => {
    const { prisma, service } = createStudentsService();
    prisma.enrollment.findMany.mockResolvedValue([
      { finalGrade: "A", section: { course: { code: "CS101" } } },
      { finalGrade: "F", section: { course: { code: "CS102" } } },
      { finalGrade: "W", section: { course: { code: "CS103" } } }
    ]);

    await expect(service.getCompletedCourseCodes("student-1")).resolves.toEqual(["CS101"]);
  });

  it("getMyAdvisor 返回导师分配和公开备注", async () => {
    const { prisma, service } = createStudentsService();
    prisma.advisorAssignment.findMany.mockResolvedValue([{ id: "assign-1" }]);
    prisma.advisorNote.findMany.mockResolvedValue([{ id: "note-1" }]);

    const result = await service.getMyAdvisor("student-1");

    expect(result.assignments).toHaveLength(1);
    expect(result.advisorNotes).toHaveLength(1);
  });

  it("getAcademicStanding GPA >= 3.5 返回 DEAN_LIST", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findUnique.mockResolvedValue({
      id: "student-1",
      email: "student@univ.edu",
      studentProfile: { programMajor: "计算机科学与技术", enrollmentStatus: "ACTIVE" },
      enrollments: [
        {
          finalGrade: "A",
          section: { course: { credits: 3, code: "CS101", title: "导论" }, term: { id: "term-1", name: "2024秋" } }
        },
        {
          finalGrade: "A-",
          section: { course: { credits: 3, code: "MATH101", title: "微积分" }, term: { id: "term-1", name: "2024秋" } }
        }
      ]
    });

    const result = await service.getAcademicStanding("student-1");

    expect(result.standing).toBe("DEAN_LIST");
    expect(result.cumulativeGpa).toBe(3.85);
  });

  it("getAcademicStanding GPA < 2.0 返回 ACADEMIC_PROBATION", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findUnique.mockResolvedValue({
      id: "student-1",
      email: "student@univ.edu",
      studentProfile: { programMajor: "数学与应用数学", enrollmentStatus: "ACTIVE" },
      enrollments: [
        {
          finalGrade: "D",
          section: { course: { credits: 3, code: "CS101", title: "导论" }, term: { id: "term-1", name: "2024秋" } }
        },
        {
          finalGrade: "C",
          section: { course: { credits: 3, code: "MATH101", title: "微积分" }, term: { id: "term-1", name: "2024秋" } }
        }
      ]
    });

    const result = await service.getAcademicStanding("student-1");

    expect(result.standing).toBe("ACADEMIC_PROBATION");
  });

  it("getAcademicStanding 无成绩时返回 UNKNOWN", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findUnique.mockResolvedValue({
      id: "student-1",
      email: "student@univ.edu",
      studentProfile: null,
      enrollments: []
    });

    const result = await service.getAcademicStanding("student-1");

    expect(result.standing).toBe("UNKNOWN");
    expect(result.termHistory).toEqual([]);
  });

  it("getCourseHistory 按学期分组并计算 summary", async () => {
    const { prisma, service } = createStudentsService();
    prisma.enrollment.findMany.mockResolvedValue([
      {
        id: "enr-1",
        status: "COMPLETED",
        finalGrade: "A",
        createdAt: new Date("2025-01-01T00:00:00Z"),
        updatedAt: new Date("2025-01-02T00:00:00Z"),
        section: {
          sectionCode: "CS101-A",
          instructorName: "张伟明",
          course: { id: "course-1", code: "CS101", title: "导论", credits: 3 },
          term: { id: "term-1", name: "2024秋" }
        }
      },
      {
        id: "enr-2",
        status: "DROPPED",
        finalGrade: null,
        createdAt: new Date("2025-02-01T00:00:00Z"),
        updatedAt: new Date("2025-02-02T00:00:00Z"),
        section: {
          sectionCode: "MATH101-A",
          instructorName: "李晓华",
          course: { id: "course-2", code: "MATH101", title: "微积分", credits: 4 },
          term: { id: "term-2", name: "2025春" }
        }
      }
    ]);

    const result = await service.getCourseHistory("student-1");

    expect(result.terms).toHaveLength(2);
    expect(result.summary.completedCourses).toBe(1);
    expect(result.summary.droppedCourses).toBe(1);
    expect(result.summary.cumulativeGpa).toBe(4);
  });

  it("getGraduationChecklist 计算毕业检查项", async () => {
    const { prisma, service } = createStudentsService();
    prisma.enrollment.findMany.mockResolvedValue([
      { finalGrade: "A", section: { credits: 60, course: { code: "CS101" } } },
      { finalGrade: "B", section: { credits: 60, course: { code: "CS201" } } }
    ]);
    prisma.studentHold.count.mockResolvedValue(0);

    const result = await service.getGraduationChecklist("student-1");

    expect(result.allPassed).toBe(true);
    expect(result.summary.totalCredits).toBe(120);
    expect(result.checks).toHaveLength(4);
  });

  it("getTermCompare 会把 SQL 结果映射成 number", async () => {
    const { prisma, service } = createStudentsService();
    prisma.$queryRaw.mockResolvedValue([
      {
        termId: "term-1",
        termName: "2024秋",
        termStartDate: new Date("2024-09-01T00:00:00Z"),
        credits: 15,
        courseCount: 5,
        gpa: 3.5,
        passRate: 100
      }
    ]);

    const result = await service.getTermCompare("student-1");

    expect(result[0]).toEqual(
      expect.objectContaining({ termId: "term-1", credits: 15, courseCount: 5, gpa: 3.5, passRate: 100 })
    );
  });

  it("getStudentHonors 会汇总学期荣誉和累计荣誉", async () => {
    const { prisma, service } = createStudentsService();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ termName: "2024秋", awardedAt: new Date("2024-12-20T00:00:00Z"), gpa: 3.8 }])
      .mockResolvedValueOnce([{ totalCredits: 65, setbacks: 0, latestAwardedAt: new Date("2024-12-20T00:00:00Z") }]);

    const result = await service.getStudentHonors("student-1");

    expect(result.honors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "荣誉院长名单" }),
        expect.objectContaining({ type: "学业优秀" }),
        expect.objectContaining({ type: "全勤学者" })
      ])
    );
  });

  it("getEnrollmentLog 返回格式化后的日志列表", async () => {
    const { prisma, service } = createStudentsService();
    prisma.$queryRaw.mockResolvedValue([
      {
        auditId: "audit-1",
        createdAt: new Date("2025-09-01T00:00:00Z"),
        action: "ENROLL_SUBMIT",
        courseCode: "CS101",
        courseTitle: "计算机科学导论",
        sectionCode: "CS101-A",
        termName: "2025年秋季学期"
      }
    ]);

    const result = await service.getEnrollmentLog("student-1");

    expect(result).toEqual([
      expect.objectContaining({ auditId: "audit-1", courseCode: "CS101", termName: "2025年秋季学期" })
    ]);
  });

  it("listMyPrereqWaivers 仅返回先修豁免请求", async () => {
    const { governanceService, service } = createStudentsService();
    governanceService.listMyAcademicRequests.mockResolvedValue([
      { id: "1", type: "PREREQ_OVERRIDE" },
      { id: "2", type: "GRADE_APPEAL" }
    ]);

    await expect(service.listMyPrereqWaivers("student-1")).resolves.toEqual([{ id: "1", type: "PREREQ_OVERRIDE" }]);
  });

  it("submitPrereqWaiverRequest 透传治理服务结果", async () => {
    const { governanceService, service } = createStudentsService();
    governanceService.submitPrereqOverrideRequest.mockResolvedValue({ id: "req-1", status: "PENDING" });

    await expect(
      service.submitPrereqWaiverRequest("student-1", { sectionId: "section-1", reason: "有相关基础" })
    ).resolves.toEqual({ id: "req-1", status: "PENDING" });
  });

  it("getMyProfile 低 GPA 时 academicStanding 返回 Good Standing", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({
      id: "student-2",
      email: "student2@univ.edu",
      studentId: "U250002",
      role: "STUDENT",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-02T00:00:00Z"),
      studentProfile: { legalName: "王五", programMajor: "经济学" },
      enrollments: [
        {
          id: "enr-a",
          createdAt: new Date("2025-09-01T00:00:00Z"),
          status: "COMPLETED",
          finalGrade: "C",
          waitlistPosition: null,
          section: {
            credits: 3,
            sectionCode: "ECON101-A",
            course: { id: "course-e1", code: "ECON101", title: "经济学原理" },
            term: { id: "term-1", name: "2025年秋季学期", endDate: new Date("2025-12-31T00:00:00Z") }
          }
        }
      ]
    });

    const result = await service.getMyProfile("student-2");
    expect(result.academicStanding).toBe("Good Standing");
    expect(result.gpa).toBe(2);
  });

  it("getMyProfile GPA < 2.0 时 academicStanding 返回 Academic Probation", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({
      id: "student-3",
      email: "student3@univ.edu",
      studentId: "U250003",
      role: "STUDENT",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-02T00:00:00Z"),
      studentProfile: { legalName: "李四", programMajor: "数学" },
      enrollments: [
        {
          id: "enr-b",
          createdAt: new Date("2025-09-01T00:00:00Z"),
          status: "COMPLETED",
          finalGrade: "D",
          waitlistPosition: null,
          section: {
            credits: 3,
            sectionCode: "MATH101-A",
            course: { id: "course-m1", code: "MATH101", title: "微积分" },
            term: { id: "term-1", name: "2025年秋季学期", endDate: new Date("2025-12-31T00:00:00Z") }
          }
        }
      ]
    });

    const result = await service.getMyProfile("student-3");
    expect(result.academicStanding).toBe("Academic Probation");
  });

  it("getCart 返回购物车项目", async () => {
    const { prisma, service } = createStudentsService();
    prisma.cartItem.findMany.mockResolvedValue([
      {
        id: "cart-1",
        studentId: "student-1",
        sectionId: "section-1",
        createdAt: new Date("2025-10-01T00:00:00Z"),
        section: {
          course: { code: "CS101", title: "计算机科学导论" },
          term: { name: "2025年秋季学期" },
          meetingTimes: []
        }
      }
    ]);

    const result = await service.getCart("student-1");
    expect(result).toHaveLength(1);
    expect(prisma.cartItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { studentId: "student-1" } })
    );
  });

  it("getMyRatings 当学生不存在时返回空数组", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue(null);

    const result = await service.getMyRatings("nonexistent");
    expect(result).toEqual([]);
  });

  it("updateMyProfile 当档案不存在时抛 NotFoundException", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({ id: "student-1", studentProfile: null });

    await expect(
      service.updateMyProfile("student-1", { legalName: "新名字" } as never)
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("updateMyProfile 成功更新并返回更新后档案", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({
      id: "student-1",
      studentProfile: { legalName: "旧名字", dob: null, address: null, emergencyContact: null, programMajor: "CS", enrollmentStatus: "ACTIVE", academicStatus: "GOOD_STANDING" }
    });
    prisma.studentProfile.update.mockResolvedValue({ legalName: "新名字", programMajor: "CS" });

    const result = await service.updateMyProfile("student-1", { legalName: "新名字" } as never);
    expect(result.legalName).toBe("新名字");
  });

  it("adminGetStudent 当学生不存在时抛 NotFoundException", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.adminGetStudent("nonexistent")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("adminGetStudent 返回学生详情与 GPA", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({
      id: "student-1",
      email: "student@univ.edu",
      studentProfile: { legalName: "张小明", programMajor: "CS" },
      adviseeAssignments: [],
      enrollments: [
        {
          id: "e1",
          status: "COMPLETED",
          finalGrade: "A",
          section: { credits: 3, courseId: "c1", course: { id: "c1", code: "CS101", title: "导论" } }
        }
      ]
    });

    const result = await service.adminGetStudent("student-1");
    expect(result.gpa).toBe(4);
    expect(result.email).toBe("student@univ.edu");
  });

  it("getMyGradeAppeals 学生不存在时抛 NotFoundException", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.getMyGradeAppeals("nonexistent")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("getMyGradeAppeals 返回该学生的申诉列表", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.gradeAppeal.findMany.mockResolvedValue([
      { id: "appeal-1", studentId: "student-1", status: "PENDING" }
    ]);

    const result = await service.getMyGradeAppeals("student-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("appeal-1");
  });

  it("getCourseRecommendations 无同专业学生时返回热门课程", async () => {
    const { prisma, service } = createStudentsService();
    prisma.studentProfile.findUnique.mockResolvedValue({ programMajor: "CS" });
    prisma.enrollment.findMany.mockResolvedValue([]);
    prisma.studentProfile.findMany.mockResolvedValue([]); // No peers
    prisma.enrollment.groupBy.mockResolvedValue([
      { sectionId: "section-popular", _count: { sectionId: 15 } }
    ]);
    prisma.section.findMany.mockResolvedValue([
      {
        id: "section-popular",
        course: { id: "course-1", code: "CS999", title: "热门课", credits: 3 },
        term: { name: "2025秋" }
      }
    ]);

    const result = await service.getCourseRecommendations("student-1");
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("热门课程");
    expect(result[0].popularityScore).toBe(15);
  });

  it("getCourseRecommendations 有同专业同学时返回协同推荐", async () => {
    const { prisma, service } = createStudentsService();
    prisma.studentProfile.findUnique.mockResolvedValue({ programMajor: "CS" });
    prisma.enrollment.findMany.mockResolvedValue([]);
    prisma.studentProfile.findMany.mockResolvedValue([{ userId: "peer-1" }, { userId: "peer-2" }]);
    prisma.enrollment.groupBy.mockResolvedValue([
      { sectionId: "section-peer", _count: { sectionId: 8 } }
    ]);
    prisma.section.findMany.mockResolvedValue([
      {
        id: "section-peer",
        course: { id: "course-2", code: "CS201", title: "数据结构", credits: 3 },
        term: { name: "2025秋" }
      }
    ]);

    const result = await service.getCourseRecommendations("student-1");
    expect(result[0].reason).toContain("同专业学生热选");
  });

  it("getCourseHistory 返回学生课程历史", async () => {
    const { prisma, service } = createStudentsService();
    prisma.enrollment.findMany.mockResolvedValue([
      {
        id: "e1",
        status: "COMPLETED",
        finalGrade: "B",
        createdAt: new Date("2025-09-01T00:00:00Z"),
        updatedAt: new Date("2025-12-31T00:00:00Z"),
        section: {
          sectionCode: "CS101-A",
          credits: 3,
          instructorName: "王教授",
          course: { code: "CS101", title: "计算机科学导论" },
          term: { name: "2025年秋季学期" }
        }
      }
    ]);

    const result = await service.getCourseHistory("student-1");
    expect(result.terms).toHaveLength(1);
    expect(result.terms[0].enrollments[0].finalGrade).toBe("B");
    expect(result.summary.totalCourses).toBe(1);
  });

  it("getRealDegreeAudit 学生不存在时抛 NotFoundException", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.getRealDegreeAudit("nonexistent")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("getRealDegreeAudit 学生无 degreeProgram 时返回空结构", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({
      id: "student-1",
      email: "s@univ.edu",
      degreeProgram: null,
      studentProfile: { legalName: "张三", programMajor: null }
    });

    const result = await service.getRealDegreeAudit("student-1");
    expect(result.program).toBeNull();
    expect(result.eligible).toBe(false);
  });
});
