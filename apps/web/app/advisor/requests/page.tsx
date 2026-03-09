import { requireRole } from "@/lib/server-auth";
import AdvisorRequestsClient from "./AdvisorRequestsClient";

export const dynamic = "force-dynamic";

export default async function AdvisorRequestsPage() {
  await requireRole("ADVISOR");

  return (
    <div className="campus-page">
      <AdvisorRequestsClient />
    </div>
  );
}
