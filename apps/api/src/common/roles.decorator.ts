import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";
export const Roles = (...roles: Array<"STUDENT" | "ADMIN">) => SetMetadata(ROLES_KEY, roles);
