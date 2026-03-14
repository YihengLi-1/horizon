import Link from "next/link";
import { serverApi } from "@/lib/server-api";
import { requireRole } from "@/lib/server-auth";
import EnrollmentTrendChart from "./EnrollmentTrendChart";
import RefreshButton from "./RefreshButton";

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
  registrationOpen: boolean;
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
  mail: {
    enabled: boolean;
    configured: boolean;
    deliveryActive: boolean;
    attempts: number;
    sent: number;
    failed: number;
    skipped: number;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastFailureReason: string | null;
  };
  mailIndicators: {
    deliveryAttempts: number;
    failureRatePercent: number;
    minutesSinceLastSuccess: number | null;
  };
  security: {
    csrfOriginBlocked: number;
    csrfTokenInvalid: number;
    loginRateLimited: number;
    loginFailed: number;
  };
  history: Array<{
    ts: number;
    requestsTotal: number;
    errorResponsesTotal: number;
    rss: number;
  }>;
  alerts: Array<{
    level: "warning" | "critical";
    code: string;
    message: string;
    value: number;
    threshold: number;
  }>;
  thresholds: {
    csrfOriginBlocked: number;
    csrfTokenInvalid: number;
    loginRateLimited: number;
    errorRatePercent: number;
    mailDeliveryFailed: number;
  };
};

type OpsVersion = {
  version: string;
  nodeEnv: string;
  uptime: number;
  pid: number;
  buildTime?: string;
};

