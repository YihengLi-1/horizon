import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";

type FacultySection = {
  id: string;
  sectionCode: string;
  capacity: number;
  course: { code: string; title: string };
  term: { name: string };
  meetingTimes: Array<{ weekday: number; startMinutes: number; endMinutes: number }>;
  _count?: { enrollments?: number };
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export default async function FacultyDashboardPage() {
  await requireRole("FACULTY");
  let sections: FacultySection[] = [];
  let error = "";
  try {
    sections = await serverApi<FacultySection[]>("/faculty/sections");
  } catch (err) {
    error = err instanceof Error ? err.message : "Unable to load faculty workspace";
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Faculty</p>
        <h1 className="font-heading text-3xl font-bold text-slate-900">My Sections</h1>
        <p className="mt-2 text-sm text-slate-600">
          View only the sections you own, open rosters, and submit final grades.
        </p>
      </section>

      <section className="campus-toolbar">
        <div className="campus-kpi">
          <p className="text-xs uppercase tracking-wide text-slate-500">Owned Sections</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{sections.length}</p>
        </div>
      </section>

      {error ? (
        <section className="campus-card p-6 text-sm text-red-600">
          Faculty workspace is temporarily unavailable: {error}
        </section>
      ) : null}

      {!error && sections.length === 0 ? (
        <section className="campus-card p-8 text-center text-sm text-slate-500">
          No teaching assignments are linked to your account yet.
        </section>
      ) : null}

      {!error && sections.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <article key={section.id} className="campus-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {section.course.code} <span className="text-slate-500">§{section.sectionCode}</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{section.course.title}</p>
                </div>
                <span className="campus-chip text-xs">{section.term.name}</span>
              </div>
              <div className="space-y-1 text-xs text-slate-500">
                {(section.meetingTimes ?? []).map((meeting, index) => (
                  <p key={`${section.id}-${index}`}>
                    {WEEKDAY[meeting.weekday]} {fmtTime(meeting.startMinutes)}-{fmtTime(meeting.endMinutes)}
                  </p>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Capacity {section.capacity}</span>
                <Link href={`/faculty/sections/${section.id}`} className="campus-chip cursor-pointer text-xs">
                  Open roster
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
