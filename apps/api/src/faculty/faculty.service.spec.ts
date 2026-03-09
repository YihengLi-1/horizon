import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { FacultyService } from "./faculty.service";

function createFacultyService() {
  const prisma = {
    section: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn()
    },
    enrollment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn()
    }
  } as any;

  const auditService = {
    log: jest.fn().mockResolvedValue(undefined)
  } as any;

  const notificationsService = {
    sendGradePostedEmail: jest.fn().mockResolvedValue(undefined)
  } as any;

  return {
    prisma,
    auditService,
    notificationsService,
    service: new FacultyService(prisma, auditService, notificationsService)
  };
}

describe("FacultyService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects roster access when the section is not owned by the faculty actor", async () => {
    const { prisma, service } = createFacultyService();
    prisma.section.findFirst.mockResolvedValue(null);
    prisma.section.findUnique.mockResolvedValue({ id: "section-1" });

    await expect(service.getSectionRoster("faculty-1", "section-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
  });

  it("loads roster for an owned section and audit-logs the roster view", async () => {
    const { prisma, auditService, service } = createFacultyService();
    prisma.section.findFirst.mockResolvedValue({
      id: "section-1",
      sectionCode: "CS201-A",
      course: { code: "CS201", title: "Data Structures" },
      term: { name: "Spring 2026" },
      meetingTimes: []
    });
    prisma.enrollment.findMany.mockResolvedValue([
      {
        id: "enr-1",
        status: "ENROLLED",
        student: {
          email: "student1@sis.edu",
          studentId: "S2601",
          studentProfile: { legalName: "Student One", programMajor: "CS", academicStatus: "Active" }
        }
      }
    ]);

    const roster = await service.getSectionRoster("faculty-1", "section-1");

    expect(roster.enrollments).toHaveLength(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "faculty-1",
        action: "faculty_roster_view",
        entityId: "section-1"
      })
    );
  });

  it("submits a grade only for an owned section and audit-logs the update", async () => {
    const { prisma, auditService, notificationsService, service } = createFacultyService();
    prisma.section.findFirst.mockResolvedValue({
      id: "section-1",
      sectionCode: "CS201-A",
      course: { code: "CS201", title: "Data Structures" },
      term: { name: "Spring 2026" },
      meetingTimes: []
    });
    prisma.enrollment.findFirst.mockResolvedValue({
      id: "enr-1",
      status: "ENROLLED",
      student: {
        email: "student1@sis.edu",
        studentProfile: { legalName: "Student One" }
      }
    });
    prisma.enrollment.update.mockResolvedValue({
      id: "enr-1",
      status: "COMPLETED",
      finalGrade: "A"
    });

    const updated = await service.submitGrade("faculty-1", "section-1", "enr-1", "A");

    expect(prisma.enrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "enr-1" },
        data: expect.objectContaining({ finalGrade: "A", status: "COMPLETED" })
      })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "faculty-1",
        action: "faculty_grade_submit",
        entityId: "enr-1"
      })
    );
    expect(notificationsService.sendGradePostedEmail).toHaveBeenCalled();
    expect(updated.finalGrade).toBe("A");
  });

  it("rejects invalid final grades instead of persisting arbitrary strings", async () => {
    const { prisma, service } = createFacultyService();
    prisma.section.findFirst.mockResolvedValue({
      id: "section-1",
      sectionCode: "CS201-A",
      course: { code: "CS201", title: "Data Structures" },
      term: { name: "Spring 2026" },
      meetingTimes: []
    });

    await expect(service.submitGrade("faculty-1", "section-1", "enr-1", "PASS")).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(prisma.enrollment.findFirst).not.toHaveBeenCalled();
  });
});
