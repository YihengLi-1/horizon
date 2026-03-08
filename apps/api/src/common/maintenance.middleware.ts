import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { Request, Response } from "express";
import { TtlCache } from "./cache";
import { PrismaService } from "./prisma.service";

export const maintenanceModeCache = new TtlCache<string>();

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: () => void) {
    const path = req.path || req.originalUrl || "";
    if (path.startsWith("/admin") || path.startsWith("/auth") || path.startsWith("/ops")) {
      next();
      return;
    }

    let mode = maintenanceModeCache.get("maintenance_mode");
    if (mode === undefined) {
      const setting = await this.prisma.systemSetting.findUnique({
        where: { key: "maintenance_mode" }
      }).catch(() => null);
      mode = setting?.value ?? "false";
      maintenanceModeCache.set("maintenance_mode", mode, 60_000);
    }

    if (mode === "true") {
      res.setHeader("Set-Cookie", "sis-maintenance=true; Path=/; Max-Age=300; HttpOnly; SameSite=Lax");
      res.status(503).json({
        message: "系统维护中，请稍后再试",
        maintenance: true
      });
      return;
    }

    res.setHeader("Set-Cookie", "sis-maintenance=; Path=/; Max-Age=0; SameSite=Lax");
    next();
  }
}
