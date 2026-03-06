import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
  createCourseSchema,
  createInviteCodeSchema,
  createSectionSchema,
  createTermSchema,
  csvImportSchema,
  promoteWaitlistSchema
} from "@sis/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { AdminPermissionGuard } from "../common/admin-permission.guard";
import { RequireAdminPermissions } from "../common/admin-permission.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ok } from "../common/response";
import { getWebhooks, registerWebhook, removeWebhook } from "../common/webhook";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BulkNotifyDto } from "./dto/bulk-notify.dto";
import { CreateAnnouncementDto } from "./dto/create-announcement.dto";
import { UpdateCourseDto } from "./dto/update-course.dto";
import { UpdateGradeDto } from "./dto/update-grade.dto";
import { UpdateSectionDto } from "./dto/update-section.dto";
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

  @Get("reports")
  @RequireAdminPermissions("dashboard:read")
  async reports() {
    return ok(await this.adminService.getReportsSummary());
  }

  @Get("students")
  @RequireAdminPermissions("students:read")
  async listStudents(@Query("page") page?: string, @Query("pageSize") pageSize?: string, @Query("search") search?: string) {
    return ok(
      await this.adminService.getPaginatedStudents({
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        search
      })
    );
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

  @Patch("terms/:id/toggle-registration")
  @RequireAdminPermissions("terms:write")
  async toggleRegistration(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.toggleTermRegistration(id, user.userId));
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
  async updateCourse(@Param("id") id: string, @Body() body: UpdateCourseDto, @CurrentUser() user: { userId: string }) {
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
  async updateSection(@Param("id") id: string, @Body() body: UpdateSectionDto, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.updateSection(id, body as never, user.userId));
  }

  @Delete("sections/:id")
  @RequireAdminPermissions("sections:write")
  async deleteSection(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.deleteSection(id, user.userId));
  }

  @Get("sections/:id/enrollments")
  @RequireAdminPermissions("sections:read")
  async listSectionEnrollments(@Param("id") id: string) {
    return ok(await this.adminService.listSectionEnrollments(id));
  }

  @Post("sections/:id/notify")
  @RequireAdminPermissions("sections:write")
  async notifySection(
    @Param("id") id: string,
    @Body() body: BulkNotifyDto,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.notifySection(id, body.subject, body.message, user.userId));
  }

  @Post("sections/:id/clone")
  @RequireAdminPermissions("sections:write")
  async cloneSection(
    @Param("id") id: string,
    @Body() body: { targetTermId?: string },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.cloneSection(id, user.userId, body.targetTermId));
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

  @Delete("enrollments/:id")
  @RequireAdminPermissions("enrollments:write")
  async adminDropEnrollment(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.adminDropEnrollment(id, user.userId));
  }

  @Post("enrollments/grade")
  @RequireAdminPermissions("enrollments:write")
  async updateGrade(
    @Body() body: UpdateGradeDto,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.updateGrade(body, user.userId));
  }

  @Patch("enrollments/grade")
  @RequireAdminPermissions("enrollments:write")
  async updateEnrollmentGrade(
    @Body() body: { studentId: string; sectionId: string; grade: string },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.updateEnrollmentGrade(body.studentId, body.sectionId, body.grade, user.userId));
  }

  @Post("enrollments/bulk-approve")
  @RequireAdminPermissions("enrollments:write")
  async bulkApprove(
    @Body() body: { ids: string[] },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.bulkApproveEnrollments(body.ids, user.userId));
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

  @Delete("invite-codes/:id")
  @RequireAdminPermissions("invite-codes:write")
  async deleteInviteCode(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.adminService.deleteInviteCode(id, user.userId));
  }

  @Get("announcements")
  @RequireAdminPermissions("announcements:read")
  async getAnnouncements() {
    return ok(await this.adminService.getAnnouncements());
  }

  @Get("settings/system")
  @RequireAdminPermissions("dashboard:read")
  async getSystemSettings() {
    return ok(await this.adminService.getSystemSettings());
  }

  @Put("settings/system")
  @RequireAdminPermissions("dashboard:write")
  async updateSystemSetting(
    @Body() body: { key: string; value: string },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.updateSystemSetting(body.key, body.value, user.userId));
  }

  @Post("announcements")
  @RequireAdminPermissions("announcements:write")
  async createAnnouncement(@Body() body: CreateAnnouncementDto) {
    return ok(await this.adminService.createAnnouncement(body));
  }

  @Patch("announcements/:id")
  @RequireAdminPermissions("announcements:write")
  async updateAnnouncement(@Param("id") id: string, @Body() body: Partial<CreateAnnouncementDto>) {
    return ok(await this.adminService.updateAnnouncement(id, body));
  }

  @Delete("announcements/:id")
  @RequireAdminPermissions("announcements:write")
  async deleteAnnouncement(@Param("id") id: string) {
    return ok(await this.adminService.deleteAnnouncement(id));
  }

  @Get("webhooks")
  @RequireAdminPermissions("audit:read")
  async listWebhooks() {
    return ok({ webhooks: getWebhooks() });
  }

  @Post("webhooks")
  @RequireAdminPermissions("announcements:write")
  async createWebhook(@Body() body: { url: string; events: string[]; secret?: string }) {
    return ok({
      id: registerWebhook(body.url, body.events, body.secret ?? ""),
      message: "Webhook registered"
    });
  }

  @Delete("webhooks/:id")
  @RequireAdminPermissions("announcements:write")
  async deleteWebhook(@Param("id") id: string) {
    removeWebhook(id);
    return ok({ removed: true });
  }

  @Patch("users/:id/role")
  @RequireAdminPermissions("students:write")
  async updateRole(
    @Param("id") id: string,
    @Body() body: { role: "STUDENT" | "ADMIN" },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.updateUserRole(id, body.role, user.userId));
  }

  @Get("users/:id/login-history")
  @RequireAdminPermissions("students:read")
  async getUserLoginHistory(@Param("id") id: string) {
    return ok(await this.adminService.getUserLoginHistory(id));
  }

  @Get("stats/registration")
  @RequireAdminPermissions("dashboard:read")
  async getRegistrationStats() {
    return ok(await this.adminService.getRegistrationStats());
  }

  @Get("stats/enrollment-trend")
  @RequireAdminPermissions("dashboard:read")
  async getEnrollmentTrend(@Query("days") days = "14") {
    return ok(await this.adminService.getEnrollmentTrend(Math.min(parseInt(days, 10) || 14, 90)));
  }

  @Get("stats/dept-breakdown")
  @RequireAdminPermissions("dashboard:read")
  async getDeptBreakdown() {
    return ok(await this.adminService.getDeptBreakdown());
  }

  @Get("stats/top-sections")
  @RequireAdminPermissions("dashboard:read")
  async getTopSections() {
    return ok(await this.adminService.getTopSections());
  }

  @Get("stats/gpa-distribution")
  @RequireAdminPermissions("dashboard:read")
  async getGpaDistribution() {
    return ok(await this.adminService.getGpaDistribution());
  }

  @Get("notification-log")
  @RequireAdminPermissions("audit:read")
  async getNotificationLog(@Query("userId") userId?: string, @Query("page") page = "1") {
    return ok(await this.adminService.getNotificationLog(userId, parseInt(page, 10) || 1));
  }

  @Get("data-quality")
  @RequireAdminPermissions("dashboard:read")
  async getDataQuality() {
    return ok(await this.adminService.getDataQuality());
  }

  @Get("reports/summary")
  @RequireAdminPermissions("dashboard:read")
  async getReportsSummary() {
    return ok(await this.adminService.getReportsSummary());
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
