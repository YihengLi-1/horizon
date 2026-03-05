import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthzModule } from "./common/authz.module";
import { PrismaModule } from "./common/prisma.module";
import { RateLimitGuard } from "./common/rate-limit.guard";
import { AuthModule } from "./auth/auth.module";
import { StudentsModule } from "./students/students.module";
import { AcademicsModule } from "./academics/academics.module";
import { RegistrationModule } from "./registration/registration.module";
import { AdminModule } from "./admin/admin.module";
import { AuditModule } from "./audit/audit.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 60
      }
    ]),
    AuthzModule,
    PrismaModule,
    AuditModule,
    AuthModule,
    StudentsModule,
    AcademicsModule,
    RegistrationModule,
    AdminModule,
    HealthModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard
    }
  ]
})
export class AppModule {}
