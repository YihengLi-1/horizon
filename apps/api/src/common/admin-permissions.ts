export const ADMIN_PERMISSIONS = [
  "dashboard:read",
  "terms:read",
  "terms:write",
  "courses:read",
  "courses:write",
  "sections:read",
  "sections:write",
  "enrollments:read",
  "enrollments:write",
  "waitlist:read",
  "waitlist:promote",
  "invite-codes:read",
  "invite-codes:write",
  "announcements:read",
  "announcements:write",
  "audit:read",
  "students:read",
  "students:write",
  "import:write",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_PERMISSION_METADATA_KEY = "admin_permissions";
