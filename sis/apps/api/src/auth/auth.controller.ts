import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
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

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  async register(@Body(new ZodValidationPipe(registerSchema)) body: unknown, @Req() req: Request) {
    return ok(await this.authService.register(body as never, req));
  }

  @Get("verify-email")
  async verifyEmail(@Query("token") token: string) {
    const parsed = verifyEmailSchema.parse({ token });
    return ok(await this.authService.verifyEmail(parsed));
  }

  @Post("login")
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  async logout(@CurrentUser() user: { userId: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return ok(await this.authService.logout(user.userId, req, res));
  }

  @Post("forgot-password")
  async forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: unknown) {
    return ok(await this.authService.forgotPassword(body as never));
  }

  @Post("reset-password")
  async resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: unknown) {
    return ok(await this.authService.resetPassword(body as never));
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentUser() user: { userId: string }) {
    return ok(await this.authService.me(user.userId));
  }
}
