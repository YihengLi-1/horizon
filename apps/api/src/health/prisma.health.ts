import { Injectable } from "@nestjs/common";
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from "@nestjs/terminus";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true, { status: "up" });
    } catch (error) {
      throw new HealthCheckError(
        "Prisma health check failed",
        this.getStatus(key, false, { status: "down", message: error instanceof Error ? error.message : "unknown" })
      );
    }
  }
}
