import { requireRole } from "@/lib/server-auth";
import AdminHoldsClient from "./AdminHoldsClient";

export default async function AdminHoldsPage() {
  await requireRole("ADMIN");
  return <AdminHoldsClient />;
}
