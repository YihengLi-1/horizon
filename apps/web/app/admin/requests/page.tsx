import { requireRole } from "@/lib/server-auth";
import AdminRequestsClient from "./AdminRequestsClient";

export const dynamic = "force-dynamic";

export default async function AdminRequestsPage() {
  await requireRole("ADMIN");

  return (
    <div className="campus-page">
      <AdminRequestsClient />
    </div>
  );
}
