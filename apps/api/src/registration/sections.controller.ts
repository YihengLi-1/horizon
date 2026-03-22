import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ok } from "../common/response";
import { RegistrationService } from "./registration.service";

@Controller("sections")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("FACULTY", "ADMIN")
export class SectionsController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post(":sectionId/grades/submit")
  async submitSectionGrades(
    @Param("sectionId") sectionId: string,
    @Body() body: { grades: Array<{ enrollmentId: string; grade: string; gradePoints?: number }> },
    @CurrentUser() user: { userId: string },
    @Req() req: Request
  ) {
    return ok(
      await this.registrationService.submitSectionGrades(sectionId, body.grades ?? [], user.userId, req)
    );
  }
}
