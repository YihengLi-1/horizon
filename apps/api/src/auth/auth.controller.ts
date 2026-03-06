import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { verifyEmailSchema } from "@sis/shared";
import { AuthService } from "./auth.service";
import { ok } from "../common/response";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async register(@Body() body: RegisterDto, @Req() req: Request) {
    return ok(await this.authService.register(body, req));
  }

  @Get("verify-email")
  async verifyEmail(@Query("token") token: string) {
    const parsed = verifyEmailSchema.parse({ token });
    return ok(await this.authService.verifyEmail(parsed));
  }

  @Post("login")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    return ok(await this.authService.login(body, req, res));
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  async logout(
    @CurrentUser() user: { userId: string; sid?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    return ok(await this.authService.logout(user.userId, user.sid, req, res));
  }

  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return ok(await this.authService.refresh(req, res));
  }

  @Post("forgot-password")
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return ok(await this.authService.forgotPassword(body));
  }

  @Post("reset-password")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() body: ResetPasswordDto) {
    return ok(await this.authService.resetPassword(body));
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentUser() user: { userId: string }) {
    return ok(await this.authService.me(user.userId));
  }

  @UseGuards(JwtAuthGuard)
  @Get("csrf-token")
  async csrfToken(@Res({ passthrough: true }) res: Response) {
    return ok(await this.authService.issueCsrfToken(res));
  }

  @Get("sessions")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  getSessions() {
    return ok(this.authService.getSessions());
  }

  @Delete("sessions/:id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  revokeSession(@Param("id") id: string) {
    return ok(this.authService.revokeSession(id));
  }
}
