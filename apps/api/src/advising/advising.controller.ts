import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ok } from "../common/response";
import { AdvisingService } from "./advising.service";

@Controller("advising")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADVISOR")
export class AdvisingController {
  constructor(private readonly advisingService: AdvisingService) {}

  @Get("advisees")
  async listAdvisees(@CurrentUser() user: { userId: string }) {
    return ok(await this.advisingService.listAdvisees(user.userId));
  }

  @Get("advisees/:studentId")
  async getAdviseeOverview(@Param("studentId") studentId: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.advisingService.getAdviseeOverview(user.userId, studentId));
  }

  @Post("advisees/:studentId/notes")
  async addAdvisorNote(
    @Param("studentId") studentId: string,
    @Body() body: { body?: string },
    @CurrentUser() user: { userId: string }
  ) {
    return ok(await this.advisingService.addAdvisorNote(user.userId, studentId, body.body?.trim() || ""));
  }
}
