import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import { PrismaHealthIndicator } from "./prisma.health";

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator
  ) {}

  @Get("health")
  @HealthCheck()
  async check() {
    return this.health.check([() => this.prisma.isHealthy("db")]);
  }
}
