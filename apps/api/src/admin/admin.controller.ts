import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import {
  assignAdvisorSchema,
  createHoldSchema,
  createAdvisorSchema,
  createCourseSchema,
  createFacultySchema,
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

  @Get("faculty")
  @RequireAdminPermissions("students:read")
  async listFaculty() {
    return ok(await this.adminService.listFaculty());
  }

  @Post("faculty")
  @RequireAdminPermissions("students:write")
  async createFaculty(
    @Body(new ZodValidationPipe(createFacultySchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.createFaculty(body as never, user.userId));
  }

  @Get("advisors")
  @RequireAdminPermissions("students:read")
  async listAdvisors() {
    return ok(await this.adminService.listAdvisors());
  }

  @Post("advisors")
  @RequireAdminPermissions("students:write")
  async createAdvisor(
    @Body(new ZodValidationPipe(createAdvisorSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.createAdvisor(body as never, user.userId));
  }

  @Post("advisor-assignments")
  @RequireAdminPermissions("students:write")
  async assignAdvisor(
    @Body(new ZodValidationPipe(assignAdvisorSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.assignAdvisor(body as never, user.userId));
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

  @Post("sections/:id/grades")
  @RequireAdminPermissions("enrollments:write")
  async bulkUpdateSectionGrades(
    @Param("id") id: string,
    @Body() body: { grades: Array<{ enrollmentId: string; grade: string; gradePoints?: number }> },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.bulkUpdateGrades(id, body.grades ?? [], user.userId));
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

  @Get("pending-overloads")
  @RequireAdminPermissions("enrollments:read")
  async listPendingOverloads() {
    return ok(await this.adminService.getPendingOverloads());
  }

  @Patch("pending-overloads/:enrollmentId")
  @RequireAdminPermissions("enrollments:write")
  async decidePendingOverload(
    @Param("enrollmentId") enrollmentId: string,
    @Body() body: { approve?: boolean },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.decidePendingOverload(enrollmentId, Boolean(body.approve), user.userId));
  }

  @Get("waitlist")
  @RequireAdminPermissions("waitlist:read")
  async listWaitlist(@Query("sectionId") sectionId?: string) {
    return ok(await this.adminService.listWaitlist(sectionId));
  }

  @Get("holds")
  @RequireAdminPermissions("students:read")
  async listAdminHolds(@CurrentUser() user: { userId: string }, @Query("studentId") studentId?: string) {
    return ok(await this.adminService.getAdminHolds(user.userId, studentId));
  }

  @Post("holds")
  @RequireAdminPermissions("students:write")
  async createAdminHold(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(createHoldSchema)) body: unknown
  ) {
    return ok(await this.adminService.createAdminHold(user.userId, body as never));
  }

  @Delete("holds/:id")
  @RequireAdminPermissions("students:write")
  async removeAdminHold(
    @Param("id") id: string,
    @CurrentUser() user: { userId: string },
    @Body() body?: { resolutionNote?: string | null }
  ) {
    return ok(await this.adminService.removeAdminHold(user.userId, id, body?.resolutionNote));
  }

  @Post("waitlist/promote")
  @RequireAdminPermissions("waitlist:promote")
  async promoteWaitlist(
    @Body(new ZodValidationPipe(promoteWaitlistSchema)) body: unknown,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.promoteWaitlist(body as never, user.userId));
  }

  @Get("prereq-waivers")
  @RequireAdminPermissions("enrollments:read")
  async listPrereqWaivers(@CurrentUser() user: { userId: string }, @Query("status") status?: string) {
    return ok(await this.adminService.getPrereqWaivers(user.userId, status));
  }

  @Patch("prereq-waivers/:requestId")
  @RequireAdminPermissions("enrollments:write")
  async decidePrereqWaiver(
    @CurrentUser() user: { userId: string },
    @Param("requestId") requestId: string,
    @Body() body: { status: "APPROVED" | "REJECTED"; adminNote?: string | null }
  ) {
    return ok(await this.adminService.decidePrereqWaiver(user.userId, requestId, body));
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
  async getReportsSummary(@Query("termId") termId?: string) {
    return ok(await this.adminService.getReportsSummary(termId));
  }

  @Get("students/at-risk")
  @RequireAdminPermissions("students:read")
  async getAtRiskStudents(@Query("termId") termId?: string) {
    return ok(await this.adminService.getAtRiskStudents(termId));
  }

  @Get("students/:id")
  @RequireAdminPermissions("students:read")
  async getStudentById(@Param("id") id: string) {
    return ok(await this.adminService.getStudentById(id));
  }

  @Get("instructors/analytics")
  @RequireAdminPermissions("sections:read")
  async getInstructorAnalytics() {
    return ok(await this.adminService.getInstructorAnalytics());
  }

  @Get("cohort-analytics")
  @RequireAdminPermissions("students:read")
  async getCohortAnalytics() {
    return ok(await this.adminService.getCohortAnalytics());
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

  // ── Grade Appeals ──────────────────────────────────────────────────
  @Get("grade-appeals")
  @RequireAdminPermissions("students:read")
  async listGradeAppeals(@Query("status") status?: string) {
    return ok(await this.adminService.listGradeAppeals(status));
  }

  @Patch("grade-appeals/:id/review")
  @RequireAdminPermissions("students:write")
  async reviewGradeAppeal(
    @Param("id") id: string,
    @CurrentUser() user: { userId: string },
    @Body() body: { decision: "APPROVED" | "REJECTED"; adminNote: string; newGrade?: string }
  ) {
    return ok(await this.adminService.reviewGradeAppeal(user.userId, id, body.decision, body.adminNote, body.newGrade));
  }

  // ── Cohort Messaging ───────────────────────────────────────────────
  @Post("cohort-message")
  @RequireAdminPermissions("students:write")
  async sendCohortMessage(
    @CurrentUser() user: { userId: string },
    @Body() body: { cohortYear: string; subject: string; body: string }
  ) {
    return ok(await this.adminService.sendCohortMessage(body.cohortYear, body.subject, body.body, user.userId));
  }

  // ── Section Enrollment Timeline ────────────────────────────────────
  @Get("sections/:id/enrollment-timeline")
  @RequireAdminPermissions("sections:read")
  async getSectionEnrollmentTimeline(@Param("id") id: string) {
    return ok(await this.adminService.getSectionEnrollmentTimeline(id));
  }

  // ── Term Comparison ─────────────────────────────────────────────────
  @Get("term-comparison")
  @RequireAdminPermissions("students:read")
  async getTermComparison(
    @Query("termAId") termAId: string,
    @Query("termBId") termBId: string
  ) {
    return ok(await this.adminService.getTermComparison(termAId, termBId));
  }

  // ── Student Notes ────────────────────────────────────────────────────
  @Get("students/:id/notes")
  @RequireAdminPermissions("students:read")
  async getStudentNotes(@Param("id") id: string) {
    return ok(await this.adminService.getStudentNotes(id));
  }

  @Post("students/:id/notes")
  @RequireAdminPermissions("students:write")
  async createStudentNote(
    @Param("id") id: string,
    @CurrentUser() user: { userId: string },
    @Body() body: { content: string; flag?: string }
  ) {
    return ok(await this.adminService.createStudentNote(user.userId, id, body.content, body.flag));
  }

  @Delete("students/:studentId/notes/:noteId")
  @RequireAdminPermissions("students:write")
  async deleteStudentNote(
    @Param("studentId") studentId: string,
    @Param("noteId") noteId: string,
    @CurrentUser() user: { userId: string }
  ) {
    void studentId; // validated via studentId param for clarity
    return ok(await this.adminService.deleteStudentNote(user.userId, noteId));
  }

  @Get("student-tags/available")
  @RequireAdminPermissions("students:read")
  async getAvailableStudentTags() {
    return ok(await this.adminService.getAvailableStudentTags());
  }

  @Get("students/:id/tags")
  @RequireAdminPermissions("students:read")
  async getStudentTags(@Param("id") id: string) {
    return ok(await this.adminService.getStudentTags(id));
  }

  @Post("students/:id/tags")
  @RequireAdminPermissions("students:write")
  async setStudentTags(
    @Param("id") id: string,
    @Body() body: { tags: string[] },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.setStudentTags(user.userId, id, body.tags ?? []));
  }

  // ── Email Digest ────────────────────────────────────────────────────────
  @Get("digest-preview")
  @RequireAdminPermissions("dashboard:read")
  async digestPreview(@Query("termId") termId?: string) {
    return ok(await this.adminService.buildDigestPreview(termId));
  }

  @Post("digest-send")
  @RequireAdminPermissions("dashboard:read")
  async sendDigest(
    @CurrentUser() user: { userId: string },
    @Body() body: { email: string; termId?: string }
  ) {
    return ok(await this.adminService.sendDigestEmail(user.userId, body.email, body.termId));
  }

  // ── Section Demand Report ──────────────────────────────────────────────
  @Get("demand-report")
  @RequireAdminPermissions("sections:read")
  async getSectionDemandReport(@Query("termId") termId?: string) {
    return ok(await this.adminService.getSectionDemandReport(termId));
  }

  // ── Calendar Events ──────────────────────────────────────────────────
  @Post("calendar-events")
  @RequireAdminPermissions("dashboard:read")
  async createCalendarEvent(
    @CurrentUser() user: { userId: string },
    @Body() body: { title: string; description?: string; eventDate: string; endDate?: string; type?: string; termId?: string }
  ) {
    return ok(await this.adminService.createCalendarEvent(user.userId, body));
  }

  @Patch("calendar-events/:id")
  @RequireAdminPermissions("dashboard:read")
  async updateCalendarEvent(
    @Param("id") id: string,
    @CurrentUser() user: { userId: string },
    @Body() body: { title?: string; description?: string; eventDate?: string; endDate?: string; type?: string; termId?: string | null }
  ) {
    return ok(await this.adminService.updateCalendarEvent(user.userId, id, body));
  }

  @Delete("calendar-events/:id")
  @RequireAdminPermissions("dashboard:read")
  async deleteCalendarEvent(
    @Param("id") id: string,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.deleteCalendarEvent(user.userId, id));
  }

  // ── Unified Search ──────────────────────────────────────────────────
  @Get("search")
  @RequireAdminPermissions("students:read")
  async unifiedSearch(
    @Query("q") q: string,
    @Query("type") type?: "all" | "student" | "course" | "section"
  ) {
    return ok(await this.adminService.unifiedSearch(q ?? "", type ?? "all"));
  }

  // ── System Alerts ───────────────────────────────────────────────────
  @Get("alerts")
  @RequireAdminPermissions("dashboard:read")
  async getSystemAlerts() {
    return ok(await this.adminService.getSystemAlerts());
  }

  // ── Term Closeout ────────────────────────────────────────────────────
  @Get("closeout/preview")
  @RequireAdminPermissions("enrollments:write")
  async getCloseoutPreview(@Query("termId") termId: string) {
    return ok(await this.adminService.getTermCloseoutPreview(termId));
  }

  @Post("closeout/run")
  @RequireAdminPermissions("enrollments:write")
  async runCloseout(
    @Body() body: { termId: string; action: "enroll_to_completed" | "waitlist_to_dropped" | "pending_to_dropped" },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.bulkCloseOutTerm(body.termId, user.userId, body.action));
  }

  // ── Prereq Audit ─────────────────────────────────────────────────────
  @Get("prereq-audit")
  @RequireAdminPermissions("dashboard:read")
  async prereqAudit() {
    return ok(await this.adminService.getPrereqViolations());
  }

  // ── Course Offering History ───────────────────────────────────────────
  @Get("course-offering-history")
  @RequireAdminPermissions("dashboard:read")
  async courseOfferingHistory(@Query("courseId") courseId?: string) {
    return ok(await this.adminService.getCourseOfferingHistory(courseId));
  }

  // ── Bulk Email by Status ──────────────────────────────────────────────
  @Get("status-email/preview")
  @RequireAdminPermissions("dashboard:read")
  async statusEmailPreview(
    @Query("termId") termId: string,
    @Query("status") status: string
  ) {
    return ok(await this.adminService.previewStatusEmail(termId ?? "", status ?? "ENROLLED"));
  }

  @Post("status-email/send")
  @RequireAdminPermissions("dashboard:read")
  async sendStatusEmail(
    @Body() body: { termId: string; status: string; subject: string; body: string },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(
      await this.adminService.sendStatusEmail(
        body.termId ?? "",
        body.status ?? "ENROLLED",
        body.subject,
        body.body,
        user.userId
      )
    );
  }

  // ── Waitlist Analytics ────────────────────────────────────────────────
  @Get("waitlist-analytics")
  @RequireAdminPermissions("dashboard:read")
  async waitlistAnalytics(@Query("termId") termId?: string) {
    return ok(await this.adminService.getWaitlistAnalytics(termId));
  }

  // ── Graduation Clearance ──────────────────────────────────────────────
  @Get("graduation")
  @RequireAdminPermissions("students:read")
  async graduationClearance(@Query("minCredits") minCredits?: string) {
    return ok(await this.adminService.getGraduationClearance(minCredits ? Number(minCredits) : 120));
  }

  // ── Registration Heatmap ──────────────────────────────────────────────
  @Get("registration-heatmap")
  @RequireAdminPermissions("dashboard:read")
  async registrationHeatmap(@Query("termId") termId?: string) {
    return ok(await this.adminService.getRegistrationHeatmap(termId));
  }

  // ── Credit Load Distribution ──────────────────────────────────────────
  @Get("credit-load")
  @RequireAdminPermissions("dashboard:read")
  async creditLoadDistribution(@Query("termId") termId?: string) {
    return ok(await this.adminService.getCreditLoadDistribution(termId));
  }

  @Get("faculty-schedule")
  @RequireAdminPermissions("sections:read")
  async facultySchedule(@Query("termId") termId?: string) {
    return ok(await this.adminService.getFacultySchedule(termId));
  }

  @Get("capacity-plan")
  @RequireAdminPermissions("sections:read")
  async capacityPlan(@Query("termId") termId?: string) {
    return ok(await this.adminService.getCapacityPlan(termId));
  }

  @Get("student-progress")
  @RequireAdminPermissions("students:read")
  async studentProgress(@Query("termId") termId?: string, @Query("dept") dept?: string) {
    return ok(await this.adminService.getStudentProgress(termId, dept));
  }

  @Get("dropout-risk")
  @RequireAdminPermissions("students:read")
  async dropoutRisk() {
    return ok(await this.adminService.getDropoutRisk());
  }

  @Get("grade-distribution")
  @RequireAdminPermissions("dashboard:read")
  async gradeDistribution(@Query("termId") termId?: string, @Query("courseId") courseId?: string) {
    return ok(await this.adminService.getGradeDistribution(termId, courseId));
  }

  @Get("sections/:id/analytics")
  @RequireAdminPermissions("sections:read")
  async sectionAnalytics(@Param("id") id: string) {
    return ok(await this.adminService.getSectionAnalytics(id));
  }

  @Get("course-demand-compare")
  @RequireAdminPermissions("courses:read")
  async courseDemandCompare(@Query("courseId") courseId?: string) {
    return ok(await this.adminService.getCourseDemandComparison(courseId));
  }

  @Get("students/:id/standing")
  @RequireAdminPermissions("students:read")
  async studentStanding(@Param("id") id: string) {
    return ok(await this.adminService.getStudentAcademicStanding(id));
  }

  @Get("section-swap/:enrollmentId/preview")
  @RequireAdminPermissions("enrollments:write")
  async sectionSwapPreview(
    @Param("enrollmentId") enrollmentId: string,
    @Query("targetSectionId") targetSectionId: string
  ) {
    return ok(await this.adminService.previewSectionSwap(enrollmentId, targetSectionId));
  }

  @Post("section-swap/:enrollmentId/execute")
  @RequireAdminPermissions("enrollments:write")
  async sectionSwapExecute(
    @Param("enrollmentId") enrollmentId: string,
    @Query("targetSectionId") targetSectionId: string,
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.executeSectionSwap(enrollmentId, targetSectionId, user.userId));
  }

  @Get("cohort-by-major")
  @RequireAdminPermissions("students:read")
  async cohortByMajor(@Query("termId") termId?: string) {
    return ok(await this.adminService.getCohortByMajor(termId));
  }

  @Get("term-enrollment-forecast")
  @RequireAdminPermissions("dashboard:read")
  async termEnrollmentForecast() {
    return ok(await this.adminService.getTermEnrollmentForecast());
  }

  @Get("enrollment-audit")
  @RequireAdminPermissions("enrollments:read")
  async enrollmentAudit(
    @Query("termId") termId?: string,
    @Query("status") status?: string
  ) {
    return ok(await this.adminService.getEnrollmentAudit(termId, status));
  }

  @Get("top-performers")
  @RequireAdminPermissions("students:read")
  async topPerformers(
    @Query("termId") termId?: string,
    @Query("limit") limit?: string
  ) {
    return ok(await this.adminService.getTopPerformers(termId, limit ? parseInt(limit, 10) : 20));
  }

  @Get("dept-workload")
  @RequireAdminPermissions("dashboard:read")
  async deptWorkload(@Query("termId") termId?: string) {
    return ok(await this.adminService.getDeptWorkload(termId));
  }

  @Get("enrollment-velocity")
  @RequireAdminPermissions("enrollments:read")
  async enrollmentVelocity(@Query("termId") termId?: string) {
    return ok(await this.adminService.getEnrollmentVelocity(termId));
  }

  @Get("prereq-map")
  @RequireAdminPermissions("courses:read")
  async prereqMap() {
    return ok(await this.adminService.getPrereqMap());
  }

  @Get("grade-curve/:sectionId/preview")
  @RequireAdminPermissions("sections:read")
  async gradeCurvePreview(
    @Param("sectionId") sectionId: string,
    @Query("steps") steps?: string
  ) {
    return ok(await this.adminService.previewGradeCurve(sectionId, steps ? parseInt(steps, 10) : 1));
  }

  @Get("section-roster/:sectionId")
  @RequireAdminPermissions("sections:read")
  async sectionRoster(@Param("sectionId") sectionId: string) {
    return ok(await this.adminService.getSectionRoster(sectionId));
  }

  @Get("term-capacity")
  @RequireAdminPermissions("sections:read")
  async termCapacity(@Query("termId") termId?: string) {
    return ok(await this.adminService.getTermCapacitySummary(termId));
  }

  @Get("major-trends")
  @RequireAdminPermissions("students:read")
  async majorTrends(@Query("termId") termId?: string) {
    return ok(await this.adminService.getMajorEnrollmentTrends(termId));
  }

  @Get("late-drops")
  @RequireAdminPermissions("enrollments:read")
  async lateDrops(
    @Query("termId") termId?: string,
    @Query("minWeek") minWeek?: string
  ) {
    return ok(await this.adminService.getLateDropReport(termId, minWeek ? parseInt(minWeek, 10) : undefined));
  }

  @Get("instructor-performance")
  @RequireAdminPermissions("dashboard:read")
  async instructorPerformance(@Query("termId") termId?: string) {
    return ok(await this.adminService.getInstructorPerformance(termId));
  }

  @Get("dept-gpa")
  @RequireAdminPermissions("dashboard:read")
  async deptGpa(@Query("termId") termId?: string) {
    return ok(await this.adminService.getDeptGpaComparison(termId));
  }

  @Get("course-pairings")
  @RequireAdminPermissions("dashboard:read")
  async coursePairings() {
    return ok(await this.adminService.getCoursePairings());
  }

  @Get("retention")
  @RequireAdminPermissions("students:read")
  async retention() {
    return ok(await this.adminService.getRetentionCohort());
  }

  @Post("bulk-enroll")
  @RequireAdminPermissions("enrollments:write")
  async bulkEnroll(
    @Body() body: { studentIds?: string[]; sectionId?: string },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(
      await this.adminService.bulkEnroll(body.studentIds ?? [], body.sectionId ?? "", user.userId)
    );
  }

  @Post("bulk-drop")
  @RequireAdminPermissions("enrollments:write")
  async bulkDrop(
    @Body() body: { enrollmentIds?: string[] },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.bulkDrop(body.enrollmentIds ?? [], user.userId));
  }

  @Post("bulk-update-status")
  @RequireAdminPermissions("students:write")
  async bulkUpdateStatus(
    @Body() body: { studentIds?: string[]; status?: string },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(
      await this.adminService.bulkUpdateStudentStatus(body.studentIds ?? [], body.status ?? "", user.userId)
    );
  }

  @Get("reg-windows")
  @RequireAdminPermissions("terms:read")
  async regWindows() {
    return ok(await this.adminService.getRegistrationWindows());
  }

  @Post("reg-windows")
  @RequireAdminPermissions("terms:write")
  async createRegWindow(
    @Body() body: { termId?: string; openAt?: string; closeAt?: string },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(
      await this.adminService.updateRegistrationWindow(
        body.termId ?? "",
        body.openAt ?? "",
        body.closeAt ?? "",
        user.userId
      )
    );
  }

  @Patch("reg-windows/:termId")
  @RequireAdminPermissions("terms:write")
  async updateRegWindow(
    @Param("termId") termId: string,
    @Body() body: { openAt?: string; closeAt?: string },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.adminService.updateRegistrationWindow(termId, body.openAt ?? "", body.closeAt ?? "", user.userId));
  }

  @Get("system-health")
  @RequireAdminPermissions("dashboard:read")
  async systemHealth() {
    return ok(await this.adminService.getSystemHealth());
  }

  @Get("schedule-conflicts")
  @RequireAdminPermissions("sections:read")
  async scheduleConflicts(@Query("termId") termId?: string) {
    return ok(await this.adminService.getScheduleConflicts(termId));
  }
}
