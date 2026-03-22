import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { hasMeetingConflict, RegistrationService } from "./registration.service";

function createRegistrationService(overrides?: Partial<Record<string, unknown>>) {
  const prisma = {
    systemSetting: {
      findUnique: jest.fn()
    },
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn()
    },
    course: {
      findUnique: jest.fn()
    },
    section: {
      findUnique: jest.fn()
    },
    term: {
      findUnique: jest.fn()
    },
    sectionWatch: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn()
    },
    cartItem: {
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn()
    },
    notificationLog: {
      create: jest.fn()
    },
    enrollment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      createMany: jest.fn(),
      groupBy: jest.fn()
    },
    $transaction: jest.fn()
  } as any;

  const auditService = {
    log: jest.fn().mockResolvedValue(undefined),
    logInTransaction: jest.fn().mockResolvedValue(undefined)
  } as any;

  const notificationsService = {
    sendMail: jest.fn().mockResolvedValue(true),
    sendEnrollmentSubmissionEmail: jest.fn().mockResolvedValue(undefined),
    sendGradePostedEmail: jest.fn().mockResolvedValue(undefined)
  } as any;

  const governanceService = {
    assertNoBlockingHolds: jest.fn().mockResolvedValue(undefined),
    getApprovedCreditLimit: jest.fn().mockImplementation(async (_client: unknown, _studentId: string, _termId: string, max: number) => max),
    hasApprovedPrerequisiteOverride: jest.fn().mockResolvedValue(false),
    getApprovedPrerequisiteOverrideSectionIds: jest.fn().mockResolvedValue(new Set<string>())
  } as any;

  const mailService = {
    sendWaitlistPromoted: jest.fn().mockResolvedValue(undefined)
  } as any;

  Object.assign(prisma, overrides);
  prisma.user.findUnique.mockResolvedValue({
    studentId: "U250001",
    createdAt: new Date("2025-01-01T00:00:00Z")
  });

  return {
    prisma,
    auditService,
    notificationsService,
    governanceService,
    service: new RegistrationService(prisma, auditService, notificationsService, governanceService, mailService)
  };
}

function makeCartItem(input?: Partial<any>) {
  return {
    id: "cart-1",
    sectionId: "section-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    section: {
      id: "section-1",
      sectionCode: "SEC-1",
      credits: 2,
      capacity: 30,
      requireApproval: false,
      startDate: new Date("2026-09-01T00:00:00Z"),
      meetingTimes: [],
      course: {
        code: "CS101",
        prerequisiteLinks: []
      }
    },
    ...input
  };
}

