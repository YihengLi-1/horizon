import { Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ok } from "../common/response";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("STUDENT", "ADMIN")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(@CurrentUser() user: { userId: string }) {
    return ok(await this.notificationsService.getNotifications(user.userId));
  }

  @Patch(":id/read")
  async markRead(@Param("id") id: string) {
    return ok(await this.notificationsService.markNotificationRead(id));
  }

  @Get("unread-count")
  async unreadCount(@CurrentUser() user: { userId: string }) {
    return ok(await this.notificationsService.getUnreadCount(user.userId));
  }
}
