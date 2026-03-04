import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { changePasswordSchema, createStudentSchema, updateProfileSchema } from "@sis/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ok } from "../common/response";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { StudentsService } from "./students.service";

@Controller("students")
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Roles("STUDENT", "ADMIN")
  @Get("me")
  async getMe(@CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.getMyProfile(user.userId));
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
  @Get()
  async adminList() {
    return ok(await this.studentsService.adminListStudents());
  }

  @Roles("ADMIN")
  @Get(":id")
  async adminGet(@Param("id") id: string) {
    return ok(await this.studentsService.adminGetStudent(id));
  }

  @Roles("ADMIN")
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
  @Delete(":id")
  async adminDelete(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    return ok(await this.studentsService.adminDeleteStudent(id, user.userId));
  }
}
