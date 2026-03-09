import { BadRequestException } from "@nestjs/common";
import { hasMeetingConflict, RegistrationService } from "./registration.service";

function createRegistrationService(overrides?: Partial<Record<string, unknown>>) {
  const prisma = {
    systemSetting: {
      findUnique: jest.fn()
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
      delete: jest.fn()
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
      createMany: jest.fn()
    },
    $transaction: jest.fn()
  } as any;

  const auditService = {
    log: jest.fn().mockResolvedValue(undefined)
  } as any;

  const notificationsService = {
    sendMail: jest.fn().mockResolvedValue(true)
  } as any;

  const governanceService = {
    assertNoBlockingHolds: jest.fn().mockResolvedValue(undefined),
    getApprovedCreditLimit: jest.fn().mockImplementation(async (_client: unknown, _studentId: string, _termId: string, max: number) => max)
  } as any;

  Object.assign(prisma, overrides);

  return {
    prisma,
    auditService,
    notificationsService,
    governanceService,
    service: new RegistrationService(prisma, auditService, notificationsService, governanceService)
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
      enrolledCountBySection: new Map<string, number>(),
      maxWaitlistPositionBySection: new Map<string, number>()
    });

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ reasonCode: "CREDIT_LIMIT_EXCEEDED" })])
    );
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
      enrolledCountBySection: new Map<string, number>(),
      maxWaitlistPositionBySection: new Map<string, number>()
    });

    expect(result.issues).toHaveLength(0);
    expect(result.toCreate).toHaveLength(1);
  });

  it("dropEnrollment rejects enrolled drops after the deadline", async () => {
    const { prisma, service } = createRegistrationService();
    prisma.enrollment.findFirst.mockResolvedValue({
      id: "enrollment-1",
      studentId: "student-1",
      sectionId: "section-1",
      status: "ENROLLED",
      waitlistPosition: null,
      term: { dropDeadline: new Date("2026-01-01T00:00:00Z") },
      section: { course: { code: "CS101" } }
    });

    await expect(
      service.dropEnrollment("student-1", { enrollmentId: "enrollment-1" } as never, {} as never)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("dropEnrollment allows waitlisted drops after the deadline", async () => {
    const { prisma, service } = createRegistrationService();
    prisma.enrollment.findFirst.mockResolvedValue({
      id: "enrollment-1",
      studentId: "student-1",
      sectionId: "section-1",
      status: "WAITLISTED",
      waitlistPosition: 2,
      term: { dropDeadline: new Date("2026-01-01T00:00:00Z") },
      section: { course: { code: "CS101" } }
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) =>
      fn({
        enrollment: {
          findFirst: jest.fn().mockResolvedValue({
            id: "enrollment-1",
            studentId: "student-1",
            sectionId: "section-1",
            status: "WAITLISTED",
            waitlistPosition: 2
          }),
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
      enrolledCountBySection: new Map<string, number>(),
      maxWaitlistPositionBySection: new Map<string, number>()
    });

    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ reasonCode: "PREREQUISITE_NOT_MET" })])
    );
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
        $queryRaw: jest.fn().mockResolvedValue(undefined),
        section: {
          findUnique: jest.fn().mockResolvedValue({
            id: "section-1",
            courseId: "course-2",
            termId: "term-1",
            capacity: 30,
            requireApproval: false,
            meetingTimes: [],
            enrollments: [],
            term: { id: "term-1" },
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

      await expect(service.enroll("student-1", "section-1")).rejects.toThrow("PREREQ_NOT_MET");
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
        $queryRaw: jest.fn().mockResolvedValue(undefined),
        section: {
          findUnique: jest.fn().mockResolvedValue({
            id: "section-1",
            courseId: "course-2",
            termId: "term-1",
            capacity: 30,
            requireApproval: false,
            meetingTimes: [],
            enrollments: [],
            term: { id: "term-1" },
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

      await expect(service.enroll("student-1", "section-1")).resolves.toEqual(created);
      expect(tx.enrollment.create).toHaveBeenCalledWith({
        data: {
          studentId: "student-1",
          termId: "term-1",
          sectionId: "section-1",
          status: "ENROLLED"
        }
      });
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

    it("precheckCart honors an approved overload limit", async () => {
      const { prisma, governanceService, service } = createRegistrationService();
      prisma.term.findUnique.mockResolvedValue({
        id: "term-1",
        maxCredits: 18,
        startDate: new Date("2026-09-01T00:00:00Z"),
        registrationOpenAt: new Date("2025-08-01T00:00:00Z"),
        registrationCloseAt: new Date("2099-09-10T00:00:00Z")
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
});
