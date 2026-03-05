import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  createCourseSchema,
  createInviteCodeSchema,
  createSectionSchema,
  createTermSchema,
  csvImportSchema,
  promoteWaitlistSchema,
  updateGradeSchema
} from "@sis/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ok } from "../common/response";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("dashboard")
  async dashboard() {
    return ok(await this.adminService.dashboard());
  }

  @Get("terms")
  async listTerms() {
    return ok(await this.adminService.listTerms());
  }

  @Post("terms")
  async createTerm(@Body(new ZodValidationPipe(createTermSchema)) body: unknown, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.createTerm(body as never, user.userId));
  }

  @Patch("terms/:id")
  async updateTerm(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.updateTerm(id, body as never, user.userId));
  }

  @Delete("terms/:id")
  async deleteTerm(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.deleteTerm(id, user.userId));
  }

  @Get("courses")
  async listCourses() {
    return ok(await this.adminService.listCourses());
  }

  @Post("courses")
  async createCourse(
    @Body(new ZodValidationPipe(createCourseSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.createCourse(body as never, user.userId));
  }

  @Patch("courses/:id")
  async updateCourse(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.updateCourse(id, body as never, user.userId));
  }

  @Delete("courses/:id")
  async deleteCourse(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.deleteCourse(id, user.userId));
  }

  @Get("sections")
  async listSections() {
    return ok(await this.adminService.listSections());
  }

  @Post("sections")
  async createSection(
    @Body(new ZodValidationPipe(createSectionSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.createSection(body as never, user.userId));
  }

  @Patch("sections/:id")
  async updateSection(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.updateSection(id, body as never, user.userId));
  }

  @Delete("sections/:id")
  async deleteSection(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.deleteSection(id, user.userId));
  }

  @Get("enrollments")
  async listEnrollments(@Query("termId") termId?: string, @Query("sectionId") sectionId?: string) {
    return ok(await this.adminService.listEnrollments(termId, sectionId));
  }

  @Patch("enrollments/:id")
  async updateEnrollment(
    @Param("id") id: string,
    @Body() body: { status?: string; finalGrade?: string },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.updateEnrollment(id, body, user.userId));
  }

  @Post("enrollments/grade")
  async updateGrade(
    @Body(new ZodValidationPipe(updateGradeSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.updateGrade(body as never, user.userId));
  }

  @Get("waitlist")
  async listWaitlist(@Query("sectionId") sectionId?: string) {
    return ok(await this.adminService.listWaitlist(sectionId));
  }

  @Post("waitlist/promote")
  async promoteWaitlist(
    @Body(new ZodValidationPipe(promoteWaitlistSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.promoteWaitlist(body as never, user.userId));
  }

  @Get("invite-codes")
  async listInviteCodes() {
    return ok(await this.adminService.listInviteCodes());
  }

  @Post("invite-codes")
  async createInviteCode(
    @Body(new ZodValidationPipe(createInviteCodeSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.createInviteCode(body as never, user.userId));
  }

  @Patch("invite-codes/:id")
  async updateInviteCode(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.updateInviteCode(id, body as never, user.userId));
  }

  @Get("audit-logs")
  async listAuditLogs(@Query("limit") limit?: string) {
    return ok(await this.adminService.listAuditLogs(limit ? Number(limit) : undefined));
  }

  @Post("import/students")
  async importStudents(
    @Body(new ZodValidationPipe(csvImportSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.importStudents(body as never, user.userId));
  }

  @Post("import/courses")
  async importCourses(
    @Body(new ZodValidationPipe(csvImportSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.importCourses(body as never, user.userId));
  }

  @Post("import/sections")
  async importSections(
    @Body(new ZodValidationPipe(csvImportSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.importSections(body as never, user.userId));
  }
}
