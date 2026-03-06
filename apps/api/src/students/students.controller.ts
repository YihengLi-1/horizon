import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { changePasswordSchema, createStudentSchema, updateProfileSchema } from "@sis/shared";
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
  @Post("rate-section")
  async rateSection(@CurrentUser() user: { userId: string }, @Body() body: RateSectionDto) {
    return ok(await this.studentsService.rateSection(user.userId, body.sectionId, body.rating, body.comment));
  }

  @Roles("STUDENT", "ADMIN")
  @Patch("me")
  async updateMe(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(updateProfileSchema)) body: unknown
  ) {
    return ok(await this.studentsService.updateMyProfile(user.userId, body as never));
  }

  @Roles("STUDENT", "ADMIN")
  @Post("me/change-password")
  async changePassword(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(changePasswordSchema)) body: unknown
  ) {
    return ok(await this.studentsService.changePassword(user.userId, body as never));
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
