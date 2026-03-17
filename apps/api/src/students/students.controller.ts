import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { changePasswordSchema, createStudentSchema, updateProfileSchema } from "@sis/shared";
import { Response } from "express";
import { AdminPermissionGuard } from "../common/admin-permission.guard";
import { RequireAdminPermissions } from "../common/admin-permission.decorator";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Public } from "../common/public.decorator";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ok } from "../common/response";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { RateSectionDto } from "../registration/dto/rate-section.dto";
import { StudentsService } from "./students.service";

@Controller("students")
@UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Roles("STUDENT", "ADMIN")
  @Get("me")
  async getMe(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getMyProfile(user.userId));
  }

  @Roles("STUDENT")
  @Get("notifications")
  async getNotifications(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getNotifications(user.userId));
  }

  @Roles("STUDENT")
  @Get("transcript")
  async getTranscript(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getTranscript(user.userId));
  }

  @Roles("STUDENT")
  @Get("cart")
  async getCart(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getCart(user.userId));
  }

  @Roles("STUDENT", "ADMIN")
  @Get("schedule/ical")
  async getIcal(
    @Query("termId") termId: string,
    @Req() req: { user?: { userId?: string; sub?: string } },
    @Res() res: Response
  ) {
    const userId = req.user?.userId ?? req.user?.sub ?? "";
    const ical = await this.studentsService.generateIcal(userId, termId);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="schedule.ics"');
    res.send(ical);
  }

  @Roles("STUDENT")
  @Get("enrollment-receipt")
  async getEnrollmentReceipt(@CurrentUser() user: { userId: string }, @Query("termId") termId?: string) {
    return ok(await this.studentsService.getEnrollmentReceipt(user.userId, termId));
  }

  @Roles("STUDENT")
  @Get("standing")
  async getStanding(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getAcademicStanding(user.userId));
  }

  @Roles("STUDENT")
  @Get("recommendations")
  async getRecommendations(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getCourseRecommendations(user.userId));
  }

  @Roles("STUDENT")
  @Get("course-history")
  async getCourseHistory(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getCourseHistory(user.userId));
  }

  @Roles("STUDENT")
  @Get("graduation-checklist")
  async getGraduationChecklist(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getGraduationChecklist(user.userId));
  }

  @Roles("STUDENT")
  @Get("enrollment-log")
  async getEnrollmentLog(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getEnrollmentLog(user.userId));
  }

  @Roles("STUDENT")
  @Get("term-compare")
  async getTermCompare(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getTermCompare(user.userId));
  }

  @Roles("STUDENT")
  @Get("honors")
  async getHonors(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getStudentHonors(user.userId));
  }

  @Roles("STUDENT")
  @Get("profile-completeness")
  async getProfileCompleteness(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getProfileCompleteness(user.userId));
  }

  @Roles("STUDENT", "ADMIN")
  @Post("schedule/share")
  async shareSchedule(@CurrentUser() user: { userId: string }, @Body() body: { termId?: string }) {
    return ok(await this.studentsService.createScheduleSnapshot(user.userId, body.termId ?? ""));
  }

  @Public()
  @Get("schedule/snapshot/:token")
  async getScheduleSnapshot(@Param("token") token: string) {
    return ok(await this.studentsService.getScheduleSnapshot(token));
  }

  @Roles("STUDENT", "ADMIN")
  @Get("announcements")
  async getAnnouncements(@CurrentUser() user: { role: "STUDENT" | "ADMIN" }) {
    return ok(await this.studentsService.getAnnouncements(user.role));
  }

  @Public()
  @Get("announcements/public")
  async getPublicAnnouncements(@Query("audience") audience?: string) {
    return ok(await this.studentsService.getPublicAnnouncements(audience));
  }

  @Roles("STUDENT")
  @Get("ratings")
  async getMyRatings(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getMyRatings(user.userId));
  }

  @Roles("STUDENT", "ADMIN")
  @Get("recommended")
  async getRecommended(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getRecommendedSections(user.userId));
  }

  @Roles("STUDENT")
  @Get("gpa-stats")
  async getGpaStats(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getGpaStats(user.userId));
  }

  @Roles("STUDENT")
  @Post("rate-section")
  async rateSection(@CurrentUser() user: { userId: string }, @Body() body: RateSectionDto) {
    return ok(await this.studentsService.rateSection(user.userId, body.sectionId, body.rating, body.comment, body.difficulty, body.workload, body.wouldRecommend));
  }

  @Roles("STUDENT", "ADMIN")
  @Patch("me")
  async updateMe(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(updateProfileSchema)) body: unknown
  ) {
    return ok(await this.studentsService.updateMyProfile(user.userId, body as never));
  }

  @Roles("STUDENT")
  @Patch("profile")
  async updateProfile(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(updateProfileSchema)) body: unknown
  ) {
    return ok(await this.studentsService.updateStudentProfile(user.userId, body as never));
  }

  @Roles("STUDENT", "ADMIN")
  @Post("me/change-password")
  async changePassword(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(changePasswordSchema)) body: unknown
  ) {
    return ok(await this.studentsService.changePassword(user.userId, body as never));
  }

  @Roles("STUDENT")
  @Post("contact")
  async contact(
    @CurrentUser() user: { userId: string },
    @Body() body: { subject?: string; message?: string; category?: string }
  ) {
    return ok(await this.studentsService.submitContactMessage(user.userId, body));
  }

  @Roles("STUDENT")
  @Get("appeals")
  async getMyAppeals(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getMyGradeAppeals(user.userId));
  }

  @Roles("STUDENT")
  @Post("appeals")
  async submitAppeal(
    @CurrentUser() user: { userId: string },
    @Body() body: { enrollmentId: string; contestedGrade: string; requestedGrade?: string; reason: string }
  ) {
    return ok(await this.studentsService.submitGradeAppeal(user.userId, body));
  }

  @Roles("STUDENT")
  @Get("completed-courses")
  async getCompletedCourses(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getCompletedCourseCodes(user.userId));
  }

  @Get("my-advisor")
  async getMyAdvisor(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getMyAdvisor(user.userId));
  }

  @Roles("ADMIN")
  @RequireAdminPermissions("students:read")
  @Get()
  async adminList(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string
  ) {
    return ok(
      await this.studentsService.adminListStudents({
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        search
      })
    );
  }

  @Roles("ADMIN")
  @RequireAdminPermissions("students:read")
  @Get(":id")
  async adminGet(@Param("id") id: string) {
    return ok(await this.studentsService.adminGetStudent(id));
  }

  @Roles("ADMIN")
  @RequireAdminPermissions("students:write")
  @Post()
  async adminCreate(@Body(new ZodValidationPipe(createStudentSchema)) body: unknown, @CurrentUser() user: { userId: string }) {
    const payload = body as {
      email: string;
      password: string;
      studentId: string;
      legalName: string;
    };
    return ok(await this.studentsService.adminCreateStudent(payload, user.userId));
  }

  @Roles("ADMIN")
  @RequireAdminPermissions("students:write")
  @Patch(":id")
  async adminUpdate(
    @Param("id") id: string,
    @Body() body: {
      email?: string;
      studentId?: string;
      legalName?: string;
      programMajor?: string;
      enrollmentStatus?: string;
      academicStatus?: string;
    },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.studentsService.adminUpdateStudent(id, body, user.userId));
  }

  @Roles("ADMIN")
  @RequireAdminPermissions("students:write")
  @Delete(":id")
  async adminDelete(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.adminDeleteStudent(id, user.userId));
  }
}
