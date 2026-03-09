import { Module } from "@nestjs/common";
import { RegistrationController } from "./registration.controller";
import { RegistrationService } from "./registration.service";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { GovernanceModule } from "../governance/governance.module";

@Module({
  imports: [AuditModule, NotificationsModule, GovernanceModule],
  controllers: [RegistrationController],
  providers: [RegistrationService],
  exports: [RegistrationService]
})
export class RegistrationModule {}
