import { Module } from "@nestjs/common";
import { RegistrationController } from "./registration.controller";
import { SectionsController } from "./sections.controller";
import { RegistrationService } from "./registration.service";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { GovernanceModule } from "../governance/governance.module";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [AuditModule, NotificationsModule, GovernanceModule, MailModule],
  controllers: [RegistrationController, SectionsController],
  providers: [RegistrationService],
  exports: [RegistrationService]
})
export class RegistrationModule {}
