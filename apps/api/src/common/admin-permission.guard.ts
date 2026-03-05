import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminPermissionService } from "./admin-permission.service";
import { ADMIN_PERMISSION_METADATA_KEY, AdminPermission } from "./admin-permissions";

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: AdminPermissionService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<AdminPermission[]>(ADMIN_PERMISSION_METADATA_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user as { userId?: string; role?: "STUDENT" | "ADMIN" };

    if (!user?.userId || user.role !== "ADMIN") {
      throw new ForbiddenException({
        code: "ADMIN_PERMISSION_DENIED",
        message: "Admin permission required"
      });
    }

    const denied = requiredPermissions.find((permission) => !this.permissionService.hasPermission(user.userId as string, permission));
    if (denied) {
      throw new ForbiddenException({
        code: "ADMIN_PERMISSION_DENIED",
        message: `Missing admin permission: ${denied}`,
        details: { missingPermission: denied }
      });
    }

    return true;
  }
}
