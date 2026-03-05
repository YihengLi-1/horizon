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
import { AdminPermissionGuard } from "../common/admin-permission.guard";
import { RequireAdminPermissions } from "../common/admin-permission.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ok } from "../common/response";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionGuard)
@Roles("ADMIN")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("dashboard")
  @RequireAdminPermissions("dashboard:read")
  async dashboard() {
    return ok(await this.adminService.dashboard());
  }

  @Get("terms")
  @RequireAdminPermissions("terms:read")
  async listTerms() {
    return ok(await this.adminService.listTerms());
  }

  @Post("terms")
  @RequireAdminPermissions("terms:write")
  async createTerm(@Body(new ZodValidationPipe(createTermSchema)) body: unknown, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.createTerm(body as never, user.userId));
  }

  @Patch("terms/:id")
  @RequireAdminPermissions("terms:write")
  async updateTerm(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.updateTerm(id, body as never, user.userId));
  }

  @Delete("terms/:id")
  @RequireAdminPermissions("terms:write")
  async deleteTerm(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.deleteTerm(id, user.userId));
  }

  @Get("courses")
  @RequireAdminPermissions("courses:read")
  async listCourses() {
    return ok(await this.adminService.listCourses());
  }

  @Post("courses")
  @RequireAdminPermissions("courses:write")
  async createCourse(
    @Body(new ZodValidationPipe(createCourseSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.createCourse(body as never, user.userId));
  }

  @Patch("courses/:id")
  @RequireAdminPermissions("courses:write")
  async updateCourse(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.updateCourse(id, body as never, user.userId));
  }

  @Delete("courses/:id")
  @RequireAdminPermissions("courses:write")
  async deleteCourse(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.deleteCourse(id, user.userId));
  }

  @Get("sections")
  @RequireAdminPermissions("sections:read")
  async listSections() {
    return ok(await this.adminService.listSections());
  }

  @Post("sections")
  @RequireAdminPermissions("sections:write")
  async createSection(
    @Body(new ZodValidationPipe(createSectionSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.createSection(body as never, user.userId));
  }

  @Patch("sections/:id")
  @RequireAdminPermissions("sections:write")
  async updateSection(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.updateSection(id, body as never, user.userId));
  }

  @Delete("sections/:id")
  @RequireAdminPermissions("sections:write")
  async deleteSection(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.deleteSection(id, user.userId));
  }

  @Post("sections/:id/notify")
  @RequireAdminPermissions("sections:write")
  async notifySection(
    @Param("id") id: string,
    @Body() body: { subject: string; message: string },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.notifySection(id, body.subject, body.message, user.userId));
  }

  @Get("enrollments")
  @RequireAdminPermissions("enrollments:read")
  async listEnrollments(
    @Query("termId") termId?: string,
    @Query("sectionId") sectionId?: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ) {
    return ok(
      await this.adminService.listEnrollments({
        termId,
        sectionId,
        status,
        search,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined
      })
    );
  }

  @Patch("enrollments/:id")
  @RequireAdminPermissions("enrollments:write")
  async updateEnrollment(
    @Param("id") id: string,
    @Body() body: { status?: string; finalGrade?: string },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.updateEnrollment(id, body, user.userId));
  }

  @Post("enrollments/grade")
  @RequireAdminPermissions("enrollments:write")
  async updateGrade(
    @Body(new ZodValidationPipe(updateGradeSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.updateGrade(body as never, user.userId));
  }

  @Get("waitlist")
  @RequireAdminPermissions("waitlist:read")
  async listWaitlist(@Query("sectionId") sectionId?: string) {
    return ok(await this.adminService.listWaitlist(sectionId));
  }

  @Post("waitlist/promote")
  @RequireAdminPermissions("waitlist:promote")
  async promoteWaitlist(
    @Body(new ZodValidationPipe(promoteWaitlistSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.promoteWaitlist(body as never, user.userId));
  }

  @Get("invite-codes")
  @RequireAdminPermissions("invite-codes:read")
  async listInviteCodes() {
    return ok(await this.adminService.listInviteCodes());
  }

  @Post("invite-codes")
  @RequireAdminPermissions("invite-codes:write")
  async createInviteCode(
    @Body(new ZodValidationPipe(createInviteCodeSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.createInviteCode(body as never, user.userId));
  }

  @Patch("invite-codes/:id")
  @RequireAdminPermissions("invite-codes:write")
  async updateInviteCode(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.updateInviteCode(id, body as never, user.userId));
  }

  @Get("audit-logs")
  @RequireAdminPermissions("audit:read")
  async listAuditLogs(
    @Query("limit") limit?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("action") action?: string,
    @Query("entityType") entityType?: string,
    @Query("search") search?: string
  ) {
    return ok(
      await this.adminService.listAuditLogs({
        limit: limit ? Number(limit) : undefined,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        action,
        entityType,
        search
      })
    );
  }

  @Get("audit-logs/integrity")
  @RequireAdminPermissions("audit:read")
  async verifyAuditIntegrity(@Query("limit") limit?: string) {
    return ok(await this.adminService.verifyAuditIntegrity(limit ? Number(limit) : undefined));
  }

  @Post("import/students")
  @RequireAdminPermissions("import:write")
  async importStudents(
    @Body(new ZodValidationPipe(csvImportSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.importStudents(body as never, user.userId));
  }

  @Post("import/courses")
  @RequireAdminPermissions("import:write")
  async importCourses(
    @Body(new ZodValidationPipe(csvImportSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.importCourses(body as never, user.userId));
  }

  @Post("import/sections")
  @RequireAdminPermissions("import:write")
  async importSections(
    @Body(new ZodValidationPipe(csvImportSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.importSections(body as never, user.userId));
  }
}
