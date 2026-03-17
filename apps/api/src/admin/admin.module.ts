import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { GovernanceModule } from "../governance/governance.module";
import { RegistrationModule } from "../registration/registration.module";

@Module({
  imports: [AuditModule, NotificationsModule, RegistrationModule, GovernanceModule],
  controllers: [AdminController],
  providers: [AdminService]
})
export class AdminModule {}
