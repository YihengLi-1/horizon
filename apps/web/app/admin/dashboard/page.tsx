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
    admin_crud: "数据更新",
    promote_waitlist: "候补补位",
    grade_update: "成绩更新",
    login: "登录",
    registration_submit: "提交注册",
    drop: "退课"
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
            <p className="campus-eyebrow">运营概览</p>
            <h1 className="campus-title">管理概览</h1>
            <p className="text-base text-slate-600">
              查看学生、课程、注册状态和当前学期的运营概况。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="campus-chip chip-emerald">
              {data.students} 名学生
            </span>
            <span className="campus-chip chip-blue">
              {data.sections} 个教学班
            </span>
            {data.waitlist > 0 && (
              <span className="campus-chip chip-amber">
                {data.waitlist} 条候补
              </span>
            )}
            {breakdown.pendingApproval > 0 && (
              <span className="campus-chip chip-purple">
                {breakdown.pendingApproval} 条待审批
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
        <StatCard label="学生" value={data.students} sub="系统内账号" href="/admin/students" />
        <StatCard label="课程" value={data.courses} sub="目录课程数" href="/admin/courses" />
        <StatCard label="教学班" value={data.sections} sub="全部学期" href="/admin/sections" />
        <StatCard label="学期" value={data.terms} sub="当前配置总数" href="/admin/terms" />
      </div>

      {/* Active term spotlight */}
      {activeTerm ? (
        <div className={`rounded-2xl border p-5 ${regOpen ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-blue-50"}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className={`text-[11px] font-semibold uppercase tracking-wide ${regOpen ? "text-emerald-700" : "text-blue-700"}`}>
                  当前学期
                </p>
                <span className={`campus-chip px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  regOpen
                    ? "chip-emerald"
                    : "chip-blue"
                }`}>
                  {regOpen ? "开放中" : "未开放"}
                </span>
              </div>
              <p className={`mt-1 text-xl font-bold ${regOpen ? "text-emerald-900" : "text-blue-900"}`}>{activeTerm.name}</p>
              <p className={`mt-1 text-sm ${regOpen ? "text-emerald-700" : "text-blue-700"}`}>
                {regOpen ? (
                  <>
                    截止于 {new Date(activeTerm.registrationCloseAt).toLocaleDateString()}
                    {(() => {
                      const daysLeft = Math.ceil(
                        (new Date(activeTerm.registrationCloseAt).getTime() - now) / (1000 * 60 * 60 * 24)
                      );
                      return daysLeft <= 7 ? (
                        <span className={`ml-2 campus-chip px-1.5 py-0.5 text-[10px] font-bold ${
                          daysLeft <= 2
                            ? "chip-red"
                            : "chip-amber"
                        }`}>
                          剩余 {daysLeft} 天
                        </span>
                      ) : null;
                    })()}
                  </>
                ) : (
                  new Date(activeTerm.registrationOpenAt) > new Date()
                    ? `${new Date(activeTerm.registrationOpenAt).toLocaleDateString()} 开放`
                    : `${new Date(activeTerm.registrationCloseAt).toLocaleDateString()} 已关闭`
                )}
                {" · "}退课截止 {new Date(activeTerm.dropDeadline).toLocaleDateString()}
                {daysToDropDeadline !== null ? (
                  <>
                    {" "}
                    <span className="font-semibold">
                    · {daysToDropDeadline > 0 ? `还剩 ${daysToDropDeadline} 天` : "已过截止日"}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            <div className={`flex gap-6 text-center`}>
              <div>
                <p className={`text-2xl font-bold ${regOpen ? "text-emerald-900" : "text-blue-900"}`}>{activeTerm.sectionCount}</p>
                <p className={`text-sm ${regOpen ? "text-emerald-700" : "text-blue-700"}`}>教学班</p>
              </div>
              <div>
                <p className={`text-2xl font-bold ${regOpen ? "text-emerald-900" : "text-blue-900"}`}>{activeTerm.enrollmentCount}</p>
                <p className={`text-sm ${regOpen ? "text-emerald-700" : "text-blue-700"}`}>注册记录</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          当前没有进行中的学期。{" "}
          <Link href="/admin/terms" className="font-medium text-slate-700 underline underline-offset-2">
            去管理学期 →
          </Link>
        </div>
      )}

      {/* Enrollment breakdown */}
      <div>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500">注册状态</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="已注册" value={breakdown.enrolled} accent="text-emerald-600" href="/admin/enrollments" />
          <StatCard
            label="候补中"
            value={breakdown.waitlisted}
            accent="text-amber-600"
            href="/admin/waitlist"
          />
          <StatCard
            label="待审批"
            value={breakdown.pendingApproval}
            accent="text-blue-600"
            href="/admin/enrollments"
          />
          <StatCard label="已完成" value={breakdown.completed} accent="text-slate-500" />
          <StatCard label="已退课" value={breakdown.dropped} accent="text-red-500" />
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
              <span className="ml-auto text-slate-400">当前确认率 {enrolledPct}%</span>
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
          value={systemHealthy ? "正常" : "异常"}
          sub={`${opsVersion?.nodeEnv ?? nodeEnv} · ${opsVersion?.version ?? appVersion}`}
          accent={systemHealthy ? "text-emerald-600" : "text-red-600"}
        />
        <StatCard
          label="请求数"
          value={opsMetrics?.requestsTotal ?? "—"}
          sub="服务启动后累计"
        />
        <StatCard
          label="错误率"
          value={errorRatePct !== null ? `${errorRatePct}%` : "—"}
          sub="4xx 与 5xx 响应"
          accent={errorRatePct !== null && Number(errorRatePct) > 5 ? "text-red-600" : "text-slate-900"}
        />
        <StatCard
          label="运行时长"
          value={opsMetrics ? formatUptime(opsMetrics.uptimeSeconds) : "—"}
          sub={opsVersion?.buildTime ?? buildTime}
          accent="text-blue-700"
        />
      </div>

      {activeAlerts.length > 0 ? (
        <div className="campus-card p-4">
          <p className="mb-3 text-sm font-semibold tracking-wide text-slate-500">系统提醒</p>
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
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500">系统摘要</h2>
          <div className="campus-card p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold tracking-wide text-slate-500">环境</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{opsVersion?.nodeEnv ?? nodeEnv}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold tracking-wide text-slate-500">版本</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{opsVersion?.version ?? appVersion}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold tracking-wide text-slate-500">待审批</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{breakdown.pendingApproval}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold tracking-wide text-slate-500">候补压力</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{data.waitlist}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              首页只保留学籍和注册运营的核心信息，导出、搜索和监控已经拆回各自页面。
            </p>
          </div>
        </div>
      </div>

      {/* Quick actions + recent activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500">常用操作</h2>
          <div className="grid gap-3">
            <ActionButton href="/admin/sections" label="管理教学班" desc="查看、创建和修改课程教学班" />
            <ActionButton href="/admin/waitlist" label="处理候补" desc="将候补学生推进到正式注册" />
            <ActionButton href="/admin/enrollments" label="录入成绩" desc="为已完成课程录入最终成绩" />
            <ActionButton href="/admin/import" label="导入数据" desc="批量导入学生、课程或教学班" />
            <ActionButton href="/admin/invite-codes" label="管理邀请码" desc="生成并维护注册邀请码" />
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
            <div className="campus-card divide-y divide-slate-100 overflow-hidden">
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
