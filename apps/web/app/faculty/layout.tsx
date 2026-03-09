import { type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/server-auth";

export default async function FacultyLayout({ children }: { children: ReactNode }) {
  const me = await requireRole("FACULTY");
  return <AppShell area="faculty" userLabel={me.email}>{children}</AppShell>;
}
