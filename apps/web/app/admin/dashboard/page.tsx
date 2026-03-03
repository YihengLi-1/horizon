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
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accent ?? "text-slate-900"}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-400">{sub}</p> : null}
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
        <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
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

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Administrative Command Center</p>
            <h1 className="font-heading text-4xl font-bold text-white md:text-5xl">Admin Dashboard</h1>
            <p className="text-sm text-blue-100/90 md:text-base">
              System overview for student records, enrollment operations, and registration cycle health.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="campus-chip border-blue-200/30 bg-white/10 text-blue-50">Students {data.students}</span>
            <span className="campus-chip border-blue-200/30 bg-white/10 text-blue-50">Sections {data.sections}</span>
            <span className="campus-chip border-blue-200/30 bg-white/10 text-blue-50">Waitlist {data.waitlist}</span>
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
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Registration Open</p>
              <p className="mt-1 text-xl font-bold text-emerald-900">{activeTerm.name}</p>
              <p className="mt-1 text-sm text-emerald-700">
                Closes {new Date(activeTerm.registrationCloseAt).toLocaleDateString()} · Drop by{" "}
                {new Date(activeTerm.dropDeadline).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <p className="text-2xl font-bold text-emerald-900">{activeTerm.sectionCount}</p>
                <p className="text-xs text-emerald-600">sections</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-900">{activeTerm.enrollmentCount}</p>
                <p className="text-xs text-emerald-600">enrollments</p>
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
          <p className="mt-1.5 text-xs text-slate-400">
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
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Requests</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{opsMetrics.requestsTotal}</p>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600">Error Rate</p>
                    <p className="mt-1 text-lg font-semibold text-red-700">{errorRatePct}%</p>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Uptime</p>
                    <p className="mt-1 text-lg font-semibold text-blue-900">{Math.floor(opsMetrics.uptimeSeconds / 60)} min</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top Audit Actions</p>
                  {topAuditActions.length === 0 ? (
                    <p className="text-sm text-slate-500">No audit actions captured yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {topAuditActions.map(([action, count]) => (
                        <div key={action} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                          <span className="font-medium text-slate-700">{action}</span>
                          <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Metrics endpoint unavailable.</p>
            )}
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
              {recentActivity.map((log) => (
                <div key={log.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{actionLabel(log.action)}</p>
                    <p className="truncate text-xs text-slate-400">
                      {log.actorEmail} · {log.entityType}
                    </p>
                  </div>
                  <span className="ml-4 shrink-0 text-xs text-slate-400">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Link href="/admin/audit-logs" className="mt-3 block text-xs font-medium text-slate-500 hover:text-slate-700">
            View all audit logs →
          </Link>
        </div>
      </div>
    </div>
  );
}
