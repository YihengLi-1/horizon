import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { verifyEmailSchema } from "@sis/shared";
import { AuthService } from "./auth.service";
import { ok } from "../common/response";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Public } from "../common/public.decorator";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
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

  @Post("resend-verification")
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() body: { email?: string }) {
    const email = (body.email ?? "").trim();
    if (!email) return ok({ message: "若该邮箱存在且尚未验证，我们已向您重新发送验证邮件。" });
    return ok(await this.authService.resendVerificationEmail(email));
  }

  @Post("login")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    return ok(await this.authService.login(body, req, res));
  }

  @Get("saml/login")
  @Public()
  @UseGuards(AuthGuard("saml"))
  async samlLogin() {
    return;
  }

  @Post("saml/callback")
  @Public()
  @UseGuards(AuthGuard("saml"))
  async samlCallback(
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
    @Res() res: Response
  ) {
    await this.authService.createSessionForUser(user.userId, res, req);
    return res.redirect(`${process.env.WEB_URL ?? "http://localhost:3000"}/student/dashboard`);
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: { userId: string; sid?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    return ok(await this.authService.logout(user.userId, user.sid, req, res));
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return ok(await this.authService.refresh(req, res));
  }

  @Get("check-email")
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async checkEmail(@Query("email") email?: string) {
    return ok(await this.authService.checkEmailExists(email ?? ""));
  }

  @Post("forgot-password")
  @Public()
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return ok(await this.authService.requestPasswordReset(body.email));
  }

  @Post("reset-password")
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordDto) {
    return ok(await this.authService.resetPassword(body.token, body.newPassword));
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentUser() user: { userId: string }) {
    return ok(await this.authService.me(user.userId));
  }

  @Get("csrf-token")
  @Public()
  async csrfToken(@Res({ passthrough: true }) res: Response) {
    return ok(await this.authService.issueCsrfToken(res));
  }

  @UseGuards(JwtAuthGuard)
  @Patch("change-password")
  async changePassword(@CurrentUser() user: { userId: string }, @Body() body: ChangePasswordDto) {
    return ok(await this.authService.changePassword(user.userId, body.oldPassword, body.newPassword));
  }

  @Post("unlock-account")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  async unlockAccount(@Body() body: { userId: string }) {
    return ok(await this.authService.unlockAccount(body.userId));
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
