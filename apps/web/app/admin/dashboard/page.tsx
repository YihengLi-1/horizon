import Link from "next/link";
import { serverApi } from "@/lib/server-api";

type Breakdown = {
  enrolled: number;
  waitlisted: number;
  pendingApproval: number;
  completed: number;
  dropped: number;
};

type ActiveTerm = {
  id: string;
  name: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  dropDeadline: string;
  sectionCount: number;
  enrollmentCount: number;
};

type RecentActivity = {
  id: string;
  action: string;
  entityType: string;
  actorEmail: string;
  actorRole: string;
  createdAt: string;
};

type Dashboard = {
  students: number;
  terms: number;
  courses: number;
  sections: number;
  enrollments: number;
  waitlist: number;
  breakdown: Breakdown;
  activeTerm: ActiveTerm | null;
  recentActivity: RecentActivity[];
};

type OpsMetrics = {
  uptimeSeconds: number;
  requestsTotal: number;
  errorResponsesTotal: number;
  byMethod: Record<string, number>;
  byStatusCode: Record<string, number>;
  byRoute: Record<string, number>;
  auditActionCounts: Record<string, number>;
};

function StatCard({
  label,
  value,
  sub,
  accent,
  href
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
  href?: string;
}) {
  const content = (
    <div
      className={`group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition ${href ? "hover:shadow-md hover:border-slate-300 cursor-pointer" : ""}`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accent ?? "text-slate-900"}`}>{value}</p>
      {sub ? <p className="mt-1 text-sm text-slate-500">{sub}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function ActionButton({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="mt-0.5 text-sm text-slate-500">{desc}</p>
      </div>
      <span className="ml-auto text-slate-300 group-hover:text-slate-500">→</span>
    </Link>
  );
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    admin_crud: "Data change",
    promote_waitlist: "Waitlist promote",
    grade_update: "Grade updated",
    login: "Login",
    registration_submit: "Registration submit",
    drop: "Drop"
  };
  return map[action] ?? action;
}

export default async function AdminDashboardPage() {
  const [data, opsMetrics] = await Promise.all([
    serverApi<Dashboard>("/admin/dashboard"),
    serverApi<OpsMetrics>("/ops/metrics").catch(() => null)
  ]);
  const { breakdown, activeTerm, recentActivity } = data;

  const now = Date.now();
  const enrollmentTotal = breakdown.enrolled + breakdown.waitlisted + breakdown.pendingApproval;
  const enrolledPct = enrollmentTotal > 0 ? Math.round((breakdown.enrolled / enrollmentTotal) * 100) : 0;
  const errorRatePct = opsMetrics
    ? opsMetrics.requestsTotal > 0
      ? ((opsMetrics.errorResponsesTotal / opsMetrics.requestsTotal) * 100).toFixed(1)
      : "0.0"
    : null;
  const topAuditActions = opsMetrics
    ? Object.entries(opsMetrics.auditActionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : [];
  const topRoutes = opsMetrics
    ? Object.entries(opsMetrics.byRoute)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    : [];

  // Check if registration is actually open for activeTerm
  const regOpen = activeTerm
    ? now >= new Date(activeTerm.registrationOpenAt).getTime() && now <= new Date(activeTerm.registrationCloseAt).getTime()
    : false;

  function relativeDate(dateStr: string): string {
    const d = new Date(dateStr);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const dayDiff = Math.floor((todayStart.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (dayDiff <= 0) return "Today";
    if (dayDiff === 1) return "Yesterday";
    return d.toLocaleDateString();
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Administrative Command Center</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-[2.65rem]">Admin Dashboard</h1>
            <p className="text-base text-slate-600">
              System overview for student records, enrollment operations, and registration cycle health.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">Students {data.students}</span>
            <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">Sections {data.sections}</span>
            <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">Waitlist {data.waitlist}</span>
          </div>
        </div>
      </section>

      {/* Primary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={data.students} sub="registered accounts" href="/admin/students" />
        <StatCard label="Courses" value={data.courses} sub="in catalog" href="/admin/courses" />
        <StatCard label="Sections" value={data.sections} sub="across all terms" href="/admin/sections" />
        <StatCard label="Terms" value={data.terms} sub="academic periods" href="/admin/terms" />
      </div>

      {/* Active term spotlight */}
      {activeTerm ? (
        <div className={`rounded-2xl border p-5 ${regOpen ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-blue-50"}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${regOpen ? "text-emerald-700" : "text-blue-700"}`}>
                  Active Term
                </p>
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  regOpen
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                    : "border-blue-300 bg-blue-100 text-blue-800"
                }`}>
                  {regOpen ? "Reg Open" : "Reg Closed"}
                </span>
              </div>
              <p className={`mt-1 text-xl font-bold ${regOpen ? "text-emerald-900" : "text-blue-900"}`}>{activeTerm.name}</p>
              <p className={`mt-1 text-sm ${regOpen ? "text-emerald-700" : "text-blue-700"}`}>
                {regOpen
                  ? `Registration closes ${new Date(activeTerm.registrationCloseAt).toLocaleDateString()}`
                  : `Registration was ${new Date(activeTerm.registrationOpenAt) > new Date() ? "not yet open" : "closed " + new Date(activeTerm.registrationCloseAt).toLocaleDateString()}`
                }
                {" · "}Drop by {new Date(activeTerm.dropDeadline).toLocaleDateString()}
              </p>
            </div>
            <div className={`flex gap-6 text-center`}>
              <div>
                <p className={`text-2xl font-bold ${regOpen ? "text-emerald-900" : "text-blue-900"}`}>{activeTerm.sectionCount}</p>
                <p className={`text-sm ${regOpen ? "text-emerald-700" : "text-blue-700"}`}>sections</p>
              </div>
              <div>
                <p className={`text-2xl font-bold ${regOpen ? "text-emerald-900" : "text-blue-900"}`}>{activeTerm.enrollmentCount}</p>
                <p className={`text-sm ${regOpen ? "text-emerald-700" : "text-blue-700"}`}>enrollments</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          No term currently in registration window.{" "}
          <Link href="/admin/terms" className="font-medium text-slate-700 underline underline-offset-2">
            Manage terms →
          </Link>
        </div>
      )}

      {/* Enrollment breakdown */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Enrollment Status</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Enrolled" value={breakdown.enrolled} accent="text-emerald-600" href="/admin/enrollments" />
          <StatCard
            label="Waitlisted"
            value={breakdown.waitlisted}
            accent="text-amber-600"
            href="/admin/waitlist"
          />
          <StatCard
            label="Pending Approval"
            value={breakdown.pendingApproval}
            accent="text-blue-600"
            href="/admin/enrollments"
          />
          <StatCard label="Completed" value={breakdown.completed} accent="text-slate-500" />
          <StatCard label="Dropped" value={breakdown.dropped} accent="text-red-500" />
        </div>

        {/* Enrollment composition bar */}
        {enrollmentTotal > 0 ? (
          <div className="mt-4 overflow-hidden rounded-full bg-slate-100" style={{ height: 8 }}>
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${enrolledPct}%` }}
            />
          </div>
        ) : null}
        {enrollmentTotal > 0 ? (
          <p className="mt-1.5 text-sm text-slate-500">
            {enrolledPct}% of active enrollments confirmed · {breakdown.waitlisted} on waitlist ·{" "}
            {breakdown.pendingApproval} awaiting approval
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Operational Health</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {opsMetrics ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Requests</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{opsMetrics.requestsTotal}</p>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Error Rate</p>
                    <p className="mt-1 text-lg font-semibold text-red-700">{errorRatePct}%</p>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Uptime</p>
                    <p className="mt-1 text-lg font-semibold text-blue-900">{Math.floor(opsMetrics.uptimeSeconds / 60)} min</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Top Audit Actions</p>
                  {topAuditActions.length === 0 ? (
                    <p className="text-sm text-slate-500">No audit actions captured yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {topAuditActions.map(([action, count]) => (
                        <div key={action} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                          <span className="font-medium text-slate-700">{actionLabel(action)}</span>
                          <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-sm font-semibold text-slate-700">
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {topRoutes.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Busiest Routes</p>
                    <div className="space-y-1.5">
                      {topRoutes.map(([route, count]) => {
                        const maxCount = topRoutes[0]?.[1] ?? 1;
                        const pct = Math.round((count / maxCount) * 100);
                        return (
                          <div key={route} className="flex items-center gap-3">
                            <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-600">{route}</span>
                            <div className="w-20 overflow-hidden rounded-full bg-slate-100" style={{ height: 6 }}>
                              <div className="h-full rounded-full bg-slate-400" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-8 shrink-0 text-right text-xs font-semibold text-slate-700">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Metrics endpoint unavailable.</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Response Status Codes</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {opsMetrics && Object.keys(opsMetrics.byStatusCode).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(opsMetrics.byStatusCode)
                  .sort((a, b) => Number(a[0]) - Number(b[0]))
                  .map(([code, count]) => {
                    const n = Number(code);
                    const cls =
                      n >= 500 ? "border-red-200 bg-red-50 text-red-700" :
                      n >= 400 ? "border-amber-200 bg-amber-50 text-amber-700" :
                      n >= 300 ? "border-blue-200 bg-blue-50 text-blue-700" :
                      "border-emerald-200 bg-emerald-50 text-emerald-700";
                    const pct = opsMetrics.requestsTotal > 0
                      ? Math.round((count / opsMetrics.requestsTotal) * 100)
                      : 0;
                    return (
                      <div key={code} className="flex items-center gap-3">
                        <span className={`inline-flex w-14 shrink-0 justify-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
                          {code}
                        </span>
                        <div className="flex-1 overflow-hidden rounded-full bg-slate-100" style={{ height: 8 }}>
                          <div className={`h-full rounded-full ${n >= 500 ? "bg-red-500" : n >= 400 ? "bg-amber-400" : n >= 300 ? "bg-blue-400" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 shrink-0 text-right text-xs font-semibold text-slate-700">{count}</span>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{opsMetrics ? "No response data yet." : "Metrics endpoint unavailable."}</p>
            )}
            {opsMetrics && Object.keys(opsMetrics.byMethod).length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">HTTP Methods</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(opsMetrics.byMethod).sort((a, b) => b[1] - a[1]).map(([method, count]) => (
                    <span key={method} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                      {method} <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-slate-700">{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Quick actions + recent activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Quick Actions</h2>
          <div className="grid gap-3">
            <ActionButton href="/admin/sections" label="Manage Sections" desc="View, create, and edit course sections" />
            <ActionButton href="/admin/waitlist" label="Promote Waitlist" desc="Move waitlisted students to enrolled" />
            <ActionButton href="/admin/enrollments" label="Grade Entry" desc="Enter final grades for completed sections" />
            <ActionButton href="/admin/import" label="Import CSV" desc="Bulk import students, courses, or sections" />
            <ActionButton href="/admin/invite-codes" label="Invite Codes" desc="Generate and manage registration codes" />
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-slate-400">No recent activity.</p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
              {recentActivity.map((log) => {
                const dateLabel = relativeDate(log.createdAt);
                return (
                  <div key={log.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{actionLabel(log.action)}</p>
                      <p className="truncate text-sm text-slate-500">
                        {log.actorEmail} · {log.entityType}
                      </p>
                    </div>
                    <div className="ml-4 shrink-0 text-right">
                      <p className="text-xs font-medium text-slate-500">
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      {dateLabel !== "Today" ? (
                        <p className="text-[10px] text-slate-400">{dateLabel}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Link href="/admin/audit-logs" className="mt-3 block text-sm font-medium text-slate-500 hover:text-slate-700">
            View all audit logs →
          </Link>
        </div>
      </div>
    </div>
  );
}
