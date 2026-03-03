import { type ReactNode } from "react";
import { requireRole } from "@/lib/server-auth";
import { AppShell } from "@/components/app-shell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await requireRole("ADMIN");

  return <AppShell area="admin" userLabel={me.email}>{children}</AppShell>;
}
