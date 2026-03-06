import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema
} from "@sis/shared";
import { AuthService } from "./auth.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ok } from "../common/response";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body(new ZodValidationPipe(registerSchema)) body: unknown, @Req() req: Request) {
    return ok(await this.authService.register(body as never, req));
  }

  @Get("verify-email")
  async verifyEmail(@Query("token") token: string) {
    const parsed = verifyEmailSchema.parse({ token });
    return ok(await this.authService.verifyEmail(parsed));
  }

  @Post("login")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    return ok(await this.authService.login(body as never, req, res));
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

  @Post("forgot-password")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: unknown) {
    return ok(await this.authService.forgotPassword(body as never));
  }

  @Post("reset-password")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: unknown) {
    return ok(await this.authService.resetPassword(body as never));
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
