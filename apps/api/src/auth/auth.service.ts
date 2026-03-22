import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Role } from "@prisma/client";
import argon2 from "argon2";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "crypto";
import { CookieOptions, Request, Response } from "express";
import {
  ForgotPasswordSchema,
  LoginInput,
  RegisterInput,
  ResetPasswordSchema,
  VerifyEmailSchema
} from "./auth.types";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { verifyPasswordHash } from "../common/password-hash";
import { MailService } from "../mail/mail.service";

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "sis-refresh";
const CSRF_COOKIE = (process.env.CSRF_COOKIE_NAME || "sis-csrf").trim() || "sis-csrf";
const ACCESS_EXPIRES_SECONDS = 60 * 60 * 2;
const REFRESH_EXPIRES_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_RATE_LIMIT_WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS || 8);
const LOGIN_RATE_LIMIT_LOCK_MS = Number(process.env.LOGIN_RATE_LIMIT_LOCK_MS || 15 * 60 * 1000);
const PASSWORD_RESET_TOKEN_TTL_MS = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MS || 60 * 60 * 1000);
const AUTH_EXPOSE_DEBUG_LINKS = (process.env.AUTH_EXPOSE_DEBUG_LINKS || "false").trim().toLowerCase() === "true";
const COOKIE_SAME_SITE: "lax" | "strict" | "none" = (() => {
  const raw = (process.env.COOKIE_SAME_SITE || "lax").trim().toLowerCase();
  if (raw === "lax" || raw === "strict" || raw === "none") {
    return raw;
  }
  return "lax";
})();
const COOKIE_SECURE = (() => {
  const raw = (process.env.COOKIE_SECURE || "").trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV === "production";
})();
const COOKIE_DOMAIN = (process.env.COOKIE_DOMAIN || "").trim() || undefined;
const COOKIE_BASE_OPTIONS: Pick<CookieOptions, "sameSite" | "secure" | "domain" | "path"> = {
  sameSite: COOKIE_SAME_SITE,
  secure: COOKIE_SAME_SITE === "none" ? true : COOKIE_SECURE,
  domain: COOKIE_DOMAIN,
  path: "/"
};

