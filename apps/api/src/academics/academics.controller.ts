import { Controller, Get, Header, Param, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Public } from "../common/public.decorator";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ok } from "../common/response";
import { AcademicsService } from "./academics.service";

@Controller("academics")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("STUDENT", "ADMIN")
export class AcademicsController {
  constructor(private readonly academicsService: AcademicsService) {}

  @Get("terms")
  @Header("Cache-Control", "public, max-age=300")
  async listTerms(@CurrentUser() _user: { userId: string }) {
    return ok(await this.academicsService.listTerms());
  }

  @Get("courses")
  async listCourses() {
    return ok(await this.academicsService.listCourses());
  }

  @Get("courses/:id")
  async getCourse(@Param("id") id: string, @Query("termId") termId?: string) {
    return ok(await this.academicsService.getCourse(id, termId));
  }

  @Get("sections")
  async listSections(@Query("termId") termId?: string, @Query("courseId") courseId?: string) {
    return ok(await this.academicsService.listSections(termId, courseId));
  }

  @Public()
  @Roles()
  @Get("sections/:id/grade-distribution")
  async getGradeDistribution(@Param("id") id: string) {
    return ok(await this.academicsService.getSectionGradeDistribution(id));
  }
}
