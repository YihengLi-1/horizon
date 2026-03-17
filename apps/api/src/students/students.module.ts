import { Module } from "@nestjs/common";
import { StudentsController } from "./students.controller";
import { StudentsService } from "./students.service";
import { AuditModule } from "../audit/audit.module";
import { GovernanceModule } from "../governance/governance.module";

@Module({
  imports: [AuditModule, GovernanceModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService]
})
export class StudentsModule {}
