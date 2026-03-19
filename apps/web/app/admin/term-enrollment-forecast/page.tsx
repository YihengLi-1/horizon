"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type TermPoint = {
  termId: string;
  termName: string;
  startDate: string;
  enrolled: number;
  completed: number;
  dropped: number;
  waitlisted: number;
  total: number;
};

type ForecastData = {
  terms: TermPoint[];
  forecast: { value: number; trend: "up" | "down" | "flat"; slope: number } | null;
};

const STATUS_COLORS: Record<string, string> = {
  enrolled: "bg-blue-400",
  completed: "bg-emerald-400",
  dropped: "bg-red-400",
  waitlisted: "bg-amber-400",
};

export default function TermEnrollmentForecastPage() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<ForecastData>("/admin/term-enrollment-forecast")
      .then((d) => setData(d ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const terms = data?.terms ?? [];
  const maxTotal = Math.max(1, ...terms.map((t) => t.total));
  const forecastVal = data?.forecast?.value ?? 0;
  const trend = data?.forecast?.trend;
  const slope = data?.forecast?.slope;

  function trendIcon() {
    if (trend === "up") return "↑";
    if (trend === "down") return "↓";
    return "→";
  }
  function trendColor() {
    if (trend === "up") return "text-emerald-600";
    if (trend === "down") return "text-red-600";
    return "text-slate-500";
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">招生预测</p>
        <h1 className="campus-hero-title">学期注册人数预测</h1>
        <p className="campus-hero-subtitle">基于历史各学期注册数据进行线性趋势分析与下学期预测</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">历史学期数</p>
          <p className="campus-kpi-value">{loading ? "—" : terms.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">最近学期总注册</p>
          <p className="campus-kpi-value">
            {loading || !terms.length ? "—" : terms[terms.length - 1].total}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">下学期预测</p>
          <p className={`campus-kpi-value ${trendColor()}`}>
            {loading || !data?.forecast ? "—" : forecastVal}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">趋势</p>
          <p className={`campus-kpi-value ${trendColor()}`}>
            {loading || !data?.forecast ? "—" : `${trendIcon()} ${Math.abs(slope ?? 0)}/期`}
          </p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {/* Stacked bar chart */}
      {!loading && terms.length > 0 ? (
        <section className="campus-card p-5">
          <p className="font-semibold text-slate-800 mb-4">各学期注册构成（堆叠柱状图）</p>
          <div className="flex items-end gap-2 h-48 overflow-x-auto pb-1">
            {terms.map((t) => (
              <div key={t.termId} className="flex flex-col items-center gap-1 min-w-[56px]">
                <div className="w-10 flex flex-col justify-end" style={{ height: "160px" }}>
                  {/* forecast reference line via dashed border — rendered as stacked bars */}
                  {(["enrolled", "completed", "dropped", "waitlisted"] as const).map((key) => {
                    const val = t[key];
                    const h = (val / maxTotal) * 160;
                    return h > 0 ? (
                      <div key={key} className={`w-full ${STATUS_COLORS[key]} rounded-sm`} style={{ height: `${h}px` }} />
                    ) : null;
                  })}
                </div>
                <span className="text-[10px] text-slate-500 text-center leading-tight w-12 truncate" title={t.termName}>
                  {t.termName}
                </span>
              </div>
            ))}
            {/* Forecast column */}
            {data?.forecast ? (
              <div className="flex flex-col items-center gap-1 min-w-[56px]">
                <div className="w-10 flex flex-col justify-end" style={{ height: "160px" }}>
                  <div
                    className="w-full bg-blue-200 rounded-sm border-2 border-dashed border-blue-500"
                    style={{ height: `${Math.min(160, (forecastVal / maxTotal) * 160)}px` }}
                  />
                </div>
                <span className="text-[10px] text-blue-600 font-bold text-center leading-tight">预测</span>
              </div>
            ) : null}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3">
            {[
              { key: "enrolled", label: "在读" },
              { key: "completed", label: "已完课" },
              { key: "dropped", label: "已退课" },
              { key: "waitlisted", label: "候补" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className={`inline-block size-3 rounded-sm ${STATUS_COLORS[key]}`} />
                {label}
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-xs text-blue-600">
              <span className="inline-block size-3 rounded-sm bg-blue-200 border border-dashed border-blue-500" />
              下学期预测
            </div>
          </div>
        </section>
      ) : null}

      {/* Data table */}
      <section className="campus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <th className="px-4 py-3 text-left">学期</th>
                <th className="px-4 py-3 text-right">在读</th>
                <th className="px-4 py-3 text-right">已完课</th>
                <th className="px-4 py-3 text-right">已退课</th>
                <th className="px-4 py-3 text-right">候补</th>
                <th className="px-4 py-3 text-right font-bold text-slate-700">合计</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
              ) : terms.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">暂无数据</td></tr>
              ) : terms.map((t) => (
                <tr key={t.termId} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">{t.termName}</td>
                  <td className="px-4 py-3 text-right font-mono text-blue-600">{t.enrolled}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-600">{t.completed}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-400">{t.dropped}</td>
                  <td className="px-4 py-3 text-right font-mono text-amber-500">{t.waitlisted}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">{t.total}</td>
                </tr>
              ))}
              {!loading && data?.forecast ? (
                <tr className="border-t-2 border-blue-200 bg-blue-50/40">
                  <td className="px-4 py-3 font-bold text-blue-700">下学期（预测）</td>
                  <td colSpan={4} className="px-4 py-3 text-right text-xs text-slate-500">
                    线性回归 · 斜率 {slope}/期
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-blue-700">{forecastVal}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
