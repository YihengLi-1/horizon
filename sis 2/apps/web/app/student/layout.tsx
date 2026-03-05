import { type ReactNode } from "react";
import { requireRole } from "@/lib/server-auth";
import { AppShell } from "@/components/app-shell";

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const me = await requireRole("STUDENT");
  const displayName = me.profile?.legalName || me.email;
  const userLabel = me.studentId ? `${displayName} (${me.studentId})` : displayName;

  return <AppShell area="student" userLabel={userLabel}>{children}</AppShell>;
}
