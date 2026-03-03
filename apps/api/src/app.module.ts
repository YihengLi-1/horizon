import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./common/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { StudentsModule } from "./students/students.module";
import { AcademicsModule } from "./academics/academics.module";
import { RegistrationModule } from "./registration/registration.module";
import { AdminModule } from "./admin/admin.module";
import { AuditModule } from "./audit/audit.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    StudentsModule,
    AcademicsModule,
    RegistrationModule,
    AdminModule
  ]
})
export class AppModule {}
