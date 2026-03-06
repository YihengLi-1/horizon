import Link from "next/link";
import AdminDataExport from "@/components/AdminDataExport";
import { serverApi } from "@/lib/server-api";
import QuickSearch from "./QuickSearch";
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

type EnrollmentTrendItem = {
  createdAt: string;
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

function DonutChart({
  data
}: {
  data: Array<{ label: string; value: number; color: string }>;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (!total) return null;
  const radius = 40;
  const cx = 50;
  const cy = 50;
  const stroke = 12;
  let offset = -Math.PI / 2;
  const segments = data
    .filter((item) => item.value > 0)
    .map((item) => {
      const angle = (item.value / total) * Math.PI * 2;
      const x1 = cx + radius * Math.cos(offset);
      const y1 = cy + radius * Math.sin(offset);
      offset += angle;
      const x2 = cx + radius * Math.cos(offset);
      const y2 = cy + radius * Math.sin(offset);
      return {
        ...item,
        path: `M${x1.toFixed(2)},${y1.toFixed(2)} A${radius},${radius} 0 ${angle > Math.PI ? 1 : 0},1 ${x2.toFixed(2)},${y2.toFixed(2)}`
      };
    });

  return (
    <div className="flex items-center gap-4">
      <svg width={100} height={100} viewBox="0 0 100 100">
        {segments.map((segment) => (
          <path
            key={segment.label}
            d={segment.path}
            fill="none"
            stroke={segment.color}
            strokeWidth={stroke}
            strokeLinecap="butt"
          />
        ))}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="bold" fill="#1e293b">
          {total}
        </text>
        <text x={cx} y={cy + 13} textAnchor="middle" fontSize="7" fill="#94a3b8">
          total
        </text>
      </svg>
      <div className="space-y-1">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2 text-xs">
            <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
            <span className="text-slate-600 dark:text-slate-400">{segment.label}</span>
            <span className="ml-auto font-semibold text-slate-800 dark:text-slate-100">{segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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

const nodeEnv = process.env.NODE_ENV ?? "development";
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "v1.0.0";
const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME ?? "—";
const grafanaUrl = process.env.NEXT_PUBLIC_GRAFANA_URL ?? "http://localhost:3001";
const prometheusUrl = "http://localhost:9090";
const alertmanagerUrl = "http://localhost:9093";

export default async function AdminDashboardPage() {
  const [data, opsMetrics, enrollmentFeed] = await Promise.all([
    serverApi<Dashboard>("/admin/dashboard"),
    serverApi<OpsMetrics>("/ops/metrics").catch(() => null),
    serverApi<{ data: EnrollmentTrendItem[] }>("/admin/enrollments?limit=9999").catch(() => ({ data: [] as EnrollmentTrendItem[] }))
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
  const activeAlerts = opsMetrics?.alerts ?? [];
  const mailFailureRate = opsMetrics ? `${opsMetrics.mailIndicators.failureRatePercent.toFixed(2)}%` : null;
  const mailLastSuccess = opsMetrics?.mail.lastSuccessAt ? new Date(opsMetrics.mail.lastSuccessAt).toLocaleString() : "Never";
  const mailLastFailure = opsMetrics?.mail.lastFailureAt ? new Date(opsMetrics.mail.lastFailureAt).toLocaleString() : "None";

  // Check if registration is actually open for activeTerm
  const regOpen = Boolean(activeTerm?.registrationOpen);
  const daysToRegEnd = activeTerm?.registrationCloseAt
    ? Math.ceil((new Date(activeTerm.registrationCloseAt).getTime() - now) / (1000 * 60 * 60 * 24))
    : null;
  const dropDeadline = activeTerm?.dropDeadline ? new Date(activeTerm.dropDeadline) : null;
  const daysToDropDeadline = dropDeadline
    ? Math.ceil((dropDeadline.getTime() - now) / (1000 * 60 * 60 * 24))
    : null;
  const last7Days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + index);
    return date.toISOString().slice(0, 10);
  });
  const enrollmentByDay: Record<string, number> = Object.fromEntries(last7Days.map((day) => [day, 0]));
  for (const enrollment of enrollmentFeed.data ?? []) {
    const day = new Date(enrollment.createdAt).toISOString().slice(0, 10);
    if (day in enrollmentByDay) enrollmentByDay[day] += 1;
  }
  const trendData = last7Days.map((day) => ({ day: day.slice(5), count: enrollmentByDay[day] }));
  const maxTrendCount = Math.max(...trendData.map((item) => item.count), 1);
  const trendWidth = 400;
  const trendHeight = 80;
  const trendPad = 20;
  const trendPoints = trendData.map((item, index) => ({
    x: trendPad + (index * (trendWidth - trendPad * 2)) / Math.max(1, trendData.length - 1),
    y: trendHeight - trendPad - (item.count / maxTrendCount) * (trendHeight - trendPad * 2),
    point: item
  }));
  const trendPath = trendPoints.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const metricsHistory = opsMetrics?.history ?? [];
  const metricsHistoryWidth = 280;
  const metricsHistoryHeight = 72;
  const metricsHistoryPad = 16;
  const maxHistoryRequests = Math.max(...metricsHistory.map((item) => item.requestsTotal), 1);
  const historyPoints = metricsHistory.map((item, index) => ({
    x:
      metricsHistoryPad +
      (index * (metricsHistoryWidth - metricsHistoryPad * 2)) / Math.max(1, metricsHistory.length - 1),
    y:
      metricsHistoryHeight -
      metricsHistoryPad -
      (item.requestsTotal / maxHistoryRequests) * (metricsHistoryHeight - metricsHistoryPad * 2),
    value: item
  }));
  const historyPath = historyPoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");

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
            <QuickSearch />
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

      {activeTerm ? (
        <div className={`flex items-center gap-3 rounded-xl border p-4 ${regOpen ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
          <span className="text-2xl">{regOpen ? "🟢" : "🔴"}</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-800">
              {activeTerm.name} — Registration {regOpen ? "Open" : "Closed"}
            </p>
            {regOpen && daysToRegEnd !== null ? (
              <p className={`text-xs font-medium ${daysToRegEnd <= 3 ? "text-red-600" : daysToRegEnd <= 7 ? "text-amber-600" : "text-emerald-600"}`}>
                {daysToRegEnd > 0 ? `Closes in ${daysToRegEnd} day${daysToRegEnd !== 1 ? "s" : ""}` : "Closes today!"}
              </p>
            ) : (
              <p className="text-xs font-medium text-slate-500">Registration can be reopened from Terms if needed.</p>
            )}
          </div>
          <a href="/admin/terms" className="text-xs font-medium text-blue-600 hover:underline">
            Manage →
          </a>
        </div>
      ) : null}

      {dropDeadline && daysToDropDeadline !== null ? (
        <div
          className={`flex items-center gap-3 rounded-xl border p-3 ${
            daysToDropDeadline <= 3
              ? "border-red-200 bg-red-50"
              : daysToDropDeadline <= 7
                ? "border-amber-200 bg-amber-50"
                : "border-slate-200 bg-slate-50"
          }`}
        >
          <span className="text-xl">{daysToDropDeadline <= 3 ? "🚨" : daysToDropDeadline <= 7 ? "⚠️" : "📅"}</span>
          <div>
            <p className="text-sm font-semibold text-slate-800">Drop Deadline</p>
            <p
              className={`text-xs font-medium ${
                daysToDropDeadline <= 3
                  ? "text-red-600"
                  : daysToDropDeadline <= 7
                    ? "text-amber-600"
                    : "text-slate-500"
              }`}
            >
              {daysToDropDeadline > 0 ? `${daysToDropDeadline} day${daysToDropDeadline !== 1 ? "s" : ""} remaining` : "Deadline has passed"}{" "}
              ({dropDeadline.toLocaleDateString()})
            </p>
          </div>
        </div>
      ) : null}

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
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase text-slate-400">Enrollment Trend (7 days)</p>
            <svg width={trendWidth} height={trendHeight} viewBox={`0 0 ${trendWidth} ${trendHeight}`} className="w-full overflow-visible">
              <defs>
                <linearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={`${trendPath} L${trendPoints[trendPoints.length - 1]?.x ?? trendPad},${trendHeight - trendPad} L${trendPoints[0]?.x ?? trendPad},${trendHeight - trendPad} Z`}
                fill="url(#trend-grad)"
                opacity="0.4"
              />
              <path d={trendPath} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {trendPoints.map((point) => (
                <g key={point.point.day}>
                  <circle cx={point.x} cy={point.y} r={3} fill="#6366f1" />
                  <text x={point.x} y={trendHeight - 4} textAnchor="middle" fontSize="8" fill="#94a3b8">
                    {point.point.day}
                  </text>
                  {point.point.count > 0 ? (
                    <text x={point.x} y={point.y - 6} textAnchor="middle" fontSize="8" fill="#4f46e5" fontWeight="600">
                      {point.point.count}
                    </text>
                  ) : null}
                </g>
              ))}
            </svg>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase text-slate-400">Enrollment Status</p>
            <DonutChart
              data={[
                { label: "Enrolled", value: breakdown.enrolled, color: "#10b981" },
                { label: "Waitlisted", value: breakdown.waitlisted, color: "#f59e0b" },
                { label: "Pending", value: breakdown.pendingApproval, color: "#6366f1" },
                { label: "Dropped", value: breakdown.dropped, color: "#ef4444" }
              ]}
            />
          </div>
        </div>
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
                    <p className="mt-1 text-lg font-semibold text-blue-900">{formatUptime(opsMetrics.uptimeSeconds)}</p>
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

                <div className="space-y-2">
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Operational Alerts</p>
                  {activeAlerts.length === 0 ? (
                    <p className="text-sm text-emerald-700">No active threshold alerts.</p>
                  ) : (
                    <div className="space-y-2">
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
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">CSRF Origin Blocked</p>
                    <p className="mt-1 font-semibold text-slate-800">
                      {opsMetrics.security.csrfOriginBlocked} / {opsMetrics.thresholds.csrfOriginBlocked}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">CSRF Token Invalid</p>
                    <p className="mt-1 font-semibold text-slate-800">
                      {opsMetrics.security.csrfTokenInvalid} / {opsMetrics.thresholds.csrfTokenInvalid}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Login Rate Limited</p>
                    <p className="mt-1 font-semibold text-slate-800">
                      {opsMetrics.security.loginRateLimited} / {opsMetrics.thresholds.loginRateLimited}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Login Failed</p>
                    <p className="mt-1 font-semibold text-slate-800">{opsMetrics.security.loginFailed}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mail Delivery</p>
                    <p className="mt-1 font-semibold text-slate-800">
                      {opsMetrics.mail.sent} sent / {opsMetrics.mail.failed} failed
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {opsMetrics.mailIndicators.deliveryAttempts} attempts · {mailFailureRate} failure rate
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mail Transport</p>
                    <p className="mt-1 font-semibold text-slate-800">
                      {opsMetrics.mail.enabled ? (opsMetrics.mail.configured ? "Configured" : "Misconfigured") : "Disabled"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Last success: {mailLastSuccess}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Last failure: {mailLastFailure}
                    </p>
                  </div>
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

                {metricsHistory.length > 1 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Metrics History</p>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <svg
                        width={metricsHistoryWidth}
                        height={metricsHistoryHeight}
                        viewBox={`0 0 ${metricsHistoryWidth} ${metricsHistoryHeight}`}
                        className="w-full overflow-visible"
                      >
                        <path d={historyPath} fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        {historyPoints.map((point, index) => (
                          <g key={index}>
                            <circle cx={point.x} cy={point.y} r={2.5} fill="#0f172a" />
                            <text x={point.x} y={metricsHistoryHeight - 2} textAnchor="middle" fontSize="7" fill="#94a3b8">
                              {new Date(point.value.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </text>
                          </g>
                        ))}
                      </svg>
                      <p className="mt-2 text-[11px] text-slate-500">Recent request-count snapshots captured every 5 minutes.</p>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Deployment Info</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-slate-500">Environment</p>
                      <p className={`mt-0.5 font-semibold ${nodeEnv === "production" ? "text-emerald-600" : "text-amber-600"}`}>
                        {nodeEnv}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Version</p>
                      <p className="mt-0.5 font-mono font-semibold text-slate-700">{appVersion}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{buildTime || "—"}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Grafana</p>
                      <a
                        href={grafanaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block font-medium text-blue-600 hover:underline"
                      >
                        Open ↗
                      </a>
                    </div>
                  </div>
                  <div className="mt-3">
                    <AdminDataExport apiUrl={process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"} />
                  </div>
                </div>

                <div className="campus-card p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Monitoring</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Grafana", url: grafanaUrl, color: "text-orange-600", bg: "bg-orange-50 border-orange-200", icon: "📊" },
                      { label: "Prometheus", url: prometheusUrl, color: "text-red-600", bg: "bg-red-50 border-red-200", icon: "🔥" },
                      { label: "Alertmanager", url: alertmanagerUrl, color: "text-blue-600", bg: "bg-blue-50 border-blue-200", icon: "🔔" }
                    ].map((item) => (
                      <a
                        key={item.label}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-opacity hover:opacity-80 ${item.bg}`}
                      >
                        <span className="text-xl">{item.icon}</span>
                        <span className={`text-xs font-semibold ${item.color}`}>{item.label}</span>
                        <span className="text-[10px] text-slate-400">↗ Open</span>
                      </a>
                    ))}
                  </div>
                </div>
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
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-8 text-center">
              <p className="text-2xl">📋</p>
              <p className="mt-2 text-sm font-medium text-slate-600">No recent activity</p>
              <p className="mt-1 text-xs text-slate-400">Activity will appear here as actions are performed</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
              {recentActivity.map((log) => {
                const dateLabel = relativeDate(log.createdAt);
                const isAdmin = log.actorRole === "admin";
                return (
                  <div key={log.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-slate-800">{actionLabel(log.action)}</p>
                        <span className={`hidden shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase sm:inline-flex ${
                          isAdmin
                            ? "border-violet-200 bg-violet-50 text-violet-700"
                            : "border-blue-200 bg-blue-50 text-blue-700"
                        }`}>
                          {isAdmin ? "Admin" : "Student"}
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
