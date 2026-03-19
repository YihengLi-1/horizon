"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type GpaStats = {
  myGpa: number | null;
  count: number;
  mean: number | null;
  median: number | null;
  percentile: number | null;
};

function GaugeArc({ pct }: { pct: number }) {
  // Semi-circle gauge, 0–100%
  const r = 70;
  const cx = 100;
  const cy = 100;
  const startAngle = Math.PI; // 180°
  const endAngle = 0; // 0°
  const angle = Math.PI - (pct / 100) * Math.PI;
  const x = cx + r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);
  const trackPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const fillPath = pct > 0 ? `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x} ${y}` : "";
  const color = pct >= 75 ? "#10b981" : pct >= 50 ? "#3b82f6" : pct >= 25 ? "#f59e0b" : "#ef4444";
  return (
    <svg viewBox="0 0 200 110" className="w-full max-w-[280px]">
      <path d={trackPath} fill="none" stroke="#e2e8f0" strokeWidth="16" strokeLinecap="round" />
      {fillPath ? (
        <path d={fillPath} fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" />
      ) : null}
      <text x={cx} y={cy - 10} textAnchor="middle" className="text-3xl font-black" style={{ fontSize: 28, fontWeight: 800, fill: color }}>
        {pct}%
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 11, fill: "#94a3b8" }}>
        高于该比例同学
      </text>
      <text x={cx - r - 4} y={cy + 18} textAnchor="end" style={{ fontSize: 10, fill: "#94a3b8" }}>0%</text>
      <text x={cx + r + 4} y={cy + 18} textAnchor="start" style={{ fontSize: 10, fill: "#94a3b8" }}>100%</text>
    </svg>
  );
}

export default function PeerComparePage() {
  const [stats, setStats] = useState<GpaStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<GpaStats>("/students/gpa-stats")
      .then((d) => setStats(d))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const diff = stats?.myGpa != null && stats.mean != null ? (stats.myGpa - stats.mean) : null;
  const diffFromMedian = stats?.myGpa != null && stats.median != null ? (stats.myGpa - stats.median) : null;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业分析</p>
        <h1 className="campus-title">同伴 GPA 对比</h1>
        <p className="campus-subtitle">将你的累计 GPA 与同届学生进行横向比较</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">我的 GPA</p>
          <p className={`campus-kpi-value ${stats?.myGpa != null && stats.myGpa >= 3.5 ? "text-emerald-600" : "text-slate-800"}`}>
            {loading ? "—" : stats?.myGpa != null ? stats.myGpa.toFixed(3) : "暂无"}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">全体均值</p>
          <p className="campus-kpi-value">{loading ? "—" : stats?.mean?.toFixed(2) ?? "—"}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">全体中位数</p>
          <p className="campus-kpi-value">{loading ? "—" : stats?.median?.toFixed(2) ?? "—"}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">参与比较学生数</p>
          <p className="campus-kpi-value text-slate-600">{loading ? "—" : stats?.count ?? 0}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : !stats?.myGpa ? (
        <div className="campus-card p-10 text-center">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-sm font-semibold text-slate-600">暂无成绩数据</p>
          <p className="mt-1 text-xs text-slate-400">完成带评分的课程后，此处将显示你的百分位数。</p>
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2">
            {/* Percentile gauge */}
            <div className="campus-card flex flex-col items-center p-6 gap-4">
              <p className="font-semibold text-slate-800">成绩百分位</p>
              <GaugeArc pct={stats.percentile ?? 0} />
              <p className="text-sm text-slate-600 text-center">
                你的 GPA <span className="font-bold text-slate-900">{stats.myGpa.toFixed(3)}</span> 高于 <span className="font-bold text-[hsl(221_83%_43%)]">{stats.percentile}%</span> 的同学
              </p>
            </div>

            {/* Comparison bars */}
            <div className="campus-card p-6 space-y-5">
              <p className="font-semibold text-slate-800">GPA 对比</p>
              {[
                { label: "我的 GPA", value: stats.myGpa, color: "bg-[hsl(221_83%_43%)]" },
                { label: "全体均值", value: stats.mean ?? 0, color: "bg-slate-400" },
                { label: "全体中位数", value: stats.median ?? 0, color: "bg-slate-300" },
              ].map(({ label, value, color }) => (
                <div key={label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{label}</span>
                    <span className="font-bold text-slate-900">{value.toFixed(2)}</span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100">
                    <div className={`h-3 rounded-full ${color}`} style={{ width: `${(value / 4.0) * 100}%` }} />
                  </div>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-3 space-y-1 text-sm">
                {diff != null ? (
                  <p className="text-slate-600">
                    与均值差：<span className={`font-bold ${diff >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {diff >= 0 ? "+" : ""}{diff.toFixed(3)}
                    </span>
                  </p>
                ) : null}
                {diffFromMedian != null ? (
                  <p className="text-slate-600">
                    与中位数差：<span className={`font-bold ${diffFromMedian >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {diffFromMedian >= 0 ? "+" : ""}{diffFromMedian.toFixed(3)}
                    </span>
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <div className="campus-card p-4 text-xs text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700 text-sm">说明</p>
            <p>百分位数基于所有已完成至少一门带评分课程的学生的累计 GPA 计算。</p>
            <p>数据每次页面加载时实时计算，不含在读或待评分课程。</p>
          </div>
        </>
      )}
    </div>
  );
}
