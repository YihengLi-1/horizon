import { requireRole } from "@/lib/server-auth";
import FacultyRequestsClient from "./FacultyRequestsClient";

export const dynamic = "force-dynamic";

export default async function FacultyRequestsPage() {
  await requireRole("FACULTY");

  return (
    <div className="campus-page">
      <FacultyRequestsClient />
    </div>
  );
}
