import { type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/server-auth";

export default async function AdvisorLayout({ children }: { children: ReactNode }) {
  const me = await requireRole("ADVISOR");
  return <AppShell area="advisor" userLabel={me.email}>{children}</AppShell>;
}
