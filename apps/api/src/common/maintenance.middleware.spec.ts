import { MaintenanceMiddleware, maintenanceModeCache } from "./maintenance.middleware";
import type { Request, Response } from "express";

describe("MaintenanceMiddleware", () => {
  let middleware: MaintenanceMiddleware;
  let mockPrisma: { systemSetting: { findUnique: jest.Mock } };
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    // Clear the in-process cache between tests
    maintenanceModeCache.del("maintenance_mode");

    mockPrisma = {
      systemSetting: { findUnique: jest.fn() }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn()
    } as Partial<Response>;

    mockNext = jest.fn();

    middleware = new MaintenanceMiddleware(mockPrisma as never);
  });

  function makeReq(path: string): Partial<Request> {
    return { path, originalUrl: path } as Partial<Request>;
  }

  it("passes through /admin routes without checking DB", async () => {
    await middleware.use(makeReq("/admin/users") as Request, mockRes as Response, mockNext);
    expect(mockPrisma.systemSetting.findUnique).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });

  it("passes through /auth routes without checking DB", async () => {
    await middleware.use(makeReq("/auth/login") as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it("passes through /ops routes without checking DB", async () => {
    await middleware.use(makeReq("/ops/health") as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it("returns 503 when maintenance_mode is true", async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValueOnce({ key: "maintenance_mode", value: "true" });
    await middleware.use(makeReq("/students/me") as Request, mockRes as Response, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ maintenance: true }));
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("calls next() when maintenance_mode is false", async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValueOnce({ key: "maintenance_mode", value: "false" });
    await middleware.use(makeReq("/students/me") as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it("defaults to false when setting is not in DB", async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValueOnce(null);
    await middleware.use(makeReq("/students/me") as Request, mockRes as Response, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it("uses cached value on second call, skipping DB", async () => {
    mockPrisma.systemSetting.findUnique.mockResolvedValue({ key: "maintenance_mode", value: "false" });

    // First call hits DB
    await middleware.use(makeReq("/students/me") as Request, mockRes as Response, mockNext);
    // Second call uses cache
    mockPrisma.systemSetting.findUnique.mockClear();
    await middleware.use(makeReq("/students/me") as Request, mockRes as Response, mockNext);

    expect(mockPrisma.systemSetting.findUnique).not.toHaveBeenCalled();
  });

  it("gracefully handles DB errors", async () => {
    mockPrisma.systemSetting.findUnique.mockRejectedValueOnce(new Error("DB error"));
    // Should not throw — catch(() => null) falls back to "false"
    await expect(
      middleware.use(makeReq("/students/me") as Request, mockRes as Response, mockNext)
    ).resolves.not.toThrow();
    expect(mockNext).toHaveBeenCalled();
  });
});
