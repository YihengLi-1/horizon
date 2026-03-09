import FacultyRosterClient from "./FacultyRosterClient";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function FacultySectionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("FACULTY");
  const { id } = await params;

  return (
    <div className="campus-page">
      <FacultyRosterClient sectionId={id} />
    </div>
  );
}