export const activeSessions = new Map<string, { userId: string; email: string; loginAt: Date; ip?: string }>();
export function isSessionActive(sessionId?: string | null) {
  return sessionId ? activeSessions.has(sessionId) : false;
}
export function revokeActiveSession(sessionId?: string | null) {
  if (!sessionId) return;
  activeSessions.delete(sessionId);
}

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
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService
  ) {}

  private isStrongPassword(password: string): boolean {
    return password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password);
  }

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
      ...COOKIE_BASE_OPTIONS,
      maxAge: ACCESS_EXPIRES_SECONDS * 1000
    });
  }

  private setCsrfCookie(res: Response, token: string) {
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      ...COOKIE_BASE_OPTIONS,
      maxAge: ACCESS_EXPIRES_SECONDS * 1000
    });
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      ...COOKIE_BASE_OPTIONS,
      maxAge: REFRESH_EXPIRES_MS
    });
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, COOKIE_BASE_OPTIONS);
    res.clearCookie(REFRESH_COOKIE, COOKIE_BASE_OPTIONS);
    res.clearCookie(CSRF_COOKIE, COOKIE_BASE_OPTIONS);
  }

  private async issueSessionForUser(
    user: {
      id: string;
      email: string;
      studentId?: string | null;
      role: Role;
      studentProfile?: unknown;
    },
    res: Response,
    req?: Request
  ) {
    const sessionId = Math.random().toString(36).slice(2);
    const refreshToken = `${sessionId}.${randomUUID()}`;
    const accessExpiresAt = Date.now() + ACCESS_EXPIRES_SECONDS * 1000;

    const token = await this.jwtService.signAsync(
      {
        sub: user.id,
        userId: user.id,
        role: user.role,
        sid: sessionId
      },
      {
        expiresIn: `${ACCESS_EXPIRES_SECONDS}s`
      }
    );

    activeSessions.set(sessionId, {
      userId: user.id,
      email: user.email,
      loginAt: new Date(),
      ip: req ? this.getClientIp(req) : "sso"
    });

    this.setAuthCookie(res, token);
    this.setRefreshCookie(res, refreshToken);
    this.setCsrfCookie(res, randomBytes(32).toString("hex"));

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          loginAttempts: 0,
          lockedUntil: null
        }
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          token: refreshToken,
          expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS)
        }
      })
    ]);

    await this.auditService.log({
      actorUserId: user.id,
      action: "login",
      entityType: "auth",
      entityId: user.id,
      metadata: { role: user.role, sso: user.studentId === null || user.studentId === undefined ? true : undefined },
      req
    });

    return {
      id: user.id,
      email: user.email,
      studentId: user.studentId ?? null,
      role: user.role,
      sessionId,
      expiresAt: accessExpiresAt,
      profile: user.studentProfile ?? null
    };
  }

  async createSessionForUser(userId: string, res: Response, req?: Request) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        studentId: true,
        role: true,
        deletedAt: true,
        studentProfile: true
      }
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException({ code: "USER_NOT_FOUND", message: "用户不存在" });
    }

    return this.issueSessionForUser(user, res, req);
  }

  async findOrCreateSsoUser(email: string, _profile: Record<string, unknown>) {
    let user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      select: { id: true, email: true, role: true, emailVerifiedAt: true }
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash: "",
          role: Role.STUDENT,
          emailVerifiedAt: new Date(),
          ssoProvider: "saml"
        },
        select: { id: true, email: true, role: true, emailVerifiedAt: true }
      });
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role
    };
  }

  async register(input: RegisterInput, req: Request) {
    const invite = await this.prisma.inviteCode.findUnique({ where: { code: input.inviteCode } });
    if (!invite || !invite.active) {
      throw new BadRequestException({ code: "INVALID_INVITE", message: "邀请码无效" });
    }
    if (invite.usedAt) {
      throw new BadRequestException({ code: "INVITE_USED", message: "邀请码已被使用" });
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException({ code: "INVITE_EXPIRED", message: "邀请码已过期" });
    }
    if (invite.maxUses && invite.usedCount >= invite.maxUses) {
      throw new BadRequestException({ code: "INVITE_EXHAUSTED", message: "邀请码已用尽" });
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { studentId: input.studentId }]
      },
      select: { id: true }
    });
    if (existingUser) {
      throw new BadRequestException({ code: "USER_EXISTS", message: "邮箱或学号已被注册" });
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
      data: {
        usedCount: { increment: 1 },
        usedAt: new Date()
      }
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

    await this.notificationsService.sendVerificationEmail({
      to: user.email,
      legalName: input.legalName,
      activationLink
    });

    await this.auditService.log({
      actorUserId: user.id,
      action: "register",
      entityType: "user",
      entityId: user.id,
      metadata: { email: user.email },
      req
    });

    return {
      message: "注册成功，请先验证邮箱后再登录。",
      ...((AUTH_EXPOSE_DEBUG_LINKS || process.env.NODE_ENV !== "production") ? { activationLink } : {})
    };
  }

  async verifyEmail(input: VerifyEmailSchema) {
    const tokenRecord = await this.prisma.emailVerificationToken.findUnique({ where: { token: input.token } });

    if (!tokenRecord || tokenRecord.usedAt || tokenRecord.expiresAt < new Date()) {
      throw new BadRequestException({ code: "INVALID_TOKEN", message: "验证链接无效或已过期" });
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

    return { message: "邮箱验证成功" };
  }

  async resendVerificationEmail(email: string) {
    // Always return success to prevent email enumeration
    const user = await this.prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), deletedAt: null },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        deletedAt: true,
        studentProfile: {
          select: {
            legalName: true
          }
        }
      }
    });

    if (!user || user.emailVerifiedAt) {
      // Already verified or not found — no-op, don't leak info
      return { message: "若该邮箱存在且尚未验证，我们已向您重新发送验证邮件。" };
    }

    // Invalidate old tokens
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() }
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

    const legalName = user.studentProfile?.legalName ?? user.email;

    await this.notificationsService.sendVerificationEmail({
      to: user.email,
      legalName,
      activationLink
    }).catch(() => undefined); // silent if mail not configured

    return {
      message: "若该邮箱存在且尚未验证，我们已向您重新发送验证邮件。",
      ...((AUTH_EXPOSE_DEBUG_LINKS || process.env.NODE_ENV !== "production") ? { activationLink } : {})
    };
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
        deletedAt: null,
        OR: [{ email: input.identifier }, { studentId: input.identifier }]
      },
      select: {
        id: true,
        email: true,
        studentId: true,
        role: true,
        passwordHash: true,
        emailVerifiedAt: true,
        lockedUntil: true,
        deletedAt: true,
        loginAttempts: true,
        studentProfile: true
      }
    });

    if (!user) {
      this.recordLoginFailure(loginAttemptKey, now);
      await this.auditLoginFailure(req, input.identifier, "invalid_credentials");
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "邮箱或密码不正确" });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfterSeconds = Math.ceil((user.lockedUntil.getTime() - now) / 1000);
      await this.auditLoginFailure(req, input.identifier, "account_locked");
      throw new ForbiddenException({
        code: "ACCOUNT_LOCKED",
        message: "账号已锁定，请稍后再试",
        details: { retryAfterSeconds, lockedUntil: user.lockedUntil.toISOString() }
      });
    }

    const validPassword = await verifyPasswordHash(user.passwordHash, input.password);
    if (!validPassword) {
      this.recordLoginFailure(loginAttemptKey, now);
      const nextLoginAttempts = (user.loginAttempts ?? 0) + 1;
      const lockedUntil = nextLoginAttempts >= 5 ? new Date(now + 15 * 60 * 1000) : null;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: nextLoginAttempts,
          lockedUntil
        }
      });
      await this.auditLoginFailure(req, input.identifier, "invalid_credentials");
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "邮箱或密码不正确" });
    }

    if (!user.emailVerifiedAt) {
      this.recordLoginFailure(loginAttemptKey, now);
      await this.auditLoginFailure(req, input.identifier, "email_not_verified");
      throw new UnauthorizedException({ code: "EMAIL_NOT_VERIFIED", message: "请先完成邮箱验证后再登录" });
    }

    this.clearLoginAttempts(loginAttemptKey);
    return this.issueSessionForUser(user, res, req);
  }

  async logout(userId: string, sessionId: string | undefined, req: Request, res: Response) {
    this.clearAuthCookies(res);
    revokeActiveSession(sessionId);
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    for (const [activeSessionId, session] of activeSessions.entries()) {
      if (session.userId === userId) {
        activeSessions.delete(activeSessionId);
      }
    }
    await this.auditService.log({
      actorUserId: userId,
      action: "logout",
      entityType: "auth",
      entityId: userId,
      req
    });

    return { message: "已退出登录" };
  }

  async refresh(req: Request, res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (typeof refreshToken !== "string" || refreshToken.length === 0) {
      throw new UnauthorizedException({ code: "REFRESH_TOKEN_MISSING", message: "刷新令牌缺失" });
    }

    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            deletedAt: true,
            studentProfile: true
          }
        }
      }
    });

    if (!tokenRecord || tokenRecord.expiresAt <= new Date() || tokenRecord.user.deletedAt) {
      throw new UnauthorizedException({ code: "REFRESH_TOKEN_INVALID", message: "刷新令牌无效或已过期" });
    }

    const sessionId = refreshToken.split(".")[0] || Math.random().toString(36).slice(2);
    const rotatedRefreshToken = `${sessionId}.${randomUUID()}`;
    const accessExpiresAt = Date.now() + ACCESS_EXPIRES_SECONDS * 1000;
    const token = await this.jwtService.signAsync(
      {
        sub: tokenRecord.userId,
        role: tokenRecord.user.role,
        sid: sessionId
      },
      {
        expiresIn: `${ACCESS_EXPIRES_SECONDS}s`
      }
    );

    activeSessions.set(sessionId, {
      userId: tokenRecord.userId,
      email: tokenRecord.user.email,
      loginAt: activeSessions.get(sessionId)?.loginAt ?? new Date(),
      ip: activeSessions.get(sessionId)?.ip ?? this.getClientIp(req)
    });

    await this.prisma.$transaction([
      this.prisma.refreshToken.delete({ where: { token: refreshToken } }),
      this.prisma.refreshToken.create({
        data: {
          userId: tokenRecord.userId,
          token: rotatedRefreshToken,
          expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS)
        }
      })
    ]);

    this.setAuthCookie(res, token);
    this.setRefreshCookie(res, rotatedRefreshToken);
    this.setCsrfCookie(res, randomBytes(32).toString("hex"));

    return { ok: true, expiresAt: accessExpiresAt };
  }

  getSessions() {
    return [...activeSessions.entries()].map(([id, session]) => ({
      id,
      ...session
    }));
  }

  revokeSession(sessionId: string) {
    activeSessions.delete(sessionId);
    return { revoked: true };
  }

  async issueCsrfToken(res: Response) {
    const token = randomBytes(32).toString("hex");
    this.setCsrfCookie(res, token);
    return { csrfToken: token };
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: email.trim().toLowerCase(),
        deletedAt: null
      },
      select: {
        id: true,
        email: true,
        deletedAt: true
      }
    });
    if (!user) {
      return { message: "如果该邮箱已注册，重置链接已发送" };
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

    await this.mailService.sendPasswordReset(user.email, token);

    return {
      message: "如果该邮箱已注册，重置链接已发送"
    };
  }

  async forgotPassword(input: ForgotPasswordSchema) {
    return this.requestPasswordReset(input.email);
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenRecord = await this.prisma.passwordResetToken.findUnique({ where: { token } });

    if (!tokenRecord || tokenRecord.usedAt || tokenRecord.expiresAt < new Date()) {
      throw new BadRequestException({ code: "INVALID_TOKEN", message: "链接无效或已过期" });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: tokenRecord.userId },
      select: { id: true, email: true, deletedAt: true }
    });

    if (!user || user.deletedAt) {
      throw new BadRequestException({ code: "INVALID_TOKEN", message: "链接无效或已过期" });
    }

    if (!this.isStrongPassword(newPassword)) {
      throw new BadRequestException({
        code: "WEAK_PASSWORD",
        message: "新密码至少 8 位，且需包含大小写字母和数字"
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: tokenRecord.userId, deletedAt: null },
        data: { passwordHash }
      });
      if (updated.count === 0) {
        throw new BadRequestException({ code: "INVALID_TOKEN", message: "重置链接无效或已过期" });
      }

      await tx.passwordResetToken.updateMany({
        where: {
          OR: [{ id: tokenRecord.id }, { userId: tokenRecord.userId }]
        },
        data: {
          usedAt: new Date()
        }
      });

      await tx.refreshToken.deleteMany({
        where: { userId: tokenRecord.userId }
      });
    });

    for (const [activeSessionId, session] of activeSessions.entries()) {
      if (session.userId === tokenRecord.userId) {
        activeSessions.delete(activeSessionId);
      }
    }

    await this.auditService.log({
      actorUserId: tokenRecord.userId,
      action: "password_reset",
      entityType: "user",
      entityId: tokenRecord.userId,
      metadata: {}
    });

    return { message: "密码已重置，请重新登录" };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, passwordHash: true }
    });
    if (!user) {
      throw new UnauthorizedException({ code: "USER_NOT_FOUND", message: "用户不存在" });
    }

    const validPassword = await verifyPasswordHash(user.passwordHash, oldPassword);
    if (!validPassword) {
      throw new UnauthorizedException({
        code: "INVALID_CURRENT_PASSWORD",
        message: "当前密码不正确"
      });
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash }
      }),
      this.prisma.refreshToken.deleteMany({
        where: { userId }
      })
    ]);

    for (const [activeSessionId, session] of activeSessions.entries()) {
      if (session.userId === userId) {
        activeSessions.delete(activeSessionId);
      }
    }

    return { message: "密码已更新" };
  }

  async checkEmailExists(email: string) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      return { exists: false };
    }

    const user = await this.prisma.user.findFirst({
      where: {
        email: normalized,
        deletedAt: null
      },
      select: { id: true }
    });

    return { exists: Boolean(user) };
  }

  async unlockAccount(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        loginAttempts: 0,
        lockedUntil: null
      }
    });
    return { unlocked: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        studentId: true,
        role: true,
        emailVerifiedAt: true,
        studentProfile: true
      }
    });
    if (!user) {
      throw new UnauthorizedException({ code: "USER_NOT_FOUND", message: "用户不存在" });
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
