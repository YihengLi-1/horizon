import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";

type AdviseeAssignment = {
  id: string;
  assignedAt: string;
  student: {
    id: string;
    email: string;
    studentId?: string | null;
    studentProfile?: {
      legalName?: string;
      programMajor?: string | null;
      academicStatus?: string | null;
      enrollmentStatus?: string | null;
    } | null;
  };
};

export default async function AdvisorDashboardPage() {
  await requireRole("ADVISOR");
  let assignments: AdviseeAssignment[] = [];
  let error = "";
  try {
    assignments = await serverApi<AdviseeAssignment[]>("/advising/advisees");
  } catch (err) {
    error = err instanceof Error ? err.message : "Unable to load advisor workspace";
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Advising</p>
        <h1 className="font-heading text-3xl font-bold text-slate-900">Assigned Advisees</h1>
        <p className="mt-2 text-sm text-slate-600">
          Review your assigned students and record advising notes on their academic progress.
        </p>
      </section>

      <section className="campus-toolbar">
        <div className="campus-kpi">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active Advisees</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{assignments.length}</p>
        </div>
      </section>

      {error ? (
        <section className="campus-card p-6 text-sm text-red-600">
          Advisor workspace is temporarily unavailable: {error}
        </section>
      ) : null}

      {!error && assignments.length === 0 ? (
        <section className="campus-card p-8 text-center text-sm text-slate-500">
          No active advisor assignments are linked to your account yet.
        </section>
      ) : null}

      {!error && assignments.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assignments.map((assignment) => (
            <article key={assignment.id} className="campus-card p-5 space-y-4">
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {assignment.student.studentProfile?.legalName ?? assignment.student.email}
                </p>
                <p className="mt-1 text-sm text-slate-500">{assignment.student.studentId ?? "No student ID"}</p>
              </div>
              <div className="space-y-1 text-sm text-slate-600">
                <p>{assignment.student.studentProfile?.programMajor ?? "Undeclared"}</p>
                <p>{assignment.student.studentProfile?.academicStatus ?? "Academic status unavailable"}</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="campus-chip text-xs">{assignment.student.studentProfile?.enrollmentStatus ?? "Active"}</span>
                <Link href={`/advisor/students/${assignment.student.id}`} className="campus-chip cursor-pointer text-xs">
                  Open advisee
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
