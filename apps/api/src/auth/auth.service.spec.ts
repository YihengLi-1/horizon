import { BadRequestException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import argon2 from "argon2";
import { activeSessions, AuthService } from "./auth.service";

function createAuthService() {
  const prisma = {
    inviteCode: {
      findUnique: jest.fn(),
      update: jest.fn()
    },
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn()
    },
    passwordResetToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn()
    },
    emailVerificationToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn()
    },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn()
    },
    $transaction: jest.fn()
  } as any;

  const jwtService = {
    signAsync: jest.fn().mockResolvedValue("jwt-token")
  } as any;

  const auditService = {
    log: jest.fn().mockResolvedValue(undefined)
  } as any;

  const notificationsService = {
    sendVerificationEmail: jest.fn().mockResolvedValue(true)
  } as any;

  const mailService = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined)
  } as any;

  return {
    prisma,
    jwtService,
    auditService,
    notificationsService,
    mailService,
    service: new AuthService(prisma, jwtService, auditService, notificationsService, mailService)
  };
}

function createRequest() {
  return {
    headers: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" }
  } as any;
}

function createResponse() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn()
  } as any;
}

describe("AuthService", () => {
  beforeEach(() => {
    activeSessions.clear();
    jest.clearAllMocks();
  });

  it("login increments loginAttempts on wrong password", async () => {
    const { prisma, service } = createAuthService();
    prisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      email: "student@sis.test",
      studentId: "S1001",
      passwordHash: await argon2.hash("CorrectPass1!"),
      role: "STUDENT",
      emailVerifiedAt: new Date(),
      loginAttempts: 0,
      lockedUntil: null,
      studentProfile: null
    });
    prisma.user.update.mockResolvedValue({});

    await expect(
      service.login({ identifier: "student@sis.test", password: "wrong-pass" } as never, createRequest(), createResponse())
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ loginAttempts: 1, lockedUntil: null })
      })
    );
  });

  it("login sets lockedUntil on the eighth failed attempt", async () => {
    const { prisma, service } = createAuthService();
    prisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      email: "student@sis.test",
      studentId: "S1001",
      passwordHash: await argon2.hash("CorrectPass1!"),
      role: "STUDENT",
      emailVerifiedAt: new Date(),
      loginAttempts: 7,
      lockedUntil: null,
      studentProfile: null
    });
    prisma.user.update.mockResolvedValue({});

    await expect(
      service.login({ identifier: "student@sis.test", password: "wrong-pass" } as never, createRequest(), createResponse())
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const updateCall = prisma.user.update.mock.calls[0]?.[0];
    expect(updateCall?.data.loginAttempts).toBe(8);
    expect(updateCall?.data.lockedUntil).toBeInstanceOf(Date);
  });

  it("login rejects when account is already locked", async () => {
    const { prisma, service } = createAuthService();
    prisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      email: "student@sis.test",
      studentId: "S1001",
      passwordHash: await argon2.hash("CorrectPass1!"),
      role: "STUDENT",
      emailVerifiedAt: new Date(),
      loginAttempts: 5,
      lockedUntil: new Date(Date.now() + 60_000),
      studentProfile: null
    });

    await expect(
      service.login({ identifier: "student@sis.test", password: "CorrectPass1!" } as never, createRequest(), createResponse())
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("login success resets loginAttempts and lockedUntil", async () => {
    const { prisma, service } = createAuthService();
    prisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      email: "student@sis.test",
      studentId: "S1001",
      passwordHash: await argon2.hash("CorrectPass1!"),
      role: "STUDENT",
      emailVerifiedAt: new Date(),
      loginAttempts: 3,
      lockedUntil: new Date(Date.now() - 60_000),
      studentProfile: null
    });
    prisma.user.update.mockResolvedValue({});
    prisma.refreshToken.create.mockResolvedValue({});
    prisma.$transaction.mockResolvedValue([{}, {}]);

    await expect(
      service.login({ identifier: "student@sis.test", password: "CorrectPass1!" } as never, createRequest(), createResponse())
    ).resolves.toEqual(expect.objectContaining({ email: "student@sis.test" }));

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ loginAttempts: 0, lockedUntil: null })
      })
    );
  });

  it("register rejects used invite codes", async () => {
    const { prisma, service } = createAuthService();
    prisma.inviteCode.findUnique.mockResolvedValue({
      id: "invite-1",
      code: "USED-1",
      active: true,
      usedAt: new Date(),
      expiresAt: null,
      maxUses: 1,
      usedCount: 1
    });

    await expect(
      service.register(
        {
          email: "student@sis.test",
          legalName: "Student One",
          studentId: "S1001",
          password: "CorrectPass1!",
          inviteCode: "USED-1"
        } as never,
        createRequest()
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("register marks invite code as used", async () => {
    const { prisma, notificationsService, service } = createAuthService();
    prisma.inviteCode.findUnique.mockResolvedValue({
      id: "invite-1",
      code: "OPEN-1",
      active: true,
      usedAt: null,
      expiresAt: null,
      maxUses: 5,
      usedCount: 0
    });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: "user-1",
      email: "student@sis.test"
    });
    prisma.inviteCode.update.mockResolvedValue({});
    prisma.emailVerificationToken.create.mockResolvedValue({});

    await expect(
      service.register(
        {
          email: "student@sis.test",
          legalName: "Student One",
          studentId: "S1001",
          password: "CorrectPass1!",
          inviteCode: "OPEN-1"
        } as never,
        createRequest()
      )
    ).resolves.toEqual(expect.objectContaining({ message: "注册成功，请先验证邮箱后再登录。" }));

    expect(prisma.inviteCode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "invite-1" },
        data: expect.objectContaining({ usedAt: expect.any(Date) })
      })
    );
    expect(notificationsService.sendVerificationEmail).toHaveBeenCalled();
  });

  it("changePassword rejects incorrect current password", async () => {
    const { prisma, service } = createAuthService();
    prisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      passwordHash: await argon2.hash("CorrectPass1!")
    });

    await expect(service.changePassword("user-1", "wrong-pass", "NewPass1!")).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it("changePassword success deletes all refresh tokens", async () => {
    const { prisma, service } = createAuthService();
    prisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      passwordHash: await argon2.hash("CorrectPass1!")
    });
    prisma.user.update.mockResolvedValue({});
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });
    prisma.$transaction.mockResolvedValue([{}, { count: 3 }]);

    await expect(service.changePassword("user-1", "CorrectPass1!", "NewPass1!")).resolves.toEqual({
      message: "密码已更新"
    });

    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("unlockAccount resets loginAttempts and lockedUntil", async () => {
    const { prisma, service } = createAuthService();
    prisma.user.update.mockResolvedValue({});

    await expect(service.unlockAccount("user-1")).resolves.toEqual({ unlocked: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { loginAttempts: 0, lockedUntil: null }
    });
  });

  it("checkEmailExists returns true for existing emails and false for unknown ones", async () => {
    const { prisma, service } = createAuthService();
    prisma.user.findFirst.mockResolvedValueOnce({ id: "user-1" }).mockResolvedValueOnce(null);

    await expect(service.checkEmailExists("student@sis.test")).resolves.toEqual({ exists: true });
    await expect(service.checkEmailExists("missing@sis.test")).resolves.toEqual({ exists: false });
  });

  it("refresh rejects expired refresh tokens", async () => {
    const { prisma, service } = createAuthService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      token: "expired-token",
      expiresAt: new Date(Date.now() - 60_000),
      userId: "user-1",
      user: {
        id: "user-1",
        email: "student@sis.test",
        role: "STUDENT",
        deletedAt: null,
        studentProfile: null
      }
    });

    await expect(
      service.refresh({ cookies: { "sis-refresh": "expired-token" } } as any, createResponse())
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("register rejects when invite code is expired by date", async () => {
    const { prisma, service } = createAuthService();
    prisma.inviteCode.findUnique.mockResolvedValue({
      id: "invite-expired",
      code: "EXPIRED-1",
      active: true,
      usedAt: null,
      expiresAt: new Date(Date.now() - 60_000), // expired
      maxUses: 5,
      usedCount: 0
    });

    await expect(
      service.register(
        {
          email: "new@sis.test",
          legalName: "New User",
          studentId: "S2001",
          password: "CorrectPass1!",
          inviteCode: "EXPIRED-1"
        } as never,
        createRequest()
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("register rejects when invite code not found", async () => {
    const { prisma, service } = createAuthService();
    prisma.inviteCode.findUnique.mockResolvedValue(null);

    await expect(
      service.register(
        {
          email: "new@sis.test",
          legalName: "New User",
          studentId: "S2002",
          password: "CorrectPass1!",
          inviteCode: "NONEXISTENT"
        } as never,
        createRequest()
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("login rejects non-existent user", async () => {
    const { prisma, service } = createAuthService();
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.login({ identifier: "ghost@sis.test", password: "Pass1!" } as never, createRequest(), createResponse())
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refresh rejects when no refresh token cookie is provided", async () => {
    const { service } = createAuthService();
    await expect(
      service.refresh({ cookies: {} } as any, createResponse())
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe("requestPasswordReset", () => {
    it("returns generic message when user not found (no enumeration)", async () => {
      const { prisma, mailService, service } = createAuthService();
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.requestPasswordReset("notexist@test.com")).resolves.toEqual({
        message: "如果该邮箱已注册，重置链接已发送"
      });
      expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
    });

    it("creates token and sends email when user exists", async () => {
      const { prisma, mailService, service } = createAuthService();
      prisma.user.findFirst.mockResolvedValue({
        id: "u1",
        email: "test@test.com",
        deletedAt: null
      });
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });
      prisma.passwordResetToken.create.mockResolvedValue({ id: "prt-1" });
      prisma.$transaction.mockResolvedValue([{}, {}]);

      await expect(service.requestPasswordReset("test@test.com")).resolves.toEqual({
        message: "如果该邮箱已注册，重置链接已发送"
      });
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
      expect(mailService.sendPasswordReset).toHaveBeenCalledTimes(1);
      expect(mailService.sendPasswordReset).toHaveBeenCalledWith("test@test.com", expect.any(String));
    });
  });

  describe("resetPassword", () => {
    it("throws when token is expired", async () => {
      const { prisma, service } = createAuthService();
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "prt-1",
        token: "expired",
        userId: "u1",
        usedAt: null,
        expiresAt: new Date(0)
      });

      await expect(service.resetPassword("expired", "NewPass1!")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("throws when token already used", async () => {
      const { prisma, service } = createAuthService();
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "prt-1",
        token: "used",
        userId: "u1",
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 10_000)
      });

      await expect(service.resetPassword("used", "NewPass1!")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("throws when token not found", async () => {
      const { prisma, service } = createAuthService();
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword("ghost", "NewPass1!")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("throws WEAK_PASSWORD when new password is too simple", async () => {
      const { prisma, service } = createAuthService();
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "prt-1",
        token: "valid-tok",
        userId: "u1",
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000)
      });
      prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "u@t.com", deletedAt: null });

      await expect(service.resetPassword("valid-tok", "short")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("successfully resets password and invalidates sessions", async () => {
      const { prisma, auditService, service } = createAuthService();
      // Pre-load an active session for this user
      const { activeSessions: sessions } = await import("./auth.service");
      sessions.set("sess-abc", { userId: "u1", email: "u@t.com", loginAt: new Date() });

      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: "prt-1",
        token: "valid-tok",
        userId: "u1",
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000)
      });
      prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "u@t.com", deletedAt: null });
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = {
          user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          passwordResetToken: { updateMany: jest.fn().mockResolvedValue({}) },
          refreshToken: { deleteMany: jest.fn().mockResolvedValue({}) }
        };
        return fn(tx);
      });

      const result = await service.resetPassword("valid-tok", "StrongPass1!");
      expect(result).toEqual({ message: "密码已重置，请重新登录" });
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: "password_reset" }));
      // Session should be purged
      expect(sessions.has("sess-abc")).toBe(false);
    });
  });

  describe("changePassword", () => {
    it("throws USER_NOT_FOUND when user does not exist", async () => {
      const { prisma, service } = createAuthService();
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.changePassword("u1", "old", "NewPass1!")).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("throws INVALID_CURRENT_PASSWORD when old password is wrong", async () => {
      const { prisma, service } = createAuthService();
      const argon2mod = await import("argon2");
      prisma.user.findFirst.mockResolvedValue({
        id: "u1",
        passwordHash: await argon2mod.default.hash("CorrectPass1!")
      });

      await expect(service.changePassword("u1", "WrongPass1!", "NewPass1!")).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("checkEmailExists", () => {
    it("returns { exists: false } for blank email", async () => {
      const { service } = createAuthService();
      const result = await service.checkEmailExists("   ");
      expect(result).toEqual({ exists: false });
    });

    it("returns { exists: true } when user found", async () => {
      const { prisma, service } = createAuthService();
      prisma.user.findFirst.mockResolvedValue({ id: "u1" });

      const result = await service.checkEmailExists("existing@test.com");
      expect(result).toEqual({ exists: true });
    });

    it("returns { exists: false } when user not found", async () => {
      const { prisma, service } = createAuthService();
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.checkEmailExists("unknown@test.com");
      expect(result).toEqual({ exists: false });
    });
  });

  describe("unlockAccount", () => {
    it("calls prisma.user.update with zeroed loginAttempts", async () => {
      const { prisma, service } = createAuthService();
      prisma.user.update.mockResolvedValue({});

      const result = await service.unlockAccount("u1");
      expect(result).toEqual({ unlocked: true });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "u1" },
          data: expect.objectContaining({ loginAttempts: 0, lockedUntil: null })
        })
      );
    });
  });

  describe("register — additional branches", () => {
    it("rejects when maxUses is exhausted (INVITE_EXHAUSTED)", async () => {
      const { prisma, service } = createAuthService();
      prisma.inviteCode.findUnique.mockResolvedValue({
        id: "invite-1",
        code: "FULL-1",
        active: true,
        usedAt: null,
        expiresAt: null,
        maxUses: 3,
        usedCount: 3
      });

      await expect(
        service.register(
          { email: "a@sis.test", legalName: "A", studentId: "S9001", password: "Pass1!", inviteCode: "FULL-1" } as never,
          createRequest()
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects when email or studentId already registered (USER_EXISTS)", async () => {
      const { prisma, service } = createAuthService();
      prisma.inviteCode.findUnique.mockResolvedValue({
        id: "invite-2",
        code: "OK-1",
        active: true,
        usedAt: null,
        expiresAt: null,
        maxUses: 10,
        usedCount: 0
      });
      prisma.user.findFirst.mockResolvedValue({ id: "existing-user" });

      await expect(
        service.register(
          { email: "dup@sis.test", legalName: "Dup", studentId: "S1001", password: "Pass1!", inviteCode: "OK-1" } as never,
          createRequest()
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("verifyEmail", () => {
    it("throws INVALID_TOKEN when token not found", async () => {
      const { prisma, service } = createAuthService();
      prisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      await expect(service.verifyEmail({ token: "ghost" } as never)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("throws INVALID_TOKEN when token is already used", async () => {
      const { prisma, service } = createAuthService();
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: "evt-1",
        token: "used-tok",
        userId: "u1",
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000)
      });

      await expect(service.verifyEmail({ token: "used-tok" } as never)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("throws INVALID_TOKEN when token is expired", async () => {
      const { prisma, service } = createAuthService();
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: "evt-2",
        token: "expired-tok",
        userId: "u1",
        usedAt: null,
        expiresAt: new Date(Date.now() - 60_000)
      });

      await expect(service.verifyEmail({ token: "expired-tok" } as never)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("succeeds and marks token used + verifies user email", async () => {
      const { prisma, service } = createAuthService();
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: "evt-3",
        token: "valid-tok",
        userId: "u1",
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000)
      });
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.verifyEmail({ token: "valid-tok" } as never);
      expect(result).toEqual({ message: "邮箱验证成功" });
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe("resendVerificationEmail", () => {
    it("returns generic message when user not found", async () => {
      const { prisma, notificationsService, service } = createAuthService();
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await service.resendVerificationEmail("notfound@sis.test");
      expect(result).toEqual(
        expect.objectContaining({ message: expect.stringContaining("若该邮箱") })
      );
      expect(notificationsService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("returns generic message when user is already verified (no-op)", async () => {
      const { prisma, notificationsService, service } = createAuthService();
      prisma.user.findFirst.mockResolvedValue({
        id: "u1",
        email: "verified@sis.test",
        emailVerifiedAt: new Date(),
        deletedAt: null,
        studentProfile: null
      });

      const result = await service.resendVerificationEmail("verified@sis.test");
      expect(result).toEqual(
        expect.objectContaining({ message: expect.stringContaining("若该邮箱") })
      );
      expect(notificationsService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it("sends new verification email for unverified user", async () => {
      const { prisma, notificationsService, service } = createAuthService();
      prisma.user.findFirst.mockResolvedValue({
        id: "u1",
        email: "unverified@sis.test",
        emailVerifiedAt: null,
        deletedAt: null,
        studentProfile: { legalName: "Test User" }
      });
      prisma.emailVerificationToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.emailVerificationToken.create.mockResolvedValue({});

      const result = await service.resendVerificationEmail("unverified@sis.test");
      expect(result).toEqual(
        expect.objectContaining({ message: expect.stringContaining("若该邮箱") })
      );
      expect(prisma.emailVerificationToken.updateMany).toHaveBeenCalled();
      expect(prisma.emailVerificationToken.create).toHaveBeenCalled();
      expect(notificationsService.sendVerificationEmail).toHaveBeenCalled();
    });
  });

  describe("findOrCreateSsoUser", () => {
    it("returns existing user data when email already registered", async () => {
      const { prisma, service } = createAuthService();
      prisma.user.findFirst.mockResolvedValue({
        id: "sso-1",
        email: "sso@sis.test",
        role: "STUDENT",
        emailVerifiedAt: new Date()
      });

      const result = await service.findOrCreateSsoUser("sso@sis.test", {});
      expect(result).toEqual({ userId: "sso-1", email: "sso@sis.test", role: "STUDENT" });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("creates a new SSO user when email not found", async () => {
      const { prisma, service } = createAuthService();
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: "sso-new",
        email: "newuser@sis.test",
        role: "STUDENT",
        emailVerifiedAt: new Date()
      });

      const result = await service.findOrCreateSsoUser("newuser@sis.test", {});
      expect(result).toEqual({ userId: "sso-new", email: "newuser@sis.test", role: "STUDENT" });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: "newuser@sis.test", ssoProvider: "saml" })
        })
      );
    });
  });

  describe("getSessions and revokeSession", () => {
    it("getSessions returns all active sessions", () => {
      const { service } = createAuthService();
      activeSessions.set("s1", { userId: "u1", email: "a@b.com", loginAt: new Date() });
      activeSessions.set("s2", { userId: "u2", email: "c@d.com", loginAt: new Date() });

      const sessions = service.getSessions();
      expect(sessions.length).toBeGreaterThanOrEqual(2);
      expect(sessions.find((s) => s.id === "s1")).toBeDefined();
    });

    it("revokeSession removes the session from activeSessions", () => {
      const { service } = createAuthService();
      activeSessions.set("sess-to-revoke", { userId: "u1", email: "x@y.com", loginAt: new Date() });

      const result = service.revokeSession("sess-to-revoke");
      expect(result).toEqual({ revoked: true });
      expect(activeSessions.has("sess-to-revoke")).toBe(false);
    });
  });

  describe("changePassword — session purge", () => {
    it("clears active sessions for the user on successful password change", async () => {
      const { prisma, service } = createAuthService();
      const argon2mod = await import("argon2");
      prisma.user.findFirst.mockResolvedValue({
        id: "u-pw",
        passwordHash: await argon2mod.default.hash("OldPass1!")
      });
      prisma.$transaction.mockResolvedValue([{}, { count: 1 }]);

      // Plant an active session for this user
      activeSessions.set("sess-pw", { userId: "u-pw", email: "x@y.com", loginAt: new Date() });

      await service.changePassword("u-pw", "OldPass1!", "NewPass1!");

      expect(activeSessions.has("sess-pw")).toBe(false);
    });
  });

  describe("login — email not verified branch", () => {
    it("rejects with UnauthorizedException when email not verified", async () => {
      const { prisma, service } = createAuthService();
      prisma.user.findFirst.mockResolvedValue({
        id: "u-unv",
        email: "unv@sis.test",
        studentId: "S9999",
        passwordHash: await argon2.hash("Pass1!"),
        role: "STUDENT",
        emailVerifiedAt: null,   // not verified
        loginAttempts: 0,
        lockedUntil: null,
        studentProfile: null
      });

      await expect(
        service.login({ identifier: "unv@sis.test", password: "Pass1!" } as never, createRequest(), createResponse())
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
