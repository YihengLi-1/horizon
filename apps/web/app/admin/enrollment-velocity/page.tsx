"use client";

/**
 * Admin Enrollment Velocity
 * Day-by-day enrollment and drop counts within a term.
 * Shows peak registration day, cumulative trend, and net velocity.
 */

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };

type VelocityPoint = {
  date: string;
  newEnrollments: number;
  newDrops: number;
  cumulative: number;
  net: number;
};

type VelocityData = {
  points: VelocityPoint[];
  summary: { totalNew: number; totalDrops: number; peakDay: string; peakCount: number };
};

export default function EnrollmentVelocityPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [data, setData] = useState<VelocityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"daily" | "cumulative">("daily");

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms")
      .then((d) => {
        const sorted = (d ?? []).sort((a, b) => b.name.localeCompare(a.name));
        setTerms(sorted);
        if (sorted[0]) setTermId(sorted[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setData(null);
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    void apiFetch<VelocityData>(`/admin/enrollment-velocity?${params}`)
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [termId]);

  const chartMeta = useMemo(() => {
    if (!data?.points.length) return null;
    const pts = data.points;
    const maxDaily = Math.max(1, ...pts.map((p) => Math.max(p.newEnrollments, p.newDrops)));
    const maxCum = Math.max(1, ...pts.map((p) => p.cumulative));
    return { pts, maxDaily, maxCum };
  }, [data]);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Enrollment Dynamics</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">注册速度分析</h1>
        <p className="mt-1 text-sm text-slate-500">逐日注册与退课数量、峰值日期及累计趋势</p>
      </section>

      <div className="campus-toolbar flex-wrap gap-2">
        <select className="campus-select" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">所有学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {(["daily", "cumulative"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-semibold transition ${view === v ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {v === "daily" ? "每日" : "累计"}
            </button>
          ))}
        </div>
      </div>

      {data?.summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="campus-kpi">
            <p className="campus-kpi-label">总注册次数</p>
            <p className="campus-kpi-value text-emerald-600">{data.summary.totalNew}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">总退课次数</p>
            <p className="campus-kpi-value text-red-600">{data.summary.totalDrops}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">峰值日期</p>
            <p className="campus-kpi-value text-sm text-indigo-600">{data.summary.peakDay || "—"}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">峰值注册数</p>
            <p className="campus-kpi-value text-amber-600">{data.summary.peakCount}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : !chartMeta ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">暂无数据</div>
      ) : (
        <>
          {/* SVG chart */}
          <div className="campus-card p-4">
            <h2 className="text-sm font-bold text-slate-900 mb-4">
              {view === "daily" ? "每日注册 / 退课" : "累计注册量趋势"}
            </h2>
            <svg viewBox="0 0 700 220" className="w-full">
              <line x1="50" y1="190" x2="680" y2="190" stroke="#e2e8f0" strokeWidth="1.5" />
              <line x1="50" y1="10" x2="50" y2="190" stroke="#e2e8f0" strokeWidth="1.5" />

              {view === "daily" ? (
                <>
                  {/* Enrollment bars */}
                  {chartMeta.pts.map((p, i) => {
                    const n = chartMeta.pts.length;
                    const barW = Math.max(2, (630 / n) * 0.4);
                    const cx = 50 + (i / Math.max(n - 1, 1)) * 630;
                    const hE = (p.newEnrollments / chartMeta.maxDaily) * 170;
                    const hD = (p.newDrops / chartMeta.maxDaily) * 170;
                    return (
                      <g key={p.date}>
                        <rect x={cx - barW - 1} y={190 - hE} width={barW} height={hE} fill="#4f46e5" rx="1" />
                        <rect x={cx + 1} y={190 - hD} width={barW} height={hD} fill="#f87171" rx="1" />
                        {i % Math.ceil(n / 8) === 0 && (
                          <text x={cx} y="207" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
                            {p.date.slice(5)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <text x="40" y="13" textAnchor="end" fontSize="8" fill="#94a3b8">{chartMeta.maxDaily}</text>
                </>
              ) : (
                <>
                  <polyline
                    fill="none" stroke="#4f46e5" strokeWidth="2.5"
                    points={chartMeta.pts.map((p, i) => {
                      const n = chartMeta.pts.length;
                      const x = 50 + (i / Math.max(n - 1, 1)) * 630;
                      const y = 190 - (p.cumulative / chartMeta.maxCum) * 170;
                      return `${x},${y}`;
                    }).join(" ")}
                  />
                  {chartMeta.pts.filter((_, i) => i % Math.ceil(chartMeta.pts.length / 8) === 0).map((p, i) => {
                    const origIdx = chartMeta.pts.indexOf(p);
                    const x = 50 + (origIdx / Math.max(chartMeta.pts.length - 1, 1)) * 630;
                    const y = 190 - (p.cumulative / chartMeta.maxCum) * 170;
                    return (
                      <g key={p.date}>
                        <circle cx={x} cy={y} r="3" fill="#4f46e5" />
                        <text x={x} y="207" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
                          {p.date.slice(5)}
                        </text>
                      </g>
                    );
                  })}
                  <text x="40" y="13" textAnchor="end" fontSize="8" fill="#94a3b8">{chartMeta.maxCum}</text>
                </>
              )}
            </svg>
            {view === "daily" && (
              <div className="flex gap-4 mt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-indigo-600 inline-block" />注册</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" />退课</span>
              </div>
            )}
          </div>

          {/* Data table */}
          <div className="campus-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 pl-4 text-left font-semibold">日期</th>
                    <th className="pb-2 pr-3 text-right font-semibold">注册</th>
                    <th className="pb-2 pr-3 text-right font-semibold">退课</th>
                    <th className="pb-2 pr-3 text-right font-semibold">净变化</th>
                    <th className="pb-2 pr-4 text-right font-semibold">累计</th>
                  </tr>
                </thead>
                <tbody>
                  {chartMeta.pts.map((p) => (
                    <tr key={p.date} className={`border-b border-slate-50 hover:bg-slate-50 ${p.date === data?.summary.peakDay ? "bg-amber-50" : ""}`}>
                      <td className="py-2 pl-4 pr-3 font-mono text-slate-700">
                        {p.date} {p.date === data?.summary.peakDay && <span className="text-amber-600 ml-1">⭐ 峰值</span>}
                      </td>
                      <td className="py-2 pr-3 text-right text-indigo-600">{p.newEnrollments}</td>
                      <td className="py-2 pr-3 text-right text-red-500">{p.newDrops}</td>
                      <td className="py-2 pr-3 text-right">
                        <span className={p.net >= 0 ? "text-emerald-600" : "text-red-600"}>
                          {p.net >= 0 ? "+" : ""}{p.net}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right font-bold text-slate-700">{p.cumulative}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
