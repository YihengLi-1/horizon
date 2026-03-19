"use client";

import { useEffect, useState } from "react";
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

const SEVERITY_CONFIG = {
  error: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", badge: "bg-red-100 text-red-700", icon: "🔴" },
  warning: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", badge: "bg-amber-100 text-amber-700", icon: "🟡" },
  info: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", badge: "bg-blue-100 text-blue-700", icon: "🔵" },
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  function fetchAlerts() {
    setLoading(true);
    void apiFetch<SystemAlert[]>("/admin/alerts")
      .then((d) => { setAlerts(d ?? []); setLastRefresh(new Date()); })
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(interval);
  }, []);

  const errors = alerts.filter((a) => a.severity === "error");
  const warnings = alerts.filter((a) => a.severity === "warning");
  const infos = alerts.filter((a) => a.severity === "info");

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">系统监控</p>
        <h1 className="campus-title">系统预警中心</h1>
        <p className="campus-subtitle">实时监控系统状态，自动每 60 秒刷新</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">紧急警告</p>
          <p className={`campus-kpi-value ${errors.length > 0 ? "text-red-600" : "text-emerald-600"}`}>
            {loading ? "—" : errors.length === 0 ? "✓ 无" : errors.length}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">一般警告</p>
          <p className={`campus-kpi-value ${warnings.length > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {loading ? "—" : warnings.length === 0 ? "✓ 无" : warnings.length}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">提示信息</p>
          <p className="campus-kpi-value text-slate-600">{loading ? "—" : infos.length}</p>
        </div>
      </section>

      <div className="campus-toolbar">
        <button type="button" onClick={fetchAlerts} className="campus-btn-ghost text-sm">
          ↻ 立即刷新
        </button>
        <p className="text-xs text-slate-400">
          最后刷新：{lastRefresh.toLocaleTimeString("zh-CN")}
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : alerts.length === 0 ? (
        <div className="campus-card p-12 text-center">
          <p className="text-5xl mb-3">✅</p>
          <p className="text-base font-semibold text-emerald-700">系统运行正常，暂无预警</p>
        </div>
      ) : (
        <div className="space-y-3">
          {([errors, warnings, infos] as const).map((group) =>
            group.map((alert) => {
              const cfg = SEVERITY_CONFIG[alert.severity];
              return (
                <div key={alert.id} className={`rounded-xl border p-5 ${cfg.bg} ${cfg.border}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-semibold ${cfg.text}`}>{alert.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cfg.badge}`}>
                          {alert.count} 条
                        </span>
                      </div>
                      <p className={`mt-1 text-sm ${cfg.text} opacity-80`}>{alert.description}</p>
                    </div>
                    {alert.actionUrl ? (
                      <Link href={alert.actionUrl} className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:opacity-80 ${cfg.badge} ${cfg.border}`}>
                        处理 →
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
