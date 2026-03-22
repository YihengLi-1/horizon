import { BullModule } from "@nestjs/bull";
import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { RegistrationModule } from "../registration/registration.module";
import { EnrollmentProcessor } from "./enrollment.processor";

@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST ?? "localhost",
        port: parseInt(process.env.REDIS_PORT ?? "6379", 10)
      }
    }),
    BullModule.registerQueue({ name: "enrollment" }),
    RegistrationModule,
    NotificationsModule
  ],
  providers: [EnrollmentProcessor],
  exports: [BullModule]
})
export class EnrollmentQueueModule {}