type OpsReady = {
  status: string;
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

function actorRoleBadge(role: string): { label: string; className: string } {
  const normalized = role.toUpperCase();
  if (normalized === "ADMIN") {
    return {
      label: "Admin",
      className: "border-violet-200 bg-violet-50 text-violet-700"
    };
  }
  if (normalized === "FACULTY") {
    return {
      label: "Faculty",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700"
    };
  }
  if (normalized === "ADVISOR") {
    return {
      label: "Advisor",
      className: "border-amber-200 bg-amber-50 text-amber-700"
    };
  }
  return {
    label: "Student",
    className: "border-blue-200 bg-blue-50 text-blue-700"
  };
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "v1.0.0";
const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME ?? "—";

export default async function AdminDashboardPage() {
  await requireRole("ADMIN");

  const [data, opsMetrics, opsVersion, opsReady] = await Promise.all([
    serverApi<Dashboard>("/admin/dashboard"),
    serverApi<OpsMetrics>("/ops/metrics").catch(() => null),
    serverApi<OpsVersion>("/ops/version").catch(() => null),
    serverApi<OpsReady>("/ops/ready").catch(() => null)
  ]);
  const { breakdown, activeTerm, recentActivity } = data;

  const now = Date.now();
  const enrollmentGrandTotal =
    breakdown.enrolled + breakdown.waitlisted + breakdown.pendingApproval + breakdown.completed + breakdown.dropped;
  const enrollmentTotal = breakdown.enrolled + breakdown.waitlisted + breakdown.pendingApproval;
  const enrolledPct = enrollmentTotal > 0 ? Math.round((breakdown.enrolled / enrollmentTotal) * 100) : 0;

  // Segments for the multi-color composition bar
  const barSegments =
    enrollmentGrandTotal > 0
      ? [
          { label: "Enrolled", count: breakdown.enrolled, cls: "bg-emerald-500" },
          { label: "Waitlisted", count: breakdown.waitlisted, cls: "bg-amber-400" },
          { label: "Pending", count: breakdown.pendingApproval, cls: "bg-blue-400" },
          { label: "Dropped", count: breakdown.dropped, cls: "bg-red-400" },
          { label: "Completed", count: breakdown.completed, cls: "bg-slate-300" },
        ]
      : [];

  function formatUptime(seconds: number): string {
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${m}m`;
    }
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    return `${d}d ${h}h`;
  }

  const errorRatePct = opsMetrics
    ? opsMetrics.requestsTotal > 0
      ? ((opsMetrics.errorResponsesTotal / opsMetrics.requestsTotal) * 100).toFixed(1)
      : "0.0"
    : null;
  const activeAlerts = opsMetrics?.alerts ?? [];
  const systemHealthy = opsReady?.status === "ok";

  // Check if registration is actually open for activeTerm
  const regOpen = Boolean(activeTerm?.registrationOpen);
  const daysToRegEnd = activeTerm?.registrationCloseAt
    ? Math.ceil((new Date(activeTerm.registrationCloseAt).getTime() - now) / (1000 * 60 * 60 * 24))
    : null;
  const dropDeadline = activeTerm?.dropDeadline ? new Date(activeTerm.dropDeadline) : null;
  const daysToDropDeadline = dropDeadline
    ? Math.ceil((dropDeadline.getTime() - now) / (1000 * 60 * 60 * 24))
    : null;
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
            <span className="campus-chip border-emerald-300 bg-emerald-50 text-emerald-700">
              {data.students} Students
            </span>
            <span className="campus-chip border-blue-300 bg-blue-50 text-blue-700">
              {data.sections} Sections
            </span>
            {data.waitlist > 0 && (
              <span className="campus-chip border-amber-300 bg-amber-50 text-amber-700">
                {data.waitlist} Waitlisted
              </span>
            )}
            {breakdown.pendingApproval > 0 && (
              <span className="campus-chip border-violet-300 bg-violet-50 text-violet-700">
                {breakdown.pendingApproval} Pending Approval
              </span>
            )}
          </div>
          <div className="flex w-full max-w-xl flex-wrap items-center justify-end gap-2">
            <RefreshButton />
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
                {regOpen ? (
                  <>
                    Registration closes {new Date(activeTerm.registrationCloseAt).toLocaleDateString()}
                    {(() => {
                      const daysLeft = Math.ceil(
                        (new Date(activeTerm.registrationCloseAt).getTime() - now) / (1000 * 60 * 60 * 24)
                      );
                      return daysLeft <= 7 ? (
                        <span className={`ml-2 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${
                          daysLeft <= 2
                            ? "border-red-300 bg-red-100 text-red-700"
                            : "border-amber-300 bg-amber-100 text-amber-700"
                        }`}>
                          {daysLeft}d left
                        </span>
                      ) : null;
                    })()}
                  </>
                ) : (
                  new Date(activeTerm.registrationOpenAt) > new Date()
                    ? `Registration opens ${new Date(activeTerm.registrationOpenAt).toLocaleDateString()}`
                    : `Registration closed ${new Date(activeTerm.registrationCloseAt).toLocaleDateString()}`
                )}
                {" · "}Drop by {new Date(activeTerm.dropDeadline).toLocaleDateString()}
                {daysToDropDeadline !== null ? (
                  <>
                    {" "}
                    <span className="font-semibold">
                    · {daysToDropDeadline > 0 ? `${daysToDropDeadline}d to drop deadline` : "Drop deadline passed"}
                    </span>
                  </>
                ) : null}
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
          No active academic term is in progress.{" "}
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

        {/* Enrollment composition bar — multi-segment */}
        {enrollmentGrandTotal > 0 ? (
          <>
            <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              {barSegments.filter((s) => s.count > 0).map((seg) => (
                <div
                  key={seg.label}
                  className={`h-full transition-all ${seg.cls}`}
                  style={{ width: `${(seg.count / enrollmentGrandTotal) * 100}%` }}
                  title={`${seg.label}: ${seg.count}`}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {barSegments.filter((s) => s.count > 0).map((seg) => (
                <span key={seg.label} className="flex items-center gap-1">
                  <span className={`inline-block size-2 rounded-sm ${seg.cls}`} />
                  {seg.label} {seg.count}
                </span>
              ))}
              <span className="ml-auto text-slate-400">{enrolledPct}% of active confirmed</span>
            </div>
          </>
        ) : null}
      </div>

      <div className="campus-card p-4">
        <EnrollmentTrendChart />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="API"
          value={systemHealthy ? "Healthy" : "Issues"}
          sub={`${opsVersion?.nodeEnv ?? nodeEnv} · ${opsVersion?.version ?? appVersion}`}
          accent={systemHealthy ? "text-emerald-600" : "text-red-600"}
        />
        <StatCard
          label="Requests"
          value={opsMetrics?.requestsTotal ?? "—"}
          sub="since service start"
        />
        <StatCard
          label="Error Rate"
          value={errorRatePct !== null ? `${errorRatePct}%` : "—"}
          sub="5xx and 4xx responses"
          accent={errorRatePct !== null && Number(errorRatePct) > 5 ? "text-red-600" : "text-slate-900"}
        />
        <StatCard
          label="Uptime"
          value={opsMetrics ? formatUptime(opsMetrics.uptimeSeconds) : "—"}
          sub={opsVersion?.buildTime ?? buildTime}
          accent="text-blue-700"
        />
      </div>

      {activeAlerts.length > 0 ? (
        <div className="campus-card p-4">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Operational Alerts</p>
          <div className="grid gap-3 md:grid-cols-2">
            {activeAlerts.map((alert) => (
              <div
                key={alert.code}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  alert.level === "critical"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                <p className="font-semibold">{alert.message}</p>
                <p className="mt-0.5 text-xs">
                  {alert.code} · {alert.value} / {alert.threshold}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">System Summary</h2>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Environment</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{opsVersion?.nodeEnv ?? nodeEnv}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Version</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{opsVersion?.version ?? appVersion}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending Approval</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{breakdown.pendingApproval}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Waitlist Load</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{data.waitlist}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              This dashboard now stays focused on academic operations. Export, search, and monitoring live on their own pages.
            </p>
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
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">最近审计</h2>
          {recentActivity.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-8 text-center">
              <p className="text-2xl">📋</p>
              <p className="mt-2 text-sm font-medium text-slate-600">No recent activity</p>
              <p className="mt-1 text-xs text-slate-400">Activity will appear here as actions are performed</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
              {recentActivity.map((log) => {
                const dateLabel = relativeDate(log.createdAt);
                const badge = actorRoleBadge(log.actorRole);
                return (
                  <div key={log.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-slate-800">{actionLabel(log.action)}</p>
                        <span className={`hidden shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase sm:inline-flex ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="truncate text-xs text-slate-500">
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
