import { BadRequestException, HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Role } from "@prisma/client";
import argon2 from "argon2";
import { randomBytes } from "crypto";
import { Request, Response } from "express";
import {
  ForgotPasswordSchema,
  LoginInput,
  RegisterInput,
  ResetPasswordSchema,
  VerifyEmailSchema
} from "./auth.types";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../audit/audit.service";

const ACCESS_COOKIE = "access_token";
const ACCESS_EXPIRES_SECONDS = 60 * 60 * 2;
const LOGIN_RATE_LIMIT_WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS || 8);
const LOGIN_RATE_LIMIT_LOCK_MS = Number(process.env.LOGIN_RATE_LIMIT_LOCK_MS || 15 * 60 * 1000);
const PASSWORD_RESET_TOKEN_TTL_MS = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MS || 30 * 60 * 1000);

type LoginAttemptState = {
  count: number;
  firstAttemptAt: number;
  lastAttemptAt: number;
  lockedUntil: number;
};

@Injectable()
export class AuthService {
  private readonly loginAttemptsByKey = new Map<string, LoginAttemptState>();
  private lastPruneAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService
  ) {}

  private getClientIp(req: Request): string {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.trim().length > 0) {
      return forwardedFor.split(",")[0].trim();
    }
    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0];
    }
    return req.ip || req.socket?.remoteAddress || "unknown";
  }

  private getLoginAttemptKey(identifier: string, req: Request): string {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const ip = this.getClientIp(req);
    return `${normalizedIdentifier}::${ip}`;
  }

  private pruneLoginAttempts(now: number): void {
    if (now - this.lastPruneAt < 5 * 60 * 1000) return;
    this.lastPruneAt = now;

    for (const [key, value] of this.loginAttemptsByKey.entries()) {
      const isExpired =
        value.lockedUntil <= now &&
        now - value.lastAttemptAt > LOGIN_RATE_LIMIT_WINDOW_MS * 3;
      if (isExpired) {
        this.loginAttemptsByKey.delete(key);
      }
    }
  }

  private assertLoginRateLimit(attemptKey: string, now: number): void {
    const state = this.loginAttemptsByKey.get(attemptKey);
    if (!state) return;

    if (state.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((state.lockedUntil - now) / 1000);
      throw new HttpException(
        {
          code: "TOO_MANY_ATTEMPTS",
          message: `Too many login attempts. Try again in ${retryAfterSeconds}s.`,
          details: { retryAfterSeconds }
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    if (now - state.firstAttemptAt > LOGIN_RATE_LIMIT_WINDOW_MS) {
      this.loginAttemptsByKey.set(attemptKey, {
        count: 0,
        firstAttemptAt: now,
        lastAttemptAt: now,
        lockedUntil: 0
      });
    }
  }

  private recordLoginFailure(attemptKey: string, now: number): void {
    const state = this.loginAttemptsByKey.get(attemptKey);
    if (!state) {
      this.loginAttemptsByKey.set(attemptKey, {
        count: 1,
        firstAttemptAt: now,
        lastAttemptAt: now,
        lockedUntil: 0
      });
      return;
    }

    if (now - state.firstAttemptAt > LOGIN_RATE_LIMIT_WINDOW_MS) {
      state.count = 1;
      state.firstAttemptAt = now;
      state.lockedUntil = 0;
    } else {
      state.count += 1;
      if (state.count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
        state.lockedUntil = now + LOGIN_RATE_LIMIT_LOCK_MS;
        state.count = 0;
        state.firstAttemptAt = now;
      }
    }
    state.lastAttemptAt = now;
    this.loginAttemptsByKey.set(attemptKey, state);
  }

  private clearLoginAttempts(attemptKey: string): void {
    this.loginAttemptsByKey.delete(attemptKey);
  }

  private async auditLoginFailure(req: Request, identifier: string, reason: string): Promise<void> {
    await this.auditService.log({
      action: "login_failed",
      entityType: "auth",
      metadata: {
        identifier: identifier.trim().toLowerCase(),
        reason
      },
      req
    });
  }

  private setAuthCookie(res: Response, token: string) {
    res.cookie(ACCESS_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: ACCESS_EXPIRES_SECONDS * 1000
    });
  }

  async register(input: RegisterInput, req: Request) {
    const invite = await this.prisma.inviteCode.findUnique({ where: { code: input.inviteCode } });
    if (!invite || !invite.active) {
      throw new BadRequestException({ code: "INVALID_INVITE", message: "Invite code is invalid" });
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException({ code: "INVITE_EXPIRED", message: "Invite code expired" });
    }
    if (invite.maxUses && invite.usedCount >= invite.maxUses) {
      throw new BadRequestException({ code: "INVITE_EXHAUSTED", message: "Invite code already used up" });
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { studentId: input.studentId }]
      }
    });
    if (existingUser) {
      throw new BadRequestException({ code: "USER_EXISTS", message: "Email or studentId already exists" });
    }

    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        studentId: input.studentId,
        passwordHash,
        role: Role.STUDENT,
        studentProfile: {
          create: {
            legalName: input.legalName,
            enrollmentStatus: "New",
            academicStatus: "Active"
          }
        }
      }
    });

    await this.prisma.inviteCode.update({
      where: { id: invite.id },
      data: { usedCount: { increment: 1 } }
    });

    const token = randomBytes(32).toString("hex");
    await this.prisma.emailVerificationToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    const activationLink = `${process.env.WEB_URL || "http://localhost:3000"}/verify?token=${token}`;

    await this.auditService.log({
      actorUserId: user.id,
      action: "register",
      entityType: "user",
      entityId: user.id,
      metadata: { email: user.email },
      req
    });

    return {
      message: "Registration successful. Verify email before login.",
      activationLink
    };
  }

  async verifyEmail(input: VerifyEmailSchema) {
    const tokenRecord = await this.prisma.emailVerificationToken.findUnique({ where: { token: input.token } });

    if (!tokenRecord || tokenRecord.usedAt || tokenRecord.expiresAt < new Date()) {
      throw new BadRequestException({ code: "INVALID_TOKEN", message: "Verification token is invalid or expired" });
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() }
      }),
      this.prisma.user.update({
        where: { id: tokenRecord.userId },
        data: { emailVerifiedAt: new Date() }
      })
    ]);

    return { message: "Email verified" };
  }

  async login(input: LoginInput, req: Request, res: Response) {
    const now = Date.now();
    const loginAttemptKey = this.getLoginAttemptKey(input.identifier, req);
    this.pruneLoginAttempts(now);
    try {
      this.assertLoginRateLimit(loginAttemptKey, now);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        await this.auditLoginFailure(req, input.identifier, "too_many_attempts");
      }
      throw error;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: input.identifier }, { studentId: input.identifier }]
      },
      include: { studentProfile: true }
    });

    if (!user) {
      this.recordLoginFailure(loginAttemptKey, now);
      await this.auditLoginFailure(req, input.identifier, "invalid_credentials");
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Invalid credentials" });
    }

    const validPassword = await argon2.verify(user.passwordHash, input.password);
    if (!validPassword) {
      this.recordLoginFailure(loginAttemptKey, now);
      await this.auditLoginFailure(req, input.identifier, "invalid_credentials");
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Invalid credentials" });
    }

    if (!user.emailVerifiedAt) {
      this.recordLoginFailure(loginAttemptKey, now);
      await this.auditLoginFailure(req, input.identifier, "email_not_verified");
      throw new UnauthorizedException({ code: "EMAIL_NOT_VERIFIED", message: "Email must be verified before login" });
    }

    this.clearLoginAttempts(loginAttemptKey);

    const token = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role
    }, {
      expiresIn: `${ACCESS_EXPIRES_SECONDS}s`
    });

    this.setAuthCookie(res, token);

    await this.auditService.log({
      actorUserId: user.id,
      action: "login",
      entityType: "auth",
      entityId: user.id,
      metadata: { role: user.role },
      req
    });

    return {
      id: user.id,
      email: user.email,
      studentId: user.studentId,
      role: user.role,
      profile: user.studentProfile
    };
  }

  async logout(userId: string, req: Request, res: Response) {
    res.clearCookie(ACCESS_COOKIE);
    await this.auditService.log({
      actorUserId: userId,
      action: "logout",
      entityType: "auth",
      entityId: userId,
      req
    });

    return { message: "Logged out" };
  }

  async forgotPassword(input: ForgotPasswordSchema) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      return { message: "If the account exists, a reset link has been generated" };
    }

    const token = randomBytes(32).toString("hex");
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({
        where: { userId: user.id }
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS)
        }
      })
    ]);

    const resetLink = `${process.env.WEB_URL || "http://localhost:3000"}/reset?token=${token}`;
    return {
      message: "If the account exists, a reset link has been generated",
      resetLink
    };
  }

  async resetPassword(input: ResetPasswordSchema) {
    const tokenRecord = await this.prisma.passwordResetToken.findUnique({ where: { token: input.token } });

    if (!tokenRecord || tokenRecord.usedAt || tokenRecord.expiresAt < new Date()) {
      throw new BadRequestException({ code: "INVALID_TOKEN", message: "Reset token is invalid or expired" });
    }

    const passwordHash = await argon2.hash(input.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: tokenRecord.userId },
        data: { passwordHash }
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: {
          OR: [{ id: tokenRecord.id }, { userId: tokenRecord.userId }]
        }
      })
    ]);

    return { message: "Password reset successful" };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { studentProfile: true }
    });
    if (!user) {
      throw new UnauthorizedException({ code: "USER_NOT_FOUND", message: "User not found" });
    }

    return {
      id: user.id,
      email: user.email,
      studentId: user.studentId,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
      profile: user.studentProfile
    };
  }
}
