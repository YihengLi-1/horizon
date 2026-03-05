import { SetMetadata } from "@nestjs/common";
import { ADMIN_PERMISSION_METADATA_KEY, AdminPermission } from "./admin-permissions";

export const RequireAdminPermissions = (...permissions: AdminPermission[]) =>
  SetMetadata(ADMIN_PERMISSION_METADATA_KEY, permissions);
