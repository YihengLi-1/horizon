import { Injectable } from "@nestjs/common";
import { AdminPermission } from "./admin-permissions";

@Injectable()
export class AdminPermissionService {
  private readonly superAdminUserIds = new Set(
    (process.env.SUPERADMIN_USER_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  private readonly defaultAllow = (process.env.ADMIN_PERMISSION_DEFAULT_ALLOW || "true").toLowerCase() === "true";

  private readonly overrideMap = this.parseOverrides(process.env.ADMIN_PERMISSION_OVERRIDES || "");

  private parseOverrides(raw: string): Map<string, Set<string>> {
    if (!raw.trim()) return new Map();
    try {
      const parsed = JSON.parse(raw) as Record<string, string[]>;
      const map = new Map<string, Set<string>>();
      for (const [userId, permissions] of Object.entries(parsed)) {
        map.set(userId, new Set(Array.isArray(permissions) ? permissions : []));
      }
      return map;
    } catch {
      return new Map();
    }
  }

  hasPermission(userId: string, permission: AdminPermission): boolean {
    if (this.superAdminUserIds.has(userId)) return true;

    const override = this.overrideMap.get(userId);
    if (override) {
      return override.has("*") || override.has(permission);
    }

    return this.defaultAllow;
  }
}
