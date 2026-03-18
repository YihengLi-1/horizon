import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class AdvisingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async listAdvisees(advisorUserId: string) {
    const assignments = await this.prisma.advisorAssignment.findMany({
      where: {
        advisorId: advisorUserId,
        active: true
      },
      include: {
        student: {
          select: {
            id: true,
            email: true,
            studentId: true,
            studentProfile: {
              select: {
                legalName: true,
                programMajor: true,
                academicStatus: true,
                enrollmentStatus: true
              }
            }
          }
        }
      },
      orderBy: [{ assignedAt: "desc" }]
    });

    return assignments;
  }

  private async assertAssignedAdvisee(advisorUserId: string, studentId: string) {
    const assignment = await this.prisma.advisorAssignment.findFirst({
      where: {
        advisorId: advisorUserId,
        studentId,
        active: true
      }
    });

    if (!assignment) {
      const student = await this.prisma.user.findFirst({
        where: { id: studentId, role: "STUDENT", deletedAt: null },
        select: { id: true }
      });
      if (!student) {
        throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "学生不存在" });
      }

      throw new ForbiddenException({
        code: "ADVISEE_FORBIDDEN",
        message: "该学生不在您的辅导名单中"
      });
    }

    return assignment;
  }

  async getAdviseeOverview(advisorUserId: string, studentId: string) {
    await this.assertAssignedAdvisee(advisorUserId, studentId);

    const [student, notes] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: studentId, role: "STUDENT", deletedAt: null },
        include: {
          studentProfile: true,
          enrollments: {
            where: { deletedAt: null, status: { in: ["ENROLLED", "WAITLISTED", "COMPLETED"] } },
            include: {
              section: {
                include: {
                  course: true,
                  term: true
                }
              }
            },
            orderBy: { createdAt: "desc" }
          },
          adviseeAssignments: {
            where: { active: true },
            include: {
              advisor: {
                select: {
                  id: true,
                  email: true,
                  advisorProfile: {
                    select: { displayName: true, department: true, officeLocation: true }
                  }
                }
              }
            }
          }
        }
      }),
      this.prisma.advisorNote.findMany({
        where: { studentId, advisorId: advisorUserId },
        orderBy: { createdAt: "desc" }
      })
    ]);

    if (!student) {
      throw new NotFoundException({ code: "STUDENT_NOT_FOUND", message: "学生不存在" });
    }

    await this.auditService.log({
      actorUserId: advisorUserId,
      action: "advisor_advisee_view",
      entityType: "student",
      entityId: studentId,
      metadata: {
        notesVisible: notes.length
      }
    });

    return { student, notes };
  }

  async addAdvisorNote(advisorUserId: string, studentId: string, body: string) {
    await this.assertAssignedAdvisee(advisorUserId, studentId);
    if (!body.trim()) {
      throw new BadRequestException({ code: "ADVISOR_NOTE_EMPTY", message: "导师备注内容不能为空" });
    }

    const note = await this.prisma.advisorNote.create({
      data: {
        advisorId: advisorUserId,
        studentId,
        body: body.trim()
      }
    });

    await this.auditService.log({
      actorUserId: advisorUserId,
      action: "advisor_note_create",
      entityType: "student",
      entityId: studentId,
      metadata: { advisorNoteId: note.id }
    });

    return note;
  }
}
