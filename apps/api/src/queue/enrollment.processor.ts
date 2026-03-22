import { Process, Processor } from "@nestjs/bull";
import { Job } from "bull";
import { NotificationsService } from "../notifications/notifications.service";
import { RegistrationService } from "../registration/registration.service";

type EnrollmentJobPayload = {
  userId: string;
  termId: string;
  cartItemIds?: string[];
};

@Processor("enrollment")
export class EnrollmentProcessor {
  constructor(
    private readonly registrationService: RegistrationService,
    private readonly notificationsService: NotificationsService
  ) {}

  @Process()
  async handle(job: Job<EnrollmentJobPayload>) {
    try {
      const result = await this.registrationService.processEnrollmentJob(job.data);
      await this.notificationsService.recordNotification(
        job.data.userId,
        "选课任务已处理",
        `本次选课任务已处理完成，共生成 ${result.length} 条注册记录。`,
        "queue"
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "选课任务处理失败";
      await this.notificationsService.recordNotification(
        job.data.userId,
        "选课任务处理失败",
        message,
        "queue"
      );
      throw error;
    }
  }
}
