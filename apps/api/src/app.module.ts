import { MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
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
import { MaintenanceMiddleware } from "./common/maintenance.middleware";
import { FacultyModule } from "./faculty/faculty.module";
import { AdvisingModule } from "./advising/advising.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: Number(process.env.THROTTLE_TTL ?? 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 100)
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
    FacultyModule,
    AdvisingModule,
    HealthModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard
    }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MaintenanceMiddleware).forRoutes({ path: "students/*", method: RequestMethod.ALL });
  }
}
