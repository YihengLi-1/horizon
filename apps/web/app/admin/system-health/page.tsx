"use client";

import { useEffect, useMemo, useState } from "react";
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

function formatUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export default function AdminSystemHealthPage() {
  const [data, setData] = useState<SystemHealth | null>(null);

  useEffect(() => {
    void apiFetch<SystemHealth>("/admin/system-health").then((result) => setData(result));
  }, []);

  const memPct = useMemo(() => {
    if (!data || data.memTotal === 0) return 0;
    return Math.round((data.memUsed / data.memTotal) * 100);
  }, [data]);

  const memTone = memPct > 85 ? "chip-red" : memPct >= 70 ? "chip-amber" : "chip-emerald";

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">系统运行状态</p>
        <h1 className="campus-title">系统健康仪表盘</h1>
        <p className="campus-subtitle">查看当前运行时状态、内存占用，以及本学期注册负载。</p>
      </section>

      {!data ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">加载中…</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">在线时长</p>
              <p className="campus-kpi-value">{formatUptime(data.uptime)}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">内存占用</p>
              <p className="campus-kpi-value">{memPct}%</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">学生总数</p>
              <p className="campus-kpi-value">{data.totalStudents}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">本期选课数</p>
              <p className="campus-kpi-value">{data.totalEnrollments}</p>
            </div>
          </div>

          <section className="campus-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`campus-chip ${memTone}`}>堆内存 {memPct}%</span>
              <span className="campus-chip chip-purple">Node.js {data.nodeVersion}</span>
              <span className="campus-chip chip-blue">
                更新时间 {new Date(data.timestamp).toLocaleString()}
              </span>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">内存明细</p>
                <p className="mt-2 text-sm text-slate-600">
                  {Math.round(data.memUsed / 1024 / 1024)} MB / {Math.round(data.memTotal / 1024 / 1024)} MB
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${memPct > 85 ? "bg-red-500" : memPct >= 70 ? "bg-amber-400" : "bg-emerald-500"}`}
                    style={{ width: `${memPct}%` }}
                  />
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">运行说明</p>
                <p className="mt-2 text-sm text-slate-600">
                  这个面板直接读取运行时状态，并叠加系统学生数与当前学期注册量，适合演示部署后的基本健康情况。
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
