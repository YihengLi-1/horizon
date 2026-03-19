"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type SystemHealth = {
  uptime: number;
  memUsed: number;
  memTotal: number;
  nodeVersion: string;
  timestamp: string;
  totalStudents: number;
  totalEnrollments: number;
};

function formatUptime(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h} 小时 ${m} 分`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return `${d} 天 ${h} 小时`;
}

const REFRESH_INTERVAL = 30_000;

export default function AdminSystemHealthPage() {
  const [data, setData] = useState<SystemHealth | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void apiFetch<SystemHealth>("/admin/system-health")
      .then((result) => {
        setData(result);
        setRefreshedAt(new Date());
        setCountdown(REFRESH_INTERVAL / 1000);
      })
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  // countdown ticker
  useEffect(() => {
    const ticker = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? REFRESH_INTERVAL / 1000 : prev - 1));
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  const memPct = useMemo(() => {
    if (!data || data.memTotal === 0) return 0;
    return Math.round((data.memUsed / data.memTotal) * 100);
  }, [data]);

  const memTone = memPct > 85 ? "chip-red" : memPct >= 70 ? "chip-amber" : "chip-emerald";
  const overallStatus = data ? (memPct < 85 ? "正常" : "警告") : "—";
  const statusColor = data ? (memPct < 85 ? "text-emerald-700" : "text-amber-700") : "text-slate-400";

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="campus-eyebrow">系统运行状态</p>
            <h1 className="campus-title">系统健康仪表盘</h1>
            <p className="campus-subtitle">查看当前运行时状态、内存占用，以及本学期注册负载。</p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs text-slate-400">{countdown}s 后刷新</span>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="campus-btn-ghost text-xs"
            >
              {refreshing ? "刷新中…" : "立即刷新"}
            </button>
          </div>
        </div>
      </section>

      {!data ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">加载中…</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="campus-kpi">
              <p className="campus-kpi-label">系统状态</p>
              <p className={`campus-kpi-value ${statusColor}`}>{overallStatus}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">在线时长</p>
              <p className="campus-kpi-value">{formatUptime(data.uptime)}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">内存占用</p>
              <p className={`campus-kpi-value ${memPct > 85 ? "text-red-600" : memPct >= 70 ? "text-amber-600" : "text-emerald-600"}`}>
                {memPct}%
              </p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">学生总数</p>
              <p className="campus-kpi-value">{data.totalStudents.toLocaleString()}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">本期选课数</p>
              <p className="campus-kpi-value">{data.totalEnrollments.toLocaleString()}</p>
            </div>
          </div>

          <section className="campus-card p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <span className={`campus-chip ${memTone}`}>堆内存 {memPct}%</span>
                <span className="campus-chip chip-purple">Node.js {data.nodeVersion}</span>
                <span className="campus-chip chip-blue">
                  服务时间戳 {new Date(data.timestamp).toLocaleTimeString()}
                </span>
              </div>
              {refreshedAt && (
                <span className="text-xs text-slate-400">
                  本地刷新于 {refreshedAt.toLocaleTimeString()}
                </span>
              )}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">内存占用</p>
                <p className="mt-1.5 text-sm text-slate-600">
                  {Math.round(data.memUsed / 1024 / 1024)} MB / {Math.round(data.memTotal / 1024 / 1024)} MB
                </p>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all ${memPct > 85 ? "bg-red-500" : memPct >= 70 ? "bg-amber-400" : "bg-emerald-500"}`}
                    style={{ width: `${memPct}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                  <span>0 MB</span>
                  <span>{Math.round(data.memTotal / 1024 / 1024)} MB</span>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">运行说明</p>
                <p className="mt-1.5 text-sm text-slate-600">
                  数据每 {REFRESH_INTERVAL / 1000} 秒自动刷新。展示 API 进程实时运行时状态、
                  全局学生数与当前学期注册量，适合监控部署后的基本健康情况。
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
