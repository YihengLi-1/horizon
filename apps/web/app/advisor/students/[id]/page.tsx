import AdvisorNotesClient from "./AdvisorNotesClient";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function AdvisorStudentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("ADVISOR");
  const { id } = await params;

  return (
    <div className="campus-page">
      <AdvisorNotesClient studentId={id} />
    </div>
  );
}
