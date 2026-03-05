import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class AcademicsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTerms() {
    return this.prisma.term.findMany({ orderBy: { startDate: "desc" } });
  }

  async listCourses() {
    return this.prisma.course.findMany({
      include: {
        prerequisiteLinks: {
          include: { prerequisiteCourse: true }
        }
      },
      orderBy: { code: "asc" }
    });
  }

  async getCourse(courseId: string, termId?: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        prerequisiteLinks: { include: { prerequisiteCourse: true } },
        sections: {
          where: termId ? { termId } : undefined,
          include: {
            term: true,
            meetingTimes: true
          },
          orderBy: { sectionCode: "asc" }
        }
      }
    });

    if (!course) {
      throw new NotFoundException({ code: "COURSE_NOT_FOUND", message: "Course not found" });
    }

    return course;
  }

  async listSections(termId?: string, courseId?: string) {
    return this.prisma.section.findMany({
      where: {
        termId: termId || undefined,
        courseId: courseId || undefined
      },
      include: {
        course: {
          include: {
            prerequisiteLinks: {
              include: { prerequisiteCourse: true }
            }
          }
        },
        term: true,
        meetingTimes: true,
        enrollments: {
          where: {
            status: { in: ["ENROLLED", "WAITLISTED"] }
          },
          select: { status: true }
        }
      },
      orderBy: [{ term: { startDate: "desc" } }, { sectionCode: "asc" }]
    });
  }
}
