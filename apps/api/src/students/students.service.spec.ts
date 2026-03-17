import { ForbiddenException, InternalServerErrorException } from "@nestjs/common";
import { StudentsService } from "./students.service";

function createStudentsService() {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn()
    },
    enrollment: {
      findMany: jest.fn()
    },
    notificationLog: {
      create: jest.fn((args) => Promise.resolve(args))
    },
    scheduleSnapshot: {
      create: jest.fn(),
      findUnique: jest.fn()
    },
    $transaction: jest.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops))
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

  it("getNotifications throws explicit error instead of returning an empty list", async () => {
    const { prisma, service } = createStudentsService();
    prisma.enrollment.findMany.mockRejectedValue(new Error("db down"));

    await expect(service.getNotifications("student-1")).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it("getTranscript throws explicit error instead of returning an empty list", async () => {
    const { prisma, service } = createStudentsService();
    prisma.user.findFirst.mockResolvedValue({ id: "student-1" });
    prisma.enrollment.findMany.mockRejectedValue(new Error("db down"));

    await expect(service.getTranscript("student-1")).rejects.toBeInstanceOf(InternalServerErrorException);
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
});
