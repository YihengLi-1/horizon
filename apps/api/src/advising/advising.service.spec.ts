import { ForbiddenException } from "@nestjs/common";
import { AdvisingService } from "./advising.service";

function createAdvisingService() {
  const prisma = {
    advisorAssignment: {
      findMany: jest.fn(),
      findFirst: jest.fn()
    },
    user: {
      findFirst: jest.fn()
    },
    advisorNote: {
      findMany: jest.fn(),
      create: jest.fn()
    }
  } as any;

  const auditService = {
    log: jest.fn().mockResolvedValue(undefined)
  } as any;

  return {
    prisma,
    auditService,
    service: new AdvisingService(prisma, auditService)
  };
}

describe("AdvisingService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects advisee overview access when the student is not assigned to the advisor actor", async () => {
    const { prisma, service } = createAdvisingService();
    prisma.advisorAssignment.findFirst.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({ id: "student-1" });

    await expect(service.getAdviseeOverview("advisor-1", "student-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.advisorNote.findMany).not.toHaveBeenCalled();
  });

  it("loads assigned advisee overview and audit-logs the read access", async () => {
    const { prisma, auditService, service } = createAdvisingService();
    prisma.advisorAssignment.findFirst.mockResolvedValue({ id: "assignment-1" });
    prisma.user.findFirst.mockResolvedValue({
      id: "student-1",
      email: "student1@sis.edu",
      studentProfile: {
        legalName: "Student One",
        programMajor: "Computer Science",
        academicStatus: "Active",
        enrollmentStatus: "Continuing"
      },
      enrollments: [],
      adviseeAssignments: []
    });
    prisma.advisorNote.findMany.mockResolvedValue([
      { id: "note-1", body: "Follow up after registration", createdAt: new Date("2026-01-01T00:00:00Z") }
    ]);

    const overview = await service.getAdviseeOverview("advisor-1", "student-1");

    expect(overview.student.email).toBe("student1@sis.edu");
    expect(overview.notes).toHaveLength(1);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "advisor-1",
        action: "advisor_advisee_view",
        entityId: "student-1"
      })
    );
  });

  it("creates an advisor note only for an assigned advisee and audit-logs the write", async () => {
    const { prisma, auditService, service } = createAdvisingService();
    prisma.advisorAssignment.findFirst.mockResolvedValue({ id: "assignment-1" });
    prisma.advisorNote.create.mockResolvedValue({
      id: "note-1",
      advisorId: "advisor-1",
      studentId: "student-1",
      body: "Student plans to keep 15 credits."
    });

    const note = await service.addAdvisorNote("advisor-1", "student-1", "  Student plans to keep 15 credits.  ");

    expect(prisma.advisorNote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          advisorId: "advisor-1",
          studentId: "student-1",
          body: "Student plans to keep 15 credits."
        })
      })
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "advisor-1",
        action: "advisor_note_create",
        entityId: "student-1"
      })
    );
    expect(note.id).toBe("note-1");
  });

  it("rejects note creation when student is not assigned to this advisor", async () => {
    const { prisma, service } = createAdvisingService();
    prisma.advisorAssignment.findFirst.mockResolvedValue(null);
    // Student exists but is not in the advisor's list → ForbiddenException
    prisma.user.findFirst.mockResolvedValue({ id: "unassigned-student" });

    await expect(
      service.addAdvisorNote("advisor-1", "unassigned-student", "Some note")
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.advisorNote.create).not.toHaveBeenCalled();
  });

  describe("listAdvisees", () => {
    it("returns active assignments for the advisor", async () => {
      const { prisma, service } = createAdvisingService();
      prisma.advisorAssignment.findMany.mockResolvedValue([
        {
          id: "a1",
          assignedAt: new Date(),
          student: {
            id: "s1",
            email: "s1@sis.edu",
            studentId: "S001",
            studentProfile: {
              legalName: "Alice",
              programMajor: "CS",
              academicStatus: "Active",
              enrollmentStatus: "Continuing"
            }
          }
        }
      ]);

      const result = await service.listAdvisees("advisor-1");
      expect(result).toHaveLength(1);
      expect(prisma.advisorAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { advisorId: "advisor-1", active: true }
        })
      );
    });

    it("returns empty array when advisor has no active advisees", async () => {
      const { prisma, service } = createAdvisingService();
      prisma.advisorAssignment.findMany.mockResolvedValue([]);

      const result = await service.listAdvisees("advisor-1");
      expect(result).toHaveLength(0);
    });
  });

  it("loads advisee overview when student profile is absent", async () => {
    const { prisma, service } = createAdvisingService();
    prisma.advisorAssignment.findFirst.mockResolvedValue({ id: "a1" });
    prisma.user.findFirst.mockResolvedValue({
      id: "s1",
      email: "s1@sis.edu",
      studentProfile: null,
      enrollments: [],
      adviseeAssignments: []
    });
    prisma.advisorNote.findMany.mockResolvedValue([]);

    const result = await service.getAdviseeOverview("advisor-1", "s1");
    expect(result.student.id).toBe("s1");
    expect(result.notes).toHaveLength(0);
  });
});
