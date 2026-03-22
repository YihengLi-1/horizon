import { AuditService } from "./audit.service";

function createAuditService() {
  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    auditLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "a1" })
    }
  } as any;

  const prisma = {
    auditLog: tx.auditLog,
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
  } as any;

  return { service: new AuditService(prisma), prisma, tx };
}

describe("AuditService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("初始 actionCounters 为空", () => {
    const { service } = createAuditService();
    expect(service.getActionCounts()).toEqual({});
  });

  it("log 会在事务中写入审计记录并生成完整性哈希", async () => {
    const { service, prisma, tx } = createAuditService();
    tx.auditLog.findFirst.mockResolvedValue({ integrityHash: "prev-hash" });

    await service.log({
      actorUserId: "u1",
      action: "LOGIN",
      entityType: "User",
      entityId: "u1",
      metadata: { success: true },
      req: {
        ip: "127.0.0.1",
        headers: { "user-agent": "jest-test" }
      } as any
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith('LOCK TABLE "AuditLog" IN SHARE ROW EXCLUSIVE MODE');
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "u1",
        action: "LOGIN",
        entityType: "User",
        entityId: "u1",
        metadata: { success: true },
        ip: "127.0.0.1",
        userAgent: "jest-test",
        prevIntegrityHash: "prev-hash",
        integrityHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    });
    expect(service.getActionCounts()).toEqual({ LOGIN: 1 });
  });

  it("log 在 metadata 为空和 actorUserId 缺失时也能正常记录", async () => {
    const { service, tx } = createAuditService();

    await service.log({
      action: "SYSTEM_EVENT",
      entityType: "System",
      entityId: null,
      metadata: null
    });

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: null,
        action: "SYSTEM_EVENT",
        entityType: "System",
        entityId: null,
        metadata: undefined,
        prevIntegrityHash: null
      })
    });
  });

  it("logInTransaction 使用传入的事务客户端写入", async () => {
    const { service } = createAuditService();
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
      auditLog: {
        findFirst: jest.fn().mockResolvedValue({ integrityHash: "seed" }),
        create: jest.fn().mockResolvedValue({ id: "a2" })
      }
    } as any;

    await service.logInTransaction(tx, {
      actorUserId: undefined,
      action: "PASSWORD_RESET",
      entityType: "User",
      entityId: "u2",
      metadata: { reason: "forgot-password" }
    });

    expect(tx.$executeRawUnsafe).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: null,
        action: "PASSWORD_RESET",
        entityType: "User",
        entityId: "u2",
        metadata: { reason: "forgot-password" },
        prevIntegrityHash: "seed"
      })
    });
    expect(service.getActionCounts()).toEqual({ PASSWORD_RESET: 1 });
  });

  it("多次 log 会累计 action counter", async () => {
    const { service } = createAuditService();

    await service.log({ action: "LOGIN", entityType: "User", entityId: "u1" });
    await service.log({ action: "LOGIN", entityType: "User", entityId: "u2" });
    await service.log({ action: "LOGOUT", entityType: "User", entityId: "u1" });

    expect(service.getActionCounts()).toEqual({ LOGIN: 2, LOGOUT: 1 });
  });
});
