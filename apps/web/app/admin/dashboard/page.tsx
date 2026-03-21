import Link from "next/link";
import { serverApi } from "@/lib/server-api";
import { requireRole } from "@/lib/server-auth";
import { auditActionLabel, auditActorDisplay, auditEntityTypeLabel } from "@/lib/audit-labels";

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

type SystemHealth = {
  uptime: number;
  memUsed: number;
  memTotal: number;
  timestamp: string;
  dbOk: boolean;
  totalStudents: number;
  totalEnrollments: number;
  activeTermName: string | null;
  recentErrors: number;
};

function actorRoleBadge(role: string): { label: string; className: string } {
  const normalized = role.toUpperCase();
  if (normalized === "ADMIN") return { label: "管理员", className: "border-violet-200 bg-violet-50 text-violet-700" };
  if (normalized === "FACULTY") return { label: "教师", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (normalized === "ADVISOR") return { label: "顾问", className: "border-amber-200 bg-amber-50 text-amber-700" };
  return { label: "学生", className: "border-blue-200 bg-blue-50 text-blue-700" };
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return mins + " 分钟前";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + " 小时前";
  return Math.floor(hrs / 24) + " 天前";
}

export default async function AdminDashboardPage() {
  await requireRole("ADMIN");

  const [data, systemHealth, gradeAppeals, prereqWaivers, pendingOverloads] = await Promise.all([
    serverApi<Dashboard>("/admin/dashboard"),
    serverApi<SystemHealth>("/admin/system-health").catch(() => null),
    serverApi<Array<{ id: string }>>("/admin/grade-appeals?status=PENDING").catch(() => []),
    serverApi<{ pending: Array<{ id: string }>; history: Array<{ id: string }> }>("/admin/prereq-waivers?status=PENDING").catch(() => ({ pending: [], history: [] })),
    serverApi<Array<{ id: string }>>("/admin/pending-overloads").catch(() => []),
  ]);

  const { breakdown, activeTerm, recentActivity } = data;

  const appealsCount = gradeAppeals.length;
  const waiversCount = prereqWaivers.pending.length;
  const overloadsCount = pendingOverloads.length;
  const pendingApprovalCount = appealsCount + waiversCount + overloadsCount;

  const now = Date.now();
  const enrollmentGrandTotal =
    breakdown.enrolled + breakdown.waitlisted + breakdown.pendingApproval + breakdown.completed + breakdown.dropped;
  const enrollmentActive = breakdown.enrolled + breakdown.waitlisted + breakdown.pendingApproval;
  const enrolledPct = enrollmentActive > 0 ? Math.round((breakdown.enrolled / enrollmentActive) * 100) : 0;

  const barSegments =
    enrollmentGrandTotal > 0
      ? [
          { label: "在读", count: breakdown.enrolled, cls: "bg-emerald-500" },
          { label: "候补", count: breakdown.waitlisted, cls: "bg-amber-400" },
          { label: "待审批", count: breakdown.pendingApproval, cls: "bg-blue-400" },
          { label: "已退课", count: breakdown.dropped, cls: "bg-red-400" },
          { label: "已结课", count: breakdown.completed, cls: "bg-slate-300" },
        ]
      : [];

  const regOpen = Boolean(activeTerm?.registrationOpen);
  const dropDeadline = activeTerm?.dropDeadline ? new Date(activeTerm.dropDeadline) : null;
  const daysToDropDeadline = dropDeadline
    ? Math.ceil((dropDeadline.getTime() - now) / 86400000)
    : null;

  // Filter meaningful events — logins excluded by API; double-filter on client just in case
  const meaningfulActivity = recentActivity.filter(
    (l) => !["login", "logout", "login_failed"].includes(l.action)
  );

  return (
    <div className="campus-page">

      {/* ── Hero ── */}
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="campus-eyebrow">管理后台</p>
            <h1 className="campus-title">概览</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {systemHealth && (
              <span className={`campus-chip ${systemHealth.dbOk ? "chip-emerald" : "chip-red"}`}>
                数据库{systemHealth.dbOk ? "正常" : "异常"}
              </span>
            )}
            {data.waitlist > 0 && (
              <span className="campus-chip chip-amber">{data.waitlist} 条候补</span>
            )}
            {pendingApprovalCount > 0 && (
              <span className="campus-chip chip-red">{pendingApprovalCount} 条待审批</span>
            )}
          </div>
        </div>
      </section>

      {/* ── Pending action banner ── */}
      {pendingApprovalCount > 0 && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4">
          <p className="text-sm font-semibold text-orange-900">需要你处理的事项</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {appealsCount > 0 && (
              <Link
                href="/admin/appeals"
                className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-sm font-medium text-orange-800 no-underline transition hover:bg-orange-50"
              >
                成绩申诉
                <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {appealsCount}
                </span>
              </Link>
            )}
            {waiversCount > 0 && (
              <Link
                href="/admin/prereq-waivers"
                className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-sm font-medium text-orange-800 no-underline transition hover:bg-orange-50"
              >
                先修豁免
                <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {waiversCount}
                </span>
              </Link>
            )}
            {overloadsCount > 0 && (
              <Link
                href="/admin/pending-overloads"
                className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-sm font-medium text-orange-800 no-underline transition hover:bg-orange-50"
              >
                超学分申请
                <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {overloadsCount}
                </span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── KPI grid ── */}
      <div className="campus-kpi-grid">
        <Link href="/admin/students" className="no-underline">
          <div className="campus-kpi">
            <p className="campus-kpi-label">在读学生</p>
            <p className="campus-kpi-value">{systemHealth?.totalStudents ?? data.students}</p>
          </div>
        </Link>
        <Link href="/admin/enrollments" className="no-underline">
          <div className="campus-kpi">
            <p className="campus-kpi-label">当前学期注册</p>
            <p className="campus-kpi-value">{activeTerm?.enrollmentCount ?? 0}</p>
            <p className="mt-1 text-xs text-slate-400">{activeTerm?.name ?? "无活跃学期"}</p>
          </div>
        </Link>
        <Link href="/admin/appeals" className="no-underline">
          <div className="campus-kpi">
            <p className="campus-kpi-label">待审批</p>
            <p className={`campus-kpi-value ${pendingApprovalCount > 0 ? "text-orange-500" : ""}`}>
              {pendingApprovalCount}
            </p>
            <p className="mt-1 text-xs text-slate-400">申诉 / 豁免 / 超学分</p>
          </div>
        </Link>
        <Link href="/admin/sections" className="no-underline">
          <div className="campus-kpi">
            <p className="campus-kpi-label">教学班</p>
            <p className="campus-kpi-value">{data.sections}</p>
          </div>
        </Link>
      </div>

      {/* ── Active term spotlight ── */}
      {activeTerm ? (
        <div className={`rounded-2xl border p-5 ${regOpen ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-slate-500">当前学期</p>
                <span className={`campus-chip px-2 py-0.5 text-[10px] font-bold ${regOpen ? "chip-emerald" : "chip-slate"}`}>
                  {regOpen ? "选课开放中" : "选课未开放"}
                </span>
              </div>
              <p className="mt-1 text-xl font-bold text-slate-900">{activeTerm.name}</p>
              <p className="mt-1 text-sm text-slate-600">
                {regOpen
                  ? "选课截止 " + new Date(activeTerm.registrationCloseAt).toLocaleDateString()
                  : new Date(activeTerm.registrationOpenAt) > new Date()
                    ? "选课将于 " + new Date(activeTerm.registrationOpenAt).toLocaleDateString() + " 开放"
                    : "选课已于 " + new Date(activeTerm.registrationCloseAt).toLocaleDateString() + " 关闭"
                }
                {" · "}退课截止{" "}
                {dropDeadline ? dropDeadline.toLocaleDateString() : "—"}
                {daysToDropDeadline !== null && daysToDropDeadline > 0 && (
                  <span className={`ml-2 font-semibold ${daysToDropDeadline <= 3 ? "text-red-600" : "text-slate-700"}`}>
                    （还剩 {daysToDropDeadline} 天）
                  </span>
                )}
                {daysToDropDeadline !== null && daysToDropDeadline <= 0 && (
                  <span className="ml-2 font-semibold text-slate-400">（已过期）</span>
                )}
              </p>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <p className="text-2xl font-bold text-slate-900">{activeTerm.sectionCount}</p>
                <p className="text-xs text-slate-500">教学班</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{activeTerm.enrollmentCount}</p>
                <p className="text-xs text-slate-500">注册记录</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center">
          <p className="text-sm text-slate-500">当前没有进行中的学期</p>
          <Link href="/admin/terms" className="mt-2 inline-block text-sm font-medium text-slate-700 underline underline-offset-2">
            去添加学期 →
          </Link>
        </div>
      )}

      {/* ── Enrollment breakdown ── */}
      {enrollmentGrandTotal > 0 && (
        <div className="campus-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">注册状态分布</p>
            <Link href="/admin/enrollments" className="text-xs text-slate-400 hover:text-slate-600">
              查看明细 →
            </Link>
          </div>
          <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            {barSegments.filter((s) => s.count > 0).map((seg) => (
              <div
                key={seg.label}
                className={"h-full transition-all " + seg.cls}
                style={{ width: (seg.count / enrollmentGrandTotal * 100) + "%" }}
                title={seg.label + ": " + seg.count}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {barSegments.filter((s) => s.count > 0).map((seg) => (
              <span key={seg.label} className="flex items-center gap-1">
                <span className={"inline-block size-2 rounded-sm " + seg.cls} />
                {seg.label} {seg.count}
              </span>
            ))}
            <span className="ml-auto text-slate-400">确认率 {enrolledPct}%</span>
          </div>
        </div>
      )}

      {/* ── Recent meaningful activity ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500">最近操作</h2>
          <Link href="/admin/audit-logs" className="text-xs text-slate-400 hover:text-slate-600">
            查看全部 →
          </Link>
        </div>
        {meaningfulActivity.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-10 text-center">
            <p className="text-sm text-slate-400">暂无操作记录</p>
          </div>
        ) : (
          <div className="campus-card divide-y divide-slate-100 overflow-hidden">
            {meaningfulActivity.map((log) => {
              const badge = actorRoleBadge(log.actorRole);
              return (
                <div key={log.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {auditActionLabel(log.action)}
                      </p>
                      <span className={"shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase " + badge.className}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {auditActorDisplay(log.actorEmail)}
                      {log.entityType ? " · " + auditEntityTypeLabel(log.entityType) : ""}
                    </p>
                  </div>
                  <p className="ml-4 shrink-0 text-xs text-slate-400">{relativeTime(log.createdAt)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
