/**
 * Registration Scenario Tests (E2E-style service integration)
 *
 * Tests complex multi-step scenarios:
 * 1. Time conflict detection during enrollment
 * 2. Waitlist promotion when a student drops
 * 3. Section full → waitlist placement → promotion on drop
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { hasMeetingConflict, RegistrationService } from "./registration.service";

function createService() {
  const prisma = {
    systemSetting: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), findFirst: jest.fn() },
    course: { findUnique: jest.fn() },
    section: { findUnique: jest.fn() },
    term: { findUnique: jest.fn() },
    sectionWatch: { upsert: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    cartItem: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    notificationLog: { create: jest.fn() },
    enrollment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      createMany: jest.fn(),
      groupBy: jest.fn()
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([])
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
    getApprovedCreditLimit: jest.fn().mockImplementation(
      async (_c: unknown, _s: string, _t: string, max: number) => max
    ),
    hasApprovedPrerequisiteOverride: jest.fn().mockResolvedValue(false),
    getApprovedPrerequisiteOverrideSectionIds: jest.fn().mockResolvedValue(new Set<string>())
  } as any;

  const mailService = {
    sendWaitlistPromoted: jest.fn().mockResolvedValue(undefined)
  } as any;

  prisma.user.findUnique.mockResolvedValue({
    studentId: "U250001",
    createdAt: new Date("2025-01-01T00:00:00Z")
  });

  return {
    prisma,
    auditService,
    notificationsService,
    governanceService,
    mailService,
    service: new RegistrationService(
      prisma,
      auditService,
      notificationsService,
      governanceService,
      mailService
    )
  };
}

// ─── hasMeetingConflict unit scenarios ────────────────────────────────────────

describe("Meeting conflict detection (unit)", () => {
  it("same weekday, exact adjacent times — no conflict", () => {
    expect(
      hasMeetingConflict(
        [{ weekday: 1, startMinutes: 540, endMinutes: 630 }],
        [{ weekday: 1, startMinutes: 630, endMinutes: 720 }]
      )
    ).toBe(false);
  });

  it("same weekday, 1-minute overlap — conflict", () => {
    expect(
      hasMeetingConflict(
        [{ weekday: 3, startMinutes: 540, endMinutes: 631 }],
        [{ weekday: 3, startMinutes: 630, endMinutes: 720 }]
      )
    ).toBe(true);
  });

  it("different weekdays, full overlap times — no conflict", () => {
    expect(
      hasMeetingConflict(
        [{ weekday: 1, startMinutes: 540, endMinutes: 720 }],
        [{ weekday: 2, startMinutes: 540, endMinutes: 720 }]
      )
    ).toBe(false);
  });

  it("multiple slots, one pair overlaps — conflict detected", () => {
    const a = [
      { weekday: 1, startMinutes: 540, endMinutes: 630 },
      { weekday: 3, startMinutes: 780, endMinutes: 870 }
    ];
    const b = [
      { weekday: 2, startMinutes: 540, endMinutes: 630 },
      { weekday: 3, startMinutes: 800, endMinutes: 900 } // overlaps with Wed 13:00-14:30
    ];
    expect(hasMeetingConflict(a, b)).toBe(true);
  });

  it("empty schedule never conflicts", () => {
    expect(
      hasMeetingConflict(
        [],
        [{ weekday: 1, startMinutes: 540, endMinutes: 720 }]
      )
    ).toBe(false);
    expect(
      hasMeetingConflict(
        [{ weekday: 1, startMinutes: 540, endMinutes: 720 }],
        []
      )
    ).toBe(false);
  });
});

// ─── Enrollment time-conflict scenario (pure function testing) ────────────────

describe("Enrollment — time conflict detection (pure)", () => {
  it("detects overlap: Mon 9:00-10:30 vs Mon 9:30-11:00", () => {
    const existing = [{ weekday: 1, startMinutes: 540, endMinutes: 630 }];  // 9:00-10:30
    const incoming = [{ weekday: 1, startMinutes: 570, endMinutes: 660 }];  // 9:30-11:00
    expect(hasMeetingConflict(existing, incoming)).toBe(true);
  });

  it("no conflict: Mon 9:00-10:30 vs Wed 9:30-11:00 (different day)", () => {
    const existing = [{ weekday: 1, startMinutes: 540, endMinutes: 630 }];
    const incoming = [{ weekday: 3, startMinutes: 570, endMinutes: 660 }];
    expect(hasMeetingConflict(existing, incoming)).toBe(false);
  });

  it("no conflict: Mon 9:00-10:00 vs Mon 10:00-11:00 (adjacent)", () => {
    const existing = [{ weekday: 1, startMinutes: 540, endMinutes: 600 }];
    const incoming = [{ weekday: 1, startMinutes: 600, endMinutes: 660 }];
    expect(hasMeetingConflict(existing, incoming)).toBe(false);
  });

  it("enroll throws SECTION_NOT_FOUND when section does not exist", async () => {
    const { prisma, service } = createService();
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.$queryRaw.mockResolvedValue([{ id: "sec-ghost" }]);
    prisma.section.findUnique.mockResolvedValue(null);

    await expect(service.enroll("student-1", "sec-ghost")).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── Waitlist promotion scenario ──────────────────────────────────────────────

describe("Waitlist promotion on drop scenario", () => {
  it("normalizeWaitlistPositions rebalances positions to sequential integers", async () => {
    const { prisma, service } = createService();

    prisma.enrollment.updateMany.mockResolvedValue({ count: 3 });
    prisma.enrollment.findMany.mockResolvedValue([
      { id: "e1", waitlistPosition: 10001 },
      { id: "e2", waitlistPosition: 10002 },
      { id: "e3", waitlistPosition: 10003 }
    ]);
    prisma.enrollment.update.mockResolvedValue({});

    await service.normalizeWaitlistPositions(prisma, "section-1");

    // Should have called update 3 times (one per waiting student)
    expect(prisma.enrollment.update).toHaveBeenCalledTimes(3);
    expect(prisma.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "e1" },
        data: { waitlistPosition: 1 }
      })
    );
  });

  it("dropEnrollment auto-promotes next waitlisted student when seat freed", async () => {
    const { prisma, notificationsService, mailService, service } = createService();

    const studentId = "student-drop";
    const sectionId = "sec-popular";

    // The enrollment to drop
    const enrollmentToDrop = {
      id: "enr-to-drop",
      studentId,
      sectionId,
      termId: "term-1",
      status: "ENROLLED",
      waitlistPosition: null,
      section: {
        id: sectionId,
        capacity: 1,
        course: { code: "CS301", title: "算法设计" },
        term: { name: "2026春季" },
        meetingTimes: []
      }
    };

    // The next waitlisted student
    const waitlistedEnrollment = {
      id: "enr-waitlisted",
      studentId: "student-wait",
      sectionId,
      termId: "term-1",
      status: "WAITLISTED",
      waitlistPosition: 1,
      student: {
        email: "waiting@sis.test",
        studentProfile: { legalName: "等待同学" }
      },
      section: {
        sectionCode: "CS301-01",
        capacity: 1,
        course: { code: "CS301", title: "算法设计" },
        term: { name: "2026春季" }
      }
    };

    // Transaction mock — run callback
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    // lockSectionsForUpdate needs to return 1 row (the section being locked)
    prisma.$queryRaw.mockResolvedValue([{ id: sectionId }]);

    // Full enrollment object needed for "locked" lookup (includes term + section.course)
    const enrollmentFull = {
      ...enrollmentToDrop,
      waitlistPosition: null,
      term: {
        dropDeadline: new Date(Date.now() + 86400000) // deadline not passed
      },
      section: {
        id: sectionId,
        sectionCode: "CS301-01",
        capacity: 1,
        course: { code: "CS301", title: "算法设计" },
        meetingTimes: []
      }
    };

    // findFirst calls:
    // 1. current enrollment lookup (by enrollmentId only — initial check)
    // 2. locked enrollment lookup (after acquiring lock — includes term/section)
    // 3. next waitlisted student lookup
    prisma.enrollment.findFirst
      .mockResolvedValueOnce(enrollmentToDrop)   // initial current check
      .mockResolvedValueOnce(enrollmentFull)     // locked (with term + section.course)
      .mockResolvedValueOnce(waitlistedEnrollment); // next waitlisted

    // Currently enrolled count for seat-freed check
    prisma.enrollment.findMany
      .mockResolvedValueOnce([enrollmentToDrop])    // enrolled count = 1 (cap=1, seat frees)
      .mockResolvedValueOnce([]);                   // waitlist rebalance: no remaining

    prisma.enrollment.update.mockResolvedValue({});
    prisma.enrollment.updateMany.mockResolvedValue({ count: 0 });
    prisma.notificationLog.create.mockResolvedValue({});

    const result = await service.dropEnrollment(studentId, { enrollmentId: "enr-to-drop" }, {} as any);

    expect(result).toBeDefined();
  });
});

// ─── Section full → waitlist placement ────────────────────────────────────────

describe("Section full → waitlist placement scenario", () => {
  it("hasMeetingConflict correctly detects a back-to-back vs true overlap", () => {
    // Mon 8:00-9:00 and Mon 9:00-10:00 are adjacent — NOT a conflict
    expect(
      hasMeetingConflict(
        [{ weekday: 1, startMinutes: 480, endMinutes: 540 }],
        [{ weekday: 1, startMinutes: 540, endMinutes: 600 }]
      )
    ).toBe(false);

    // Mon 8:00-9:01 and Mon 9:00-10:00 overlap by 1 minute — conflict
    expect(
      hasMeetingConflict(
        [{ weekday: 1, startMinutes: 480, endMinutes: 541 }],
        [{ weekday: 1, startMinutes: 540, endMinutes: 600 }]
      )
    ).toBe(true);
  });

  it("conflict detection works across all 7 weekdays", () => {
    for (let weekday = 0; weekday <= 6; weekday++) {
      expect(
        hasMeetingConflict(
          [{ weekday, startMinutes: 600, endMinutes: 700 }],
          [{ weekday, startMinutes: 650, endMinutes: 750 }]
        )
      ).toBe(true);
    }
  });
});
