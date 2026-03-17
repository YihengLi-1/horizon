import { Controller, Get, Header, Param, Post, Query, UseGuards } from "@nestjs/common";
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
  async listSections(
    @CurrentUser() user: { userId: string },
    @Query("termId") termId?: string,
    @Query("courseId") courseId?: string
  ) {
    return ok(await this.academicsService.listSections(termId, courseId, user.userId));
  }

  @Public()
  @Roles()
  @Get("sections/:id/grade-distribution")
  async getGradeDistribution(@Param("id") id: string) {
    return ok(await this.academicsService.getSectionGradeDistribution(id));
  }

  @Get("sections/:id/rating-summary")
  async getRatingSummary(@Param("id") id: string) {
    return ok(await this.academicsService.getSectionRatingSummary(id));
  }

  @Get("sections/:id/reviews")
  async getSectionReviews(@Param("id") id: string) {
    return ok(await this.academicsService.getSectionReviews(id));
  }

  @Get("courses/:id/pairings")
  async getCoursePairings(@Param("id") id: string, @Query("limit") limit?: string) {
    return ok(await this.academicsService.getCoursePairings(id, limit ? parseInt(limit) : 5));
  }

  @Roles("ADMIN")
  @Post("pairings/recompute")
  async recomputePairings() {
    return ok(await this.academicsService.recomputeCoursePairings());
  }

  @Get("calendar-events")
  async listCalendarEvents(@Query("termId") termId?: string) {
    return ok(await this.academicsService.listCalendarEvents(termId));
  }
}
