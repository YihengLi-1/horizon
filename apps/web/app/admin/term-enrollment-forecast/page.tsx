"use client";

/**
 * Admin Term Enrollment Forecast
 * Shows historical enrollment per term + linear regression forecast for next term.
 */

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type TermStat = {
  termId: string;
  termName: string;
  startDate: string;
  enrolled: number;
  completed: number;
  dropped: number;
  waitlisted: number;
  total: number;
};

type Forecast = { value: number; trend: "up" | "down" | "flat"; slope: number };

type ForecastData = { terms: TermStat[]; forecast: Forecast | null };

export default function TermEnrollmentForecastPage() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<ForecastData>("/admin/term-enrollment-forecast")
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const chartMeta = useMemo(() => {
    if (!data?.terms.length) return null;
    const points = data.terms;
    const maxTotal = Math.max(1, ...points.map((t) => t.total));
    return { points, maxTotal };
  }, [data]);

  const trendLabel = data?.forecast?.trend === "up" ? "↑ 上升" : data?.forecast?.trend === "down" ? "↓ 下降" : "→ 平稳";
  const trendColor = data?.forecast?.trend === "up" ? "text-emerald-600" : data?.forecast?.trend === "down" ? "text-red-600" : "text-amber-600";

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Enrollment Forecast</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">学期选课预测</h1>
        <p className="mt-1 text-sm text-slate-500">基于历史数据的线性趋势预测，辅助下学期容量规划</p>
      </section>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : !data ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">暂无数据</div>
      ) : (
        <>
          {/* Forecast KPI */}
          {data.forecast && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="campus-kpi">
                <p className="campus-kpi-label">历史学期数</p>
                <p className="campus-kpi-value text-indigo-600">{data.terms.length}</p>
              </div>
              <div className="campus-kpi">
                <p className="campus-kpi-label">下期预测总选课</p>
                <p className="campus-kpi-value text-emerald-600">{data.forecast.value.toLocaleString()}</p>
              </div>
              <div className="campus-kpi">
                <p className="campus-kpi-label">趋势</p>
                <p className={`campus-kpi-value ${trendColor}`}>{trendLabel}</p>
              </div>
              <div className="campus-kpi">
                <p className="campus-kpi-label">斜率（人/学期）</p>
                <p className={`campus-kpi-value ${trendColor}`}>{data.forecast.slope > 0 ? "+" : ""}{data.forecast.slope}</p>
              </div>
            </div>
          )}

          {/* SVG line chart */}
          {chartMeta && (
            <div className="campus-card p-4">
              <h2 className="text-sm font-bold text-slate-900 mb-4">各学期选课总量趋势</h2>
              <svg viewBox="0 0 700 260" className="w-full">
                {/* Axes */}
                <line x1="60" y1="220" x2="680" y2="220" stroke="#e2e8f0" strokeWidth="1.5" />
                <line x1="60" y1="20" x2="60" y2="220" stroke="#e2e8f0" strokeWidth="1.5" />

                {/* Y grid lines */}
                {[0.25, 0.5, 0.75, 1].map((f) => {
                  const y = 220 - f * 185;
                  return (
                    <g key={f}>
                      <line x1="60" y1={y} x2="680" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                      <text x="55" y={y + 3} textAnchor="end" fontSize="8" fill="#94a3b8">
                        {Math.round(f * chartMeta.maxTotal)}
                      </text>
                    </g>
                  );
                })}
                <text x="55" y="223" textAnchor="end" fontSize="8" fill="#94a3b8">0</text>

                {/* Stacked bars */}
                {chartMeta.points.map((t, i) => {
                  const n = chartMeta.points.length;
                  const barW = Math.min(40, (620 / n) * 0.6);
                  const cx = 60 + (i / Math.max(1, n - 1)) * 620;
                  const stackColors = [
                    { key: "enrolled" as const, color: "#4f46e5" },
                    { key: "completed" as const, color: "#10b981" },
                    { key: "dropped" as const, color: "#f59e0b" },
                    { key: "waitlisted" as const, color: "#e2e8f0" },
                  ];
                  let cumH = 0;
                  return (
                    <g key={t.termId}>
                      {stackColors.map(({ key, color }) => {
                        const h = (t[key] / chartMeta.maxTotal) * 185;
                        const y = 220 - cumH - h;
                        cumH += h;
                        return h > 0 ? (
                          <rect key={key} x={cx - barW / 2} y={y} width={barW} height={h} fill={color} rx="1" />
                        ) : null;
                      })}
                      <text x={cx} y="234" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
                        {t.termName.length > 8 ? t.termName.slice(-6) : t.termName}
                      </text>
                    </g>
                  );
                })}

                {/* Forecast point */}
                {data.forecast && (() => {
                  const n = chartMeta.points.length;
                  const fx = 60 + (n / Math.max(1, n - 1)) * 620;
                  const fy = 220 - (Math.min(data.forecast.value, chartMeta.maxTotal * 1.2) / chartMeta.maxTotal) * 185;
                  return (
                    <g>
                      <line x1={60 + ((n - 1) / Math.max(1, n - 1)) * 620} y1={220 - (chartMeta.points[n - 1]?.total / chartMeta.maxTotal) * 185} x2={Math.min(fx, 680)} y2={Math.max(fy, 10)} stroke="#4f46e5" strokeWidth="1.5" strokeDasharray="4,3" />
                      <circle cx={Math.min(fx, 680)} cy={Math.max(fy, 10)} r="5" fill="#4f46e5" opacity="0.6" />
                      <text x={Math.min(fx, 680)} y={Math.max(fy, 10) - 7} textAnchor="middle" fontSize="8" fill="#4f46e5" fontWeight="bold">
                        预测 {data.forecast.value}
                      </text>
                    </g>
                  );
                })()}
              </svg>

              {/* Legend */}
              <div className="flex gap-4 mt-2 flex-wrap text-xs text-slate-500">
                {[["bg-indigo-600", "在读"], ["bg-emerald-500", "完成"], ["bg-amber-400", "退课"], ["bg-slate-200", "候补"]].map(([bg, lbl]) => (
                  <span key={lbl} className="flex items-center gap-1">
                    <span className={`inline-block w-3 h-3 rounded-sm ${bg}`} />{lbl}
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <span className="inline-block w-5 border-t-2 border-dashed border-indigo-500" />预测值
                </span>
              </div>
            </div>
          )}

          {/* Historical table */}
          <div className="campus-card overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-sm font-bold text-slate-900">历史数据明细</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 pl-4 text-left font-semibold">学期</th>
                    <th className="pb-2 pr-3 text-right font-semibold">在读</th>
                    <th className="pb-2 pr-3 text-right font-semibold">完成</th>
                    <th className="pb-2 pr-3 text-right font-semibold">退课</th>
                    <th className="pb-2 pr-3 text-right font-semibold">候补</th>
                    <th className="pb-2 pr-4 text-right font-semibold text-indigo-600">合计</th>
                  </tr>
                </thead>
                <tbody>
                  {data.terms.map((t) => (
                    <tr key={t.termId} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 pl-4 pr-3 font-medium text-slate-800">{t.termName}</td>
                      <td className="py-2 pr-3 text-right text-indigo-600">{t.enrolled}</td>
                      <td className="py-2 pr-3 text-right text-emerald-600">{t.completed}</td>
                      <td className="py-2 pr-3 text-right text-amber-600">{t.dropped}</td>
                      <td className="py-2 pr-3 text-right text-slate-400">{t.waitlisted}</td>
                      <td className="py-2 pr-4 text-right font-bold text-slate-700">{t.total}</td>
                    </tr>
                  ))}
                  {data.forecast && (
                    <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                      <td className="py-2 pl-4 pr-3 font-bold text-indigo-800">下期预测</td>
                      <td colSpan={4} className="py-2 pr-3 text-right text-indigo-600 text-xs italic">基于线性回归</td>
                      <td className="py-2 pr-4 text-right font-bold text-indigo-700">{data.forecast.value}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
