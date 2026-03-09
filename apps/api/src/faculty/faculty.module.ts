import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { FacultyController } from "./faculty.controller";
import { FacultyService } from "./faculty.service";

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [FacultyController],
  providers: [FacultyService]
})
export class FacultyModule {}
