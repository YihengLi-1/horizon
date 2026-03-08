import { serverApi } from "@/lib/server-api";
import { requireRole } from "@/lib/server-auth";
import TermReportButton from "./TermReportButton";

export const dynamic = "force-dynamic";

type HistoryEnrollment = {
  id: string;
  status: string;
  finalGrade?: string | null;
  term?: { id?: string; name?: string };
  section?: { credits?: number; course?: { code?: string; title?: string } };
};

export default async function HistoryPage() {
  await requireRole("STUDENT");

  const [enrollments, me] = await Promise.all([
    serverApi<HistoryEnrollment[]>("/registration/enrollments").catch(() => []),
    serverApi<{ legalName?: string; user?: { email?: string } }>("/students/me").catch(() => null)
  ]);
  const byTerm = new Map<string, { name: string; items: HistoryEnrollment[] }>();
  const studentName = me?.legalName ?? me?.user?.email ?? "Student";

  for (const enrollment of enrollments ?? []) {
    const key = enrollment.term?.id ?? "unknown";
    if (!byTerm.has(key)) {
      byTerm.set(key, { name: enrollment.term?.name ?? key, items: [] });
    }
    byTerm.get(key)!.items.push(enrollment);
  }

  const STATUS_CLS: Record<string, string> = {
    ENROLLED: "border-emerald-200 bg-emerald-50 text-emerald-700",
    WAITLISTED: "border-amber-200 bg-amber-50 text-amber-700",
    DROPPED: "border-red-200 bg-red-50 text-red-700",
    COMPLETED: "border-slate-200 bg-slate-50 text-slate-600",
    PENDING_APPROVAL: "border-blue-200 bg-blue-50 text-blue-700",
  };

  return (
    <div className="campus-page space-y-8">
      <div className="campus-hero">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Enrollment History</h1>
        <p className="mt-1 text-sm text-slate-500">All your courses across terms</p>
      </div>
      {byTerm.size === 0 ? (
        <div className="campus-card p-12 text-center text-slate-400">📋 No enrollment history yet.</div>
      ) : (
        [...byTerm.entries()].map(([key, { name, items }]) => (
          <div key={key} className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{name}</span>
              {/* 下载成绩单按钮在 client island 内使用 window.open + print。 */}
              <TermReportButton studentName={studentName} termName={name} items={items} />
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>
            <div className="space-y-2">
              {items.map((enrollment) => (
                <div key={enrollment.id} className="campus-card flex items-center gap-4 p-3">
                  <div className="flex-1">
                    <p className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-400">{enrollment.section?.course?.code ?? "—"}</p>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{enrollment.section?.course?.title ?? "—"}</p>
                  </div>
                  <div className="text-right">
                    {enrollment.finalGrade ? (
                      <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{enrollment.finalGrade}</p>
                    ) : null}
                    <span className={`campus-chip text-xs ${STATUS_CLS[enrollment.status] ?? ""}`}>{enrollment.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
