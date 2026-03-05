import { Global, Module } from "@nestjs/common";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { AdminPermissionService } from "./admin-permission.service";

@Global()
@Module({
  providers: [AdminPermissionService, AdminPermissionGuard],
  exports: [AdminPermissionService, AdminPermissionGuard]
})
export class AuthzModule {}
