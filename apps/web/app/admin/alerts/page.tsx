"use client";

/**
 * Admin System Alert Center
 * Aggregates all operational alerts in one place:
 *  - Missing grades (COMPLETED without finalGrade)
 *  - Pending grade appeals
 *  - PENDING_APPROVAL enrollments
 *  - Active student holds
 *  - Near-capacity sections (≥90%)
 *  - Past-term unclosed enrollments
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type SystemAlert = {
  id: string;
  type: string;
  severity: "error" | "warning" | "info";
  title: string;
  description: string;
  actionUrl: string;
  count: number;
};

const SEVERITY_META = {
  error:   { cls: "border-red-200 bg-red-50",    icon: "🔴", badge: "border-red-200 bg-red-100 text-red-700",    label: "紧急" },
  warning: { cls: "border-amber-200 bg-amber-50", icon: "🟡", badge: "border-amber-200 bg-amber-100 text-amber-700", label: "警告" },
  info:    { cls: "border-blue-200 bg-blue-50",   icon: "🔵", badge: "border-blue-200 bg-blue-100 text-blue-700",   label: "提示" }
} as const;

const TYPE_LABEL: Record<string, string> = {
  MISSING_GRADE:     "成绩缺失",
  GRADE_APPEAL:      "成绩申诉",
  PENDING_ENROLLMENT:"注册审批",
  ACTIVE_HOLD:       "学生限制",
  NEAR_CAPACITY:     "容量预警",
  NOT_CLOSED_OUT:    "未结课"
};

export default function AdminAlertsPage() {
  const [alerts, setAlerts]     = useState<SystemAlert[]>([]);
  const [loading, setLoading]   = useState(true);
  const [lastRefresh, setLast]  = useState<Date | null>(null);
  const [filter, setFilter]     = useState<"all" | "error" | "warning" | "info">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<SystemAlert[]>("/admin/alerts");
      setAlerts(data ?? []);
      setLast(new Date());
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 60 s
  useEffect(() => {
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const visible = alerts.filter(
    (a) => filter === "all" || a.severity === filter
  );

  const errorCount   = alerts.filter((a) => a.severity === "error").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;
  const infoCount    = alerts.filter((a) => a.severity === "info").length;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Operations</p>
        <h1 className="campus-title">
          系统警报中心
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          实时汇总所有需要处理的运营问题，每 60 秒自动刷新
        </p>
      </section>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">总警报数</p>
          <p className={`campus-kpi-value ${alerts.length > 0 ? "text-slate-700" : "text-emerald-600"}`}>
            {loading ? "…" : alerts.length}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">🔴 紧急</p>
          <p className={`campus-kpi-value ${errorCount > 0 ? "text-red-600" : "text-slate-400"}`}>
            {loading ? "…" : errorCount}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">🟡 警告</p>
          <p className={`campus-kpi-value ${warningCount > 0 ? "text-amber-600" : "text-slate-400"}`}>
            {loading ? "…" : warningCount}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">🔵 提示</p>
          <p className={`campus-kpi-value ${infoCount > 0 ? "text-blue-600" : "text-slate-400"}`}>
            {loading ? "…" : infoCount}
          </p>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="campus-toolbar flex-wrap gap-2">
        {(["all", "error", "warning", "info"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`campus-chip px-3 py-1 text-xs transition ${
              filter === f
                ? "chip-blue"
                : "chip-purple hover:bg-slate-50"
            }`}
          >
            {f === "all" ? "全部" : f === "error" ? "🔴 紧急" : f === "warning" ? "🟡 警告" : "🔵 提示"}
            <span className="ml-1 opacity-70">
              ({f === "all" ? alerts.length : alerts.filter((a) => a.severity === f).length})
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "刷新中…" : "🔄 立即刷新"}
        </button>
        {lastRefresh && (
          <span className="text-xs text-slate-400 self-center">
            最后更新：{lastRefresh.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-2xl">⏳</p>
          <p className="mt-2 text-sm text-slate-600">正在检查系统状态…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="campus-card px-6 py-16 text-center">
          <p className="text-4xl">✅</p>
          <p className="mt-3 text-lg font-semibold text-emerald-700">
            {filter === "all" ? "系统运行正常，暂无警报！" : "该级别暂无警报"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            所有关键指标均在正常范围内
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((alert) => {
            const meta = SEVERITY_META[alert.severity];
            return (
              <div
                key={alert.id}
                className={`campus-card flex items-start gap-4 p-4 border ${meta.cls}`}
              >
                {/* Icon */}
                <div className="mt-0.5 text-xl shrink-0">{meta.icon}</div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-slate-900">{alert.title}</h3>
                    <span className={`campus-chip text-xs ${alert.severity === "error" ? "chip-red" : alert.severity === "warning" ? "chip-amber" : "chip-blue"}`}>
                      {meta.label}
                    </span>
                    <span className="campus-chip chip-purple text-xs">
                      {TYPE_LABEL[alert.type] ?? alert.type}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{alert.description}</p>
                </div>

                {/* Count badge + Action */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-2xl font-bold text-slate-700">{alert.count}</span>
                  <Link
                    href={alert.actionUrl}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    前往处理 →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer hint */}
      <p className="text-xs text-slate-400 text-center">
        警报数据来源：成绩记录、申诉系统、注册管理、学生限制、教学班容量
      </p>
    </div>
  );
}
