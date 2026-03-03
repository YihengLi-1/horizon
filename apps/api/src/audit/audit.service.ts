import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Request } from "express";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class AuditService {
  private readonly actionCounters = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  getActionCounts(): Record<string, number> {
    return Object.fromEntries(this.actionCounters.entries());
  }

  async log(params: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown> | null;
    req?: Request;
  }): Promise<void> {
    const { actorUserId, action, entityType, entityId, metadata, req } = params;
    this.actionCounters.set(action, (this.actionCounters.get(action) ?? 0) + 1);
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actorUserId ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: req?.ip,
        userAgent: req?.headers["user-agent"]
      }
    });
  }
}
