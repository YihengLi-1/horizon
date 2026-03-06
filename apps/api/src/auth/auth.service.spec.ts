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
      create: jest.fn(),
      update: jest.fn()
    },
    emailVerificationToken: {
      create: jest.fn()
    },
    refreshToken: {
      create: jest.fn(),
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

  return {
    prisma,
    jwtService,
    auditService,
    notificationsService,
    service: new AuthService(prisma, jwtService, auditService, notificationsService)
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
    ).resolves.toEqual(expect.objectContaining({ message: expect.stringContaining("Registration successful") }));

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
      message: "Password updated"
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
});
