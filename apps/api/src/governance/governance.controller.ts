import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  createHoldSchema,
  decideAcademicRequestSchema,
  resolveHoldSchema,
  submitCreditOverloadRequestSchema
} from "@sis/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { ok } from "../common/response";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { GovernanceService } from "./governance.service";

@Controller("governance")
@UseGuards(JwtAuthGuard, RolesGuard)
export class GovernanceController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Get("my-holds")
  @Roles("STUDENT")
  async listMyHolds(@CurrentUser() user: { userId: string }) {
    return ok(await this.governanceService.listMyHolds(user.userId));
  }

  @Get("my-requests")
  @Roles("STUDENT")
  async listMyRequests(@CurrentUser() user: { userId: string }, @Query("termId") termId?: string) {
    return ok(await this.governanceService.listMyAcademicRequests(user.userId, termId));
  }

  @Post("requests/credit-overload")
  @Roles("STUDENT")
  async submitCreditOverloadRequest(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(submitCreditOverloadRequestSchema)) body: unknown
  ) {
    return ok(await this.governanceService.submitCreditOverloadRequest(user.userId, body as never));
  }

  @Get("advisor/requests")
  @Roles("ADVISOR")
  async listAdvisorRequests(@CurrentUser() user: { userId: string }) {
    return ok(await this.governanceService.listAdvisorRequests(user.userId));
  }

  @Post("advisor/requests/:requestId/decision")
  @Roles("ADVISOR")
  async decideAdvisorRequest(
    @CurrentUser() user: { userId: string },
    @Param("requestId") requestId: string,
    @Body(new ZodValidationPipe(decideAcademicRequestSchema)) body: unknown
  ) {
    return ok(await this.governanceService.decideAdvisorRequest(user.userId, requestId, body as never));
  }

  @Get("admin/holds")
  @Roles("ADMIN")
  async listHolds(@CurrentUser() user: { userId: string }, @Query("studentId") studentId?: string) {
    return ok(await this.governanceService.listHolds(user.userId, studentId));
  }

  @Post("admin/holds")
  @Roles("ADMIN")
  async createHold(
    @CurrentUser() user: { userId: string },
    @Body(new ZodValidationPipe(createHoldSchema)) body: unknown
  ) {
    return ok(await this.governanceService.createHold(user.userId, body as never));
  }

  @Patch("admin/holds/:holdId/resolve")
  @Roles("ADMIN")
  async resolveHold(
    @CurrentUser() user: { userId: string },
    @Param("holdId") holdId: string,
    @Body(new ZodValidationPipe(resolveHoldSchema)) body: unknown
  ) {
    return ok(await this.governanceService.resolveHold(user.userId, holdId, body as never));
  }
}
