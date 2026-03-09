import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AdvisingController } from "./advising.controller";
import { AdvisingService } from "./advising.service";

@Module({
  imports: [AuditModule],
  controllers: [AdvisingController],
  providers: [AdvisingService]
})
export class AdvisingModule {}
