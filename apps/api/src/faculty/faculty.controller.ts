import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ok } from "../common/response";
import { FacultyService } from "./faculty.service";

@Controller("faculty")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("FACULTY")
export class FacultyController {
  constructor(private readonly facultyService: FacultyService) {}

  @Get("sections")
  async listOwnedSections(@CurrentUser() user: { userId: string }) {
    return ok(await this.facultyService.listOwnedSections(user.userId));
  }

  @Get("sections/:id/roster")
  async getSectionRoster(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.facultyService.getSectionRoster(user.userId, id));
  }

  @Patch("sections/:sectionId/grades/:enrollmentId")
  async submitGrade(
    @Param("sectionId") sectionId: string,
    @Param("enrollmentId") enrollmentId: string,
    @Body() body: { finalGrade?: string },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.facultyService.submitGrade(user.userId, sectionId, enrollmentId, body.finalGrade?.trim() || ""));
  }

  @Get("grade-stats")
  async gradeStats(@CurrentUser() user: { userId: string }) {
    return ok(await this.facultyService.getGradeStats(user.userId));
  }
}