describe("RegistrationService", () => {
  it("hasMeetingConflict returns false for non-overlapping meetings", () => {
    expect(
      hasMeetingConflict(
        [{ weekday: 1, startMinutes: 9 * 60, endMinutes: 10 * 60 }],
        [{ weekday: 1, startMinutes: 10 * 60 + 30, endMinutes: 11 * 60 }]
      )
    ).toBe(false);
  });

  it("hasMeetingConflict returns true for overlapping meetings", () => {
    expect(
      hasMeetingConflict(
        [{ weekday: 2, startMinutes: 9 * 60, endMinutes: 10 * 60 }],
        [{ weekday: 2, startMinutes: 9 * 60 + 30, endMinutes: 10 * 60 + 30 }]
      )
    ).toBe(true);
  });

  it("hasMeetingConflict treats adjacent meetings as non-conflicting", () => {
    expect(
      hasMeetingConflict(
        [{ weekday: 3, startMinutes: 8 * 60, endMinutes: 9 * 60 }],
        [{ weekday: 3, startMinutes: 9 * 60, endMinutes: 10 * 60 }]
      )
    ).toBe(false);
  });

  it("getEffectiveMaxCredits returns parsed system setting or default 18", async () => {
    const { prisma, service } = createRegistrationService();
    prisma.systemSetting.findUnique.mockResolvedValueOnce({ value: "21" }).mockResolvedValueOnce(null);

    await expect((service as any).getEffectiveMaxCredits(18)).resolves.toBe(21);
    await expect((service as any).getEffectiveMaxCredits(18)).resolves.toBe(18);
  });

  it("marks credit limit issue when current credits plus course exceeds limit", () => {
    const { service } = createRegistrationService();
    const result = (service as any).buildEnrollmentPlan({
      studentId: "student-1",
      termId: "term-1",
      term: { startDate: new Date("2026-09-01T00:00:00Z"), maxCredits: 18 },
      now: new Date("2026-08-01T00:00:00Z"),
      cartItems: [makeCartItem()],
      existingEnrollments: [
        {
          sectionId: "existing",
          status: "ENROLLED",
          section: { credits: 17, meetingTimes: [] }
        }
      ],
      passedCourseIds: new Set<string>(),
      approvedPrereqOverrideSectionIds: new Set<string>(),
      enrolledCountBySection: new Map<string, number>(),
      maxWaitlistPositionBySection: new Map<string, number>()
    });

    expect(result.issues).toEqual([]);
    expect(result.toCreate).toEqual(
      expect.arrayContaining([expect.objectContaining({ sectionId: "section-1", status: "PENDING_APPROVAL" })])
    );
    expect(result.pendingReasonBySection.get("section-1")).toBe("CREDIT_OVERLOAD");
  });

  it("allows enrollment plan when current credits plus course stays within limit", () => {
    const { service } = createRegistrationService();
    const result = (service as any).buildEnrollmentPlan({
      studentId: "student-1",
      termId: "term-1",
      term: { startDate: new Date("2026-09-01T00:00:00Z"), maxCredits: 18 },
      now: new Date("2026-08-01T00:00:00Z"),
      cartItems: [makeCartItem()],
      existingEnrollments: [
        {
          sectionId: "existing",
          status: "ENROLLED",
          section: { credits: 16, meetingTimes: [] }
        }
      ],
      passedCourseIds: new Set<string>(),
      approvedPrereqOverrideSectionIds: new Set<string>(),
      enrolledCountBySection: new Map<string, number>(),
      maxWaitlistPositionBySection: new Map<string, number>()
    });

    expect(result.issues).toHaveLength(0);
    expect(result.toCreate).toHaveLength(1);
  });

  it("dropEnrollment rejects enrolled drops after the deadline", async () => {
    const { prisma, service } = createRegistrationService();
    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) =>
      fn({
        $queryRaw: jest.fn().mockResolvedValue([{ id: "section-1" }]),
        enrollment: {
          findFirst: jest.fn().mockResolvedValue({
            id: "enrollment-1",
            studentId: "student-1",
            sectionId: "section-1",
            status: "ENROLLED",
            waitlistPosition: null,
            term: { dropDeadline: new Date("2026-01-01T00:00:00Z"), name: "2026春" },
            section: { course: { code: "CS101" }, sectionCode: "SEC-1" }
          }),
          update: jest.fn(),
          findMany: jest.fn()
        }
      })
    );

    await expect(
      service.dropEnrollment("student-1", { enrollmentId: "enrollment-1" } as never, {} as never)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("dropEnrollment allows waitlisted drops after the deadline", async () => {
    const { prisma, service } = createRegistrationService();
    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) =>
      fn({
        $queryRaw: jest.fn().mockResolvedValue([{ id: "section-1" }]),
        enrollment: {
          findFirst: jest.fn().mockResolvedValue({
            id: "enrollment-1",
            studentId: "student-1",
            sectionId: "section-1",
            status: "WAITLISTED",
            waitlistPosition: 2,
            term: { dropDeadline: new Date("2026-01-01T00:00:00Z"), name: "2026春" },
            section: { course: { code: "CS101" }, sectionCode: "SEC-1" }
          }),
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn().mockResolvedValue({ id: "enrollment-1", status: "DROPPED" }),
          updateMany: jest.fn().mockResolvedValue({ count: 0 })
        }
      })
    );

    await expect(
      service.dropEnrollment("student-1", { enrollmentId: "enrollment-1" } as never, {} as never)
    ).resolves.toEqual(expect.objectContaining({ seatFreed: false }));
  });

  it("allows prerequisite-satisfied enrollment plans", () => {
    const { service } = createRegistrationService();
    const result = (service as any).buildEnrollmentPlan({
      studentId: "student-1",
      termId: "term-1",
      term: { startDate: new Date("2026-09-01T00:00:00Z"), maxCredits: 18 },
      now: new Date("2026-08-01T00:00:00Z"),
      cartItems: [
        makeCartItem({
          section: {
            id: "section-1",
            sectionCode: "SEC-1",
            credits: 3,
            capacity: 30,
            requireApproval: false,
            startDate: new Date("2026-09-01T00:00:00Z"),
            meetingTimes: [],
            course: {
              code: "CS201",
              prerequisiteLinks: [
                {
                  prerequisiteCourseId: "course-prereq",
                  prerequisiteCourse: { code: "CS101" }
                }
              ]
            }
          }
        })
      ],
      existingEnrollments: [],
      passedCourseIds: new Set<string>(["course-prereq"]),
      approvedPrereqOverrideSectionIds: new Set<string>(),
      enrolledCountBySection: new Map<string, number>(),
      maxWaitlistPositionBySection: new Map<string, number>()
    });

    expect(result.issues).toHaveLength(0);
    expect(result.toCreate).toHaveLength(1);
  });

  it("marks prerequisite issues when prerequisite is missing", () => {
    const { service } = createRegistrationService();
    const result = (service as any).buildEnrollmentPlan({
      studentId: "student-1",
      termId: "term-1",
      term: { startDate: new Date("2026-09-01T00:00:00Z"), maxCredits: 18 },
      now: new Date("2026-08-01T00:00:00Z"),
      cartItems: [
        makeCartItem({
          section: {
            id: "section-1",
            sectionCode: "SEC-1",
            credits: 3,
            capacity: 30,
            requireApproval: false,
            startDate: new Date("2026-09-01T00:00:00Z"),
            meetingTimes: [],
            course: {
              code: "CS201",
              prerequisiteLinks: [
                {
                  prerequisiteCourseId: "course-prereq",
                  prerequisiteCourse: { code: "CS101" }
                }
              ]
            }
          }
        })
      ],
      existingEnrollments: [],
      passedCourseIds: new Set<string>(),
      approvedPrereqOverrideSectionIds: new Set<string>(),
      enrolledCountBySection: new Map<string, number>(),
      maxWaitlistPositionBySection: new Map<string, number>()
    });

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ reasonCode: "PREREQUISITE_NOT_MET" })])
    );
  });

  it("allows prerequisite-missing enrollment plans when a section override is approved", () => {
    const { service } = createRegistrationService();
    const result = (service as any).buildEnrollmentPlan({
      studentId: "student-1",
      termId: "term-1",
      term: { startDate: new Date("2026-09-01T00:00:00Z"), maxCredits: 18 },
      now: new Date("2026-08-01T00:00:00Z"),
      cartItems: [
        makeCartItem({
          section: {
            id: "section-1",
            sectionCode: "SEC-1",
            credits: 3,
            capacity: 30,
            requireApproval: false,
            startDate: new Date("2026-09-01T00:00:00Z"),
            meetingTimes: [],
            course: {
              code: "CS201",
              prerequisiteLinks: [
                {
                  prerequisiteCourseId: "course-prereq",
                  prerequisiteCourse: { code: "CS101" }
                }
              ]
            }
          }
        })
      ],
      existingEnrollments: [],
      passedCourseIds: new Set<string>(),
      approvedPrereqOverrideSectionIds: new Set<string>(["section-1"]),
      enrolledCountBySection: new Map<string, number>(),
      maxWaitlistPositionBySection: new Map<string, number>()
    });

    expect(result.issues).toHaveLength(0);
    expect(result.toCreate).toHaveLength(1);
  });

  it("returns waitlist position and ahead count", async () => {
    const { prisma, service } = createRegistrationService();
    prisma.enrollment.findFirst.mockResolvedValue({ waitlistPosition: 3 });

    await expect(service.getWaitlistPosition("student-1", "section-1")).resolves.toEqual({
      position: 3,
      ahead: 2
    });
  });

  it("returns position 1 for the first waitlisted student", async () => {
    const { prisma, service } = createRegistrationService();
    prisma.enrollment.findFirst.mockResolvedValue({ waitlistPosition: 1 });

    await expect(service.getWaitlistPosition("student-1", "section-1")).resolves.toEqual({
      position: 1,
      ahead: 0
    });
  });

  it("returns position 2 for the second waitlisted student", async () => {
    const { prisma, service } = createRegistrationService();
    prisma.enrollment.findFirst.mockResolvedValue({ waitlistPosition: 2 });

    await expect(service.getWaitlistPosition("student-2", "section-1")).resolves.toEqual({
      position: 2,
      ahead: 1
    });
  });

  describe("prerequisite enforcement", () => {
    it("rejects enrollment when student has not completed prerequisite", async () => {
      const { prisma, service } = createRegistrationService();
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: "section-1" }]),
        user: {
          findUnique: jest.fn().mockResolvedValue({
            studentId: "U250001",
            createdAt: new Date("2025-01-01T00:00:00Z")
          })
        },
        section: {
          findUnique: jest.fn().mockResolvedValue({
            id: "section-1",
            courseId: "course-2",
            termId: "term-1",
            capacity: 30,
            requireApproval: false,
            meetingTimes: [],
            enrollments: [],
            term: {
              id: "term-1",
              registrationOpenAt: new Date("2025-08-01T00:00:00Z"),
              registrationCloseAt: new Date("2099-09-10T00:00:00Z"),
              startDate: new Date("2026-09-01T00:00:00Z"),
              endDate: new Date("2026-12-15T00:00:00Z")
            },
            course: { id: "course-2", code: "CS201" }
          })
        },
        course: {
          findUnique: jest.fn().mockResolvedValue({
            id: "course-2",
            prerequisiteLinks: [
              {
                prerequisiteCourseId: "course-1",
                prerequisiteCourse: { id: "course-1", code: "CS101" }
              }
            ]
          })
        },
        enrollment: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn()
        }
      };
      prisma.$transaction.mockImplementation(async (fn: (client: any) => Promise<unknown>) => fn(tx));

      await expect(service.enroll("student-1", "section-1")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "PREREQ_NOT_MET" })
      });
      expect(tx.enrollment.create).not.toHaveBeenCalled();
    });

    it("allows enrollment when all prerequisites are completed", async () => {
      const { prisma, service } = createRegistrationService();
      const created = {
        id: "enrollment-1",
        studentId: "student-1",
        sectionId: "section-1",
        termId: "term-1",
        status: "ENROLLED"
      };
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: "section-1" }]),
        user: {
          findUnique: jest.fn().mockResolvedValue({
            studentId: "U250001",
            createdAt: new Date("2025-01-01T00:00:00Z")
          })
        },
        section: {
          findUnique: jest.fn().mockResolvedValue({
            id: "section-1",
            courseId: "course-2",
            termId: "term-1",
            capacity: 30,
            requireApproval: false,
            meetingTimes: [],
            enrollments: [],
            term: {
              id: "term-1",
              registrationOpenAt: new Date("2025-08-01T00:00:00Z"),
              registrationCloseAt: new Date("2099-09-10T00:00:00Z"),
              startDate: new Date("2026-09-01T00:00:00Z"),
              endDate: new Date("2026-12-15T00:00:00Z")
            },
            course: { id: "course-2", code: "CS201" }
          })
        },
        course: {
          findUnique: jest.fn().mockResolvedValue({
            id: "course-2",
            prerequisiteLinks: [
              {
                prerequisiteCourseId: "course-1",
                prerequisiteCourse: { id: "course-1", code: "CS101" }
              }
            ]
          })
        },
        enrollment: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest
            .fn()
            .mockResolvedValueOnce([{ section: { courseId: "course-1" } }])
            .mockResolvedValueOnce([]),
          create: jest.fn().mockResolvedValue(created)
        }
      };
      prisma.$transaction.mockImplementation(async (fn: (client: any) => Promise<unknown>) => fn(tx));

      await expect(service.enroll("student-1", "section-1")).resolves.toEqual(
        expect.objectContaining(created)
      );
      expect(tx.enrollment.create).toHaveBeenCalledWith({
        data: {
          studentId: "student-1",
          termId: "term-1",
          sectionId: "section-1",
          status: "ENROLLED"
        }
      });
    });

    it("allows enrollment when an approved prerequisite override exists for the section", async () => {
      const { prisma, governanceService, service } = createRegistrationService();
      governanceService.hasApprovedPrerequisiteOverride.mockResolvedValue(true);
      const created = {
        id: "enrollment-2",
        studentId: "student-1",
        sectionId: "section-1",
        termId: "term-1",
        status: "ENROLLED"
      };
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: "section-1" }]),
        user: {
          findUnique: jest.fn().mockResolvedValue({
            studentId: "U250001",
            createdAt: new Date("2025-01-01T00:00:00Z")
          })
        },
        section: {
          findUnique: jest.fn().mockResolvedValue({
            id: "section-1",
            courseId: "course-2",
            termId: "term-1",
            capacity: 30,
            requireApproval: false,
            meetingTimes: [],
            enrollments: [],
            term: {
              id: "term-1",
              maxCredits: 18,
              registrationOpenAt: new Date("2025-08-01T00:00:00Z"),
              registrationCloseAt: new Date("2099-09-10T00:00:00Z"),
              startDate: new Date("2026-09-01T00:00:00Z"),
              endDate: new Date("2026-12-15T00:00:00Z")
            },
            course: { id: "course-2", code: "CS201" }
          })
        },
        course: {
          findUnique: jest.fn().mockResolvedValue({
            id: "course-2",
            prerequisiteLinks: [
              {
                prerequisiteCourseId: "course-1",
                prerequisiteCourse: { id: "course-1", code: "CS101" }
              }
            ]
          })
        },
        enrollment: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue(created)
        }
      };
      prisma.$transaction.mockImplementation(async (fn: (client: any) => Promise<unknown>) => fn(tx));

      await expect(service.enroll("student-1", "section-1")).resolves.toEqual(
        expect.objectContaining(created)
      );
      expect(governanceService.hasApprovedPrerequisiteOverride).toHaveBeenCalledWith(tx, "student-1", "section-1");
    });
  });

  describe("governance enforcement", () => {
    it("blocks addToCart when an active registration hold exists", async () => {
      const { governanceService, service } = createRegistrationService();
      governanceService.assertNoBlockingHolds.mockRejectedValue(
        new BadRequestException({ code: "ACTIVE_REGISTRATION_HOLD", message: "Registration blocked" })
      );

      await expect(
        service.addToCart("student-1", { termId: "term-1", sectionId: "section-1" } as never)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("blocks submitCart when an active registration hold exists", async () => {
      const { governanceService, service } = createRegistrationService();
      governanceService.assertNoBlockingHolds.mockRejectedValue(
        new BadRequestException({ code: "ACTIVE_REGISTRATION_HOLD", message: "Registration blocked" })
      );

      await expect(
        service.submitCart("student-1", { termId: "term-1" } as never, {} as never)
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("blocks swap when an active registration hold exists", async () => {
      const { governanceService, service } = createRegistrationService();
      governanceService.assertNoBlockingHolds.mockRejectedValue(
        new BadRequestException({ code: "ACTIVE_REGISTRATION_HOLD", message: "Registration blocked" })
      );
      const transaction = jest.fn(async (callback: (tx: any) => Promise<unknown>) => callback({}));
      (service as any).prisma.$transaction = transaction;

      await expect(service.swap("student-1", "section-1", "section-2")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("precheckCart honors an approved overload limit", async () => {
      const { prisma, governanceService, service } = createRegistrationService();
      prisma.term.findUnique.mockResolvedValue({
        id: "term-1",
        maxCredits: 18,
        startDate: new Date("2026-09-01T00:00:00Z"),
        registrationOpenAt: new Date("2025-08-01T00:00:00Z"),
        registrationCloseAt: new Date("2099-09-10T00:00:00Z"),
        endDate: new Date("2026-12-15T00:00:00Z")
      });
      prisma.cartItem.findMany.mockResolvedValue([makeCartItem()]);
      prisma.enrollment.findMany
        .mockResolvedValueOnce([
          {
            sectionId: "existing",
            status: "ENROLLED",
            section: { credits: 17, meetingTimes: [] }
          }
        ])
        .mockResolvedValueOnce([]);
      governanceService.getApprovedCreditLimit.mockResolvedValue(21);
      governanceService.getApprovedPrerequisiteOverrideSectionIds.mockResolvedValue(new Set<string>());
      (service as any).getSectionEnrollmentStats = jest.fn().mockResolvedValue({
        enrolledCountBySection: new Map<string, number>(),
        maxWaitlistPositionBySection: new Map<string, number>()
      });

      const result = await service.precheckCart("student-1", { termId: "term-1" } as never);

      expect(result.ok).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(governanceService.getApprovedCreditLimit).toHaveBeenCalledWith(expect.anything(), "student-1", "term-1", 18);
    });
  });


  describe("submitCart 边界", () => {
    it("购物车为空时抛 EMPTY_CART", async () => {
      const { prisma, governanceService, service } = createRegistrationService();
      prisma.term.findUnique.mockResolvedValue({
        id: "term-1",
        maxCredits: 18,
        startDate: new Date("2026-09-01T00:00:00Z"),
        registrationOpenAt: new Date("2025-08-01T00:00:00Z"),
        registrationCloseAt: new Date("2099-09-10T00:00:00Z"),
        endDate: new Date("2026-12-15T00:00:00Z")
      });
      prisma.cartItem.findMany.mockResolvedValue([]);
      governanceService.getApprovedPrerequisiteOverrideSectionIds.mockResolvedValue(new Set<string>());

      await expect(service.submitCart("student-1", { termId: "term-1" } as never, {} as never)).rejects.toMatchObject({
        response: expect.objectContaining({ code: "EMPTY_CART" })
      });
    });

    it("满班教学班会按候补创建 WAITLISTED 记录", async () => {
      const { prisma, governanceService, notificationsService, service } = createRegistrationService();
      const term = {
        id: "term-1",
        name: "2025年秋季学期",
        maxCredits: 18,
        startDate: new Date("2026-09-01T00:00:00Z"),
        registrationOpenAt: new Date("2025-08-01T00:00:00Z"),
        registrationCloseAt: new Date("2099-09-10T00:00:00Z"),
        endDate: new Date("2026-12-15T00:00:00Z")
      };
      const cartItem = makeCartItem({
        section: {
          id: "section-1",
          sectionCode: "SEC-1",
          credits: 3,
          capacity: 1,
          requireApproval: false,
          startDate: new Date("2026-09-01T00:00:00Z"),
          term,
          meetingTimes: [],
          course: { code: "CS101", prerequisiteLinks: [] }
        }
      });
      prisma.term.findUnique.mockResolvedValue(term);
      prisma.cartItem.findMany.mockResolvedValue([cartItem]);
      prisma.enrollment.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.enrollment.groupBy
        .mockResolvedValueOnce([{ sectionId: "section-1", _count: { _all: 1 } }])
        .mockResolvedValueOnce([]);
      governanceService.getApprovedPrerequisiteOverrideSectionIds.mockResolvedValue(new Set<string>());

      const tx = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            studentId: "U250001",
            createdAt: new Date("2025-01-01T00:00:00Z")
          })
        },
        course: {
          findUnique: jest.fn().mockResolvedValue({ id: "course-1", prerequisiteLinks: [] })
        },
        cartItem: {
          findMany: jest.fn().mockResolvedValue([cartItem]),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 })
        },
        enrollment: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
              {
                id: "enr-1",
                sectionId: "section-1",
                termId: "term-1",
                status: "WAITLISTED",
                waitlistPosition: 1,
                section: {
                  course: { code: "CS101" },
                  meetingTimes: [],
                  sectionCode: "SEC-1"
                }
              }
            ]),
          groupBy: jest.fn().mockResolvedValueOnce([{ sectionId: "section-1", _count: { _all: 1 } }]).mockResolvedValueOnce([]),
          createMany: jest.fn().mockResolvedValue({ count: 1 })
        },
        $queryRaw: jest.fn().mockResolvedValue([{ id: "section-1" }])
      } as any;
      jest.spyOn(service as any, "runEnrollmentTransactionWithRetry").mockImplementation(async (...args: any[]) => args[0](tx));
      prisma.user.findFirst.mockResolvedValue({ id: "student-1", email: "student@univ.edu", studentProfile: { legalName: "张小明" } });
      prisma.term.findUnique.mockResolvedValue(term);

      const result = await service.submitCart("student-1", { termId: "term-1" } as never, {} as never);

      expect(result[0]).toEqual(expect.objectContaining({ status: "WAITLISTED", waitlistPosition: 1 }));
      expect(notificationsService.sendEnrollmentSubmissionEmail).toHaveBeenCalled();
    });

    it("时间冲突时返回 SUBMIT_VALIDATION_FAILED", async () => {
      const { prisma, governanceService, service } = createRegistrationService();
      const term = {
        id: "term-1",
        maxCredits: 18,
        startDate: new Date("2026-09-01T00:00:00Z"),
        registrationOpenAt: new Date("2025-08-01T00:00:00Z"),
        registrationCloseAt: new Date("2099-09-10T00:00:00Z"),
        endDate: new Date("2026-12-15T00:00:00Z")
      };
      prisma.term.findUnique.mockResolvedValue(term);
      prisma.cartItem.findMany.mockResolvedValue([
        makeCartItem({
          section: {
            id: "section-1",
            sectionCode: "SEC-1",
            credits: 3,
            capacity: 30,
            requireApproval: false,
            startDate: new Date("2026-09-01T00:00:00Z"),
            meetingTimes: [{ weekday: 1, startMinutes: 540, endMinutes: 600 }],
            course: { code: "CS101", prerequisiteLinks: [] }
          }
        })
      ]);
      prisma.enrollment.findMany
        .mockResolvedValueOnce([
          {
            sectionId: "existing",
            status: "ENROLLED",
            section: {
              credits: 3,
              meetingTimes: [{ weekday: 1, startMinutes: 570, endMinutes: 630 }]
            }
          }
        ])
        .mockResolvedValueOnce([]);
      prisma.enrollment.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      governanceService.getApprovedPrerequisiteOverrideSectionIds.mockResolvedValue(new Set<string>());

      await expect(service.submitCart("student-1", { termId: "term-1" } as never, {} as never)).rejects.toMatchObject({
        response: expect.objectContaining({ code: "SUBMIT_VALIDATION_FAILED" })
      });
    });
  });

  describe("submitSectionGrades", () => {
    it("actor 不存在时抛 USER_NOT_FOUND", async () => {
      const { prisma, service } = createRegistrationService();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.section.findUnique.mockResolvedValue({ id: "section-1" });

      await expect(service.submitSectionGrades("section-1", [{ enrollmentId: "e1", grade: "A" }], "missing")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "USER_NOT_FOUND" })
      });
    });

    it("section 不存在时抛 SECTION_NOT_FOUND", async () => {
      const { prisma, service } = createRegistrationService();
      prisma.user.findFirst.mockResolvedValue({ id: "faculty-1", role: "FACULTY" });
      prisma.section.findUnique.mockResolvedValue(null);

      await expect(service.submitSectionGrades("missing", [{ enrollmentId: "e1", grade: "A" }], "faculty-1")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "SECTION_NOT_FOUND" })
      });
    });

    it("FACULTY 不能提交不属于自己的教学班成绩", async () => {
      const { prisma, service } = createRegistrationService();
      prisma.user.findFirst.mockResolvedValue({ id: "faculty-1", role: "FACULTY" });
      prisma.section.findUnique.mockResolvedValue({
        id: "section-1",
        instructorUserId: "faculty-2",
        sectionCode: "SEC-1",
        course: { code: "CS101", title: "导论" },
        term: {
          name: "2025年秋季学期",
          registrationOpenAt: new Date("2025-01-01T00:00:00Z"),
          registrationCloseAt: new Date("2025-02-01T00:00:00Z"),
          startDate: new Date("2025-09-01T00:00:00Z"),
          endDate: new Date("2099-12-01T00:00:00Z")
        }
      });

      await expect(service.submitSectionGrades("section-1", [{ enrollmentId: "e1", grade: "A" }], "faculty-1")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("未提交任何成绩时抛 NO_GRADES_SUBMITTED", async () => {
      const { prisma, service } = createRegistrationService();
      prisma.user.findFirst.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
      prisma.section.findUnique.mockResolvedValue({
        id: "section-1",
        instructorUserId: null,
        sectionCode: "SEC-1",
        course: { code: "CS101", title: "导论" },
        term: {
          name: "2025年秋季学期",
          registrationOpenAt: new Date("2025-01-01T00:00:00Z"),
          registrationCloseAt: new Date("2025-02-01T00:00:00Z"),
          startDate: new Date("2025-09-01T00:00:00Z"),
          endDate: new Date("2025-12-01T00:00:00Z")
        }
      });

      await expect(service.submitSectionGrades("section-1", [], "admin-1")).rejects.toMatchObject({
        response: expect.objectContaining({ code: "NO_GRADES_SUBMITTED" })
      });
    });

    it("无效成绩值时抛 BadRequestException", async () => {
      const { prisma, service } = createRegistrationService();
      prisma.user.findFirst.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
      prisma.section.findUnique.mockResolvedValue({
        id: "section-1",
        instructorUserId: null,
        sectionCode: "SEC-1",
        course: { code: "CS101", title: "导论" },
        term: {
          name: "2025年秋季学期",
          registrationOpenAt: new Date("2025-01-01T00:00:00Z"),
          registrationCloseAt: new Date("2025-02-01T00:00:00Z"),
          startDate: new Date("2025-09-01T00:00:00Z"),
          endDate: new Date("2025-12-01T00:00:00Z")
        }
      });

      await expect(service.submitSectionGrades("section-1", [{ enrollmentId: "e1", grade: "BAD" }], "admin-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("成功录入成绩后返回 updated 数并发送邮件", async () => {
      const { prisma, notificationsService, auditService, service } = createRegistrationService();
      prisma.user.findFirst.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
      prisma.section.findUnique.mockResolvedValue({
        id: "section-1",
        instructorUserId: null,
        sectionCode: "SEC-1",
        course: { code: "CS101", title: "导论" },
        term: {
          name: "2025年秋季学期",
          registrationOpenAt: new Date("2025-01-01T00:00:00Z"),
          registrationCloseAt: new Date("2025-02-01T00:00:00Z"),
          startDate: new Date("2025-09-01T00:00:00Z"),
          endDate: new Date("2025-12-01T00:00:00Z")
        }
      });
      prisma.enrollment.findMany.mockResolvedValue([
        {
          id: "e1",
          status: "ENROLLED",
          student: { email: "student@univ.edu", studentProfile: { legalName: "张小明" } },
          section: { course: { code: "CS101" }, term: { name: "2025年秋季学期" } }
        }
      ]);
      prisma.enrollment.update.mockResolvedValue({ id: "e1", finalGrade: "A", status: "COMPLETED" });

      const result = await service.submitSectionGrades("section-1", [{ enrollmentId: "e1", grade: "A" }], "admin-1");

      expect(result).toEqual({ updated: 1, succeeded: ["e1"], failed: [] });
      expect(notificationsService.sendGradePostedEmail).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: "GRADE_BULK_UPDATE" }));
    });
  });

  describe("dropEnrollment 边界", () => {
    it("enrollment 不属于该 student 时拒绝", async () => {
      const { prisma, service } = createRegistrationService();
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) =>
        fn({
          $queryRaw: jest.fn().mockResolvedValue([{ id: "section-1" }]),
          enrollment: {
            findFirst: jest.fn().mockResolvedValue({
              id: "enrollment-1",
              studentId: "other-student",
              sectionId: "section-1",
              status: "ENROLLED",
              term: { dropDeadline: new Date("2099-01-01T00:00:00Z") },
              section: { course: { code: "CS101" }, sectionCode: "SEC-1" }
            })
          }
        })
      );

      await expect(
        service.dropEnrollment("student-1", { enrollmentId: "enrollment-1" } as never, {} as never)
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

});
