import { serverApi } from "@/lib/server-api";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type Term = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  dropDeadline?: string;
};

function daysUntil(value: string): number {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

function chipTone(days: number): string {
  if (days <= 3) return "border-red-200 bg-red-50 text-red-700";
  if (days <= 7) return "border-amber-200 bg-amber-50 text-amber-700";
  if (days <= 30) return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function rowTone(date: string) {
  const days = daysUntil(date);
  const isPast = days < 0;
  const isToday = days === 0;
  return {
    isPast,
    isToday,
    chip: chipTone(Math.max(days, 0))
  };
}

export default async function StudentCalendarPage() {
  await requireRole("STUDENT");

  const terms = await serverApi<Term[]>("/academics/terms").catch(() => []);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Timeline</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">Term Calendar</h1>
        <p className="text-sm text-slate-600 md:text-base">
          Key registration and term deadlines, organized as a rolling timeline.
        </p>
      </section>

      {terms.length === 0 ? (
        <section className="campus-card px-6 py-14 text-center">
          <p className="text-3xl">🗓️</p>
          <p className="mt-2 text-sm font-medium text-slate-600">No terms available</p>
          <p className="mt-1 text-xs text-slate-400">Calendar milestones will appear here when terms are published.</p>
        </section>
      ) : (
        <section className="space-y-4">
          {terms.map((term) => {
            const items = [
              { label: "Registration Opens", value: term.registrationOpenAt },
              { label: "Registration Closes", value: term.registrationCloseAt },
              { label: "Term Ends", value: term.endDate }
            ];
            if (term.dropDeadline) {
              items.splice(2, 0, { label: "Drop Deadline", value: term.dropDeadline });
            }

            return (
              <article key={term.id} className="campus-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{term.name}</h2>
                    <p className="text-sm text-slate-500">
                      {new Date(term.startDate).toLocaleDateString()} - {new Date(term.endDate).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">
                    {items.filter((item) => daysUntil(item.value) >= 0).length} upcoming milestone(s)
                  </span>
                </div>

                <div className="mt-5 space-y-4 border-l-2 border-slate-200 pl-4">
                  {items.map((item) => {
                    const tone = rowTone(item.value);
                    const days = daysUntil(item.value);
                    return (
                      <div key={`${term.id}-${item.label}`} className="relative">
                        <span
                          className={`absolute -left-[1.45rem] top-1.5 h-3 w-3 rounded-full border-2 border-white ${
                            tone.isToday ? "bg-red-500" : tone.isPast ? "bg-slate-300" : "bg-blue-500"
                          }`}
                        />
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className={tone.isPast ? "line-through text-slate-400" : ""}>
                            <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                            <p className="text-xs text-slate-500">{new Date(item.value).toLocaleString()}</p>
                          </div>
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone.isPast ? "border-slate-200 bg-slate-100 text-slate-400" : tone.chip}`}>
                            {tone.isToday ? "Today" : days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
