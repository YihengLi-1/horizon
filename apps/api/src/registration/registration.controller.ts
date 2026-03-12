import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { dropEnrollmentSchema, submitCartSchema } from "@sis/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ok } from "../common/response";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { EnrollDto } from "./dto/enroll.dto";
import { RegistrationService } from "./registration.service";

@Controller("registration")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("STUDENT", "ADMIN")
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Get("cart")
  async getCart(@CurrentUser() user: { userId: string }, @Query("termId") termId: string) {
    return ok(await this.registrationService.getCart(user.userId, termId));
  }

  @Post("cart")
  async addToCart(@CurrentUser() user: { userId: string }, @Body() body: EnrollDto) {
    return ok(await this.registrationService.addToCart(user.userId, body));
  }

  @Delete("cart/:id")
  async removeFromCart(@CurrentUser() user: { userId: string }, @Param("id") id: string) {
    return ok(await this.registrationService.removeCartItem(user.userId, id));
  }

  @Post("submit")
  async submitCart(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(submitCartSchema)) body: unknown,
    @Req() req: Request
  ) {
    return ok(await this.registrationService.submitCart(user.userId, body as never, req));
  }

  @Post("precheck")
  async precheckCart(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(submitCartSchema)) body: unknown
  ) {
    return ok(await this.registrationService.precheckCart(user.userId, body as never));
  }

  @Post("drop")
  async drop(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(dropEnrollmentSchema)) body: unknown,
    @Req() req: Request
  ) {
    return ok(await this.registrationService.dropEnrollment(user.userId, body as never, req));
  }

  @Get("enrollments")
  async listEnrollments(@CurrentUser() user: { userId: string }, @Query("termId") termId?: string) {
    return ok(await this.registrationService.listMyEnrollments(user.userId, termId));
  }

  @Get("schedule")
  async listSchedule(@CurrentUser() user: { userId: string }, @Query("termId") termId: string) {
    return ok(await this.registrationService.listMySchedule(user.userId, termId));
  }

  @Get("grades")
  async listGrades(@CurrentUser() user: { userId: string }) {
    return ok(await this.registrationService.listMyGrades(user.userId));
  }

  @Get("waitlist-position/:sectionId")
  async getWaitlistPosition(@CurrentUser() user: { userId: string }, @Param("sectionId") sectionId: string) {
    return ok(await this.registrationService.getWaitlistPosition(user.userId, sectionId));
  }

  @Get("my-waitlist")
  async getMyWaitlist(@CurrentUser() user: { userId: string }) {
    return ok(await this.registrationService.getMyWaitlist(user.userId));
  }

  @Post("swap")
  async swap(
    @Body() body: { dropSectionId: string; addSectionId: string },
    @CurrentUser() user: { userId: string },
    @Req() req: Request
  ) {
    return ok(await this.registrationService.swap(user.userId, body.dropSectionId, body.addSectionId, req));
  }

  @Post("watch/:sectionId")
  async watchSection(@Param("sectionId") sectionId: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.registrationService.watchSection(user.userId, sectionId));
  }

  @Delete("watch/:sectionId")
  async unwatchSection(@Param("sectionId") sectionId: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.registrationService.unwatchSection(user.userId, sectionId));
  }

  @Get("watches")
  async getWatches(@CurrentUser() user: { userId: string }) {
    return ok(await this.registrationService.getWatches(user.userId));
  }
}
