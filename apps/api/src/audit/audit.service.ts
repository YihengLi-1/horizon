import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { Request } from "express";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class AuditService {
  private readonly actionCounters = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  getActionCounts(): Record<string, number> {
    return Object.fromEntries(this.actionCounters.entries());
  }

  private canonicalizeMetadata(metadata?: Record<string, unknown> | null): Prisma.InputJsonValue | undefined {
    if (!metadata) return undefined;
    return JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue;
  }

  private buildIntegrityHash(input: {
    prevIntegrityHash: string | null;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata?: Prisma.InputJsonValue;
    ip: string | null;
    userAgent: string | null;
  }): string {
    const canonicalPayload = JSON.stringify({
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? null,
      ip: input.ip,
      userAgent: input.userAgent
    });
    return createHash("sha256")
      .update(`${input.prevIntegrityHash ?? "GENESIS"}|${canonicalPayload}`)
      .digest("hex");
  }

  private async createIntegrityLog(
    client: Prisma.TransactionClient,
    params: {
      actorUserId?: string | null;
      action: string;
      entityType: string;
      entityId?: string | null;
      metadata?: Record<string, unknown> | null;
      req?: Request;
    }
  ): Promise<void> {
    const { actorUserId, action, entityType, entityId, metadata, req } = params;
    const normalizedMetadata = this.canonicalizeMetadata(metadata);
    const ip = req?.ip ?? null;
    const rawUserAgent = req?.headers["user-agent"] as unknown;
    const userAgent =
      typeof rawUserAgent === "string"
        ? rawUserAgent
        : Array.isArray(rawUserAgent)
          ? rawUserAgent.join(", ")
          : null;

    await client.$executeRawUnsafe('LOCK TABLE "AuditLog" IN SHARE ROW EXCLUSIVE MODE');
    const previous = await client.auditLog.findFirst({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { integrityHash: true }
    });

    const integrityHash = this.buildIntegrityHash({
      prevIntegrityHash: previous?.integrityHash ?? null,
      actorUserId: actorUserId ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      metadata: normalizedMetadata,
      ip,
      userAgent
    });

    await client.auditLog.create({
      data: {
        actorUserId: actorUserId ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        metadata: normalizedMetadata,
        ip,
        userAgent,
        prevIntegrityHash: previous?.integrityHash ?? null,
        integrityHash
      }
    });
  }

  async log(params: {
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown> | null;
    req?: Request;
  }): Promise<void> {
    this.actionCounters.set(params.action, (this.actionCounters.get(params.action) ?? 0) + 1);
    await this.prisma.$transaction(async (tx) => {
      await this.createIntegrityLog(tx, params);
    });
  }

  async logInTransaction(
    tx: Prisma.TransactionClient,
    params: {
      actorUserId?: string | null;
      action: string;
      entityType: string;
      entityId?: string | null;
      metadata?: Record<string, unknown> | null;
      req?: Request;
    }
  ): Promise<void> {
    this.actionCounters.set(params.action, (this.actionCounters.get(params.action) ?? 0) + 1);
    await this.createIntegrityLog(tx, params);
  }
}
