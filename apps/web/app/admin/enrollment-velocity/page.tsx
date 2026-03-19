"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type VelocityPoint = {
  date: string;
  newEnrollments: number;
  newDrops: number;
  cumulative: number;
  net: number;
};

type VelocityData = {
  points: VelocityPoint[];
  summary: {
    totalNew: number;
    totalDrops: number;
    peakDay: string;
    peakCount: number;
  };
};

type Term = { id: string; name: string };

export default function EnrollmentVelocityPage() {
  const [data, setData] = useState<VelocityData | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    void apiFetch<VelocityData>(`/admin/enrollment-velocity?${params}`)
      .then((d) => setData(d ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId]);

  const points = data?.points ?? [];
  const maxCumulative = Math.max(1, ...points.map((p) => p.cumulative));
  const maxDaily = Math.max(1, ...points.map((p) => p.newEnrollments));

  const svgW = 560;
  const svgH = 120;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">注册分析</p>
        <h1 className="campus-hero-title">注册速率趋势</h1>
        <p className="campus-hero-subtitle">按日期展示注册量、退课量与累计净注册数变化</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">总注册次数</p>
          <p className="campus-kpi-value text-emerald-600">{loading ? "—" : data?.summary.totalNew ?? 0}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">总退课次数</p>
          <p className="campus-kpi-value text-red-600">{loading ? "—" : data?.summary.totalDrops ?? 0}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">净注册数</p>
          <p className="campus-kpi-value">{loading ? "—" : (data?.summary.totalNew ?? 0) - (data?.summary.totalDrops ?? 0)}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">注册峰值日</p>
          <p className="campus-kpi-value text-sm text-slate-700">{loading ? "—" : data?.summary.peakDay ? `${data.summary.peakDay} (${data.summary.peakCount})` : "—"}</p>
        </div>
      </section>

      <div className="campus-toolbar">
        <select className="campus-select w-40" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">全部学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : points.length === 0 ? (
        <div className="campus-card p-10 text-center text-slate-400">暂无注册数据</div>
      ) : (
        <>
          {/* Cumulative line chart */}
          <section className="campus-card p-5">
            <p className="font-semibold text-slate-800 mb-4">累计净注册数</p>
            <svg viewBox={`0 0 ${svgW} ${svgH + 24}`} className="w-full max-h-48">
              <polyline
                points={points.map((p, i) => {
                  const x = (i / Math.max(1, points.length - 1)) * (svgW - 20) + 10;
                  const y = svgH - (p.cumulative / maxCumulative) * (svgH - 10) + 5;
                  return `${x},${y}`;
                }).join(" ")}
                fill="none"
                stroke="hsl(221 83% 43%)"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              {/* Fill area */}
              <polygon
                points={[
                  ...points.map((p, i) => {
                    const x = (i / Math.max(1, points.length - 1)) * (svgW - 20) + 10;
                    const y = svgH - (p.cumulative / maxCumulative) * (svgH - 10) + 5;
                    return `${x},${y}`;
                  }),
                  `${(svgW - 10)},${svgH + 5}`,
                  `10,${svgH + 5}`,
                ].join(" ")}
                fill="hsl(221 83% 43% / 0.08)"
              />
              {/* Date labels every ~10 points */}
              {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 8)) === 0).map((p, i, arr) => {
                const origIdx = points.indexOf(p);
                const x = (origIdx / Math.max(1, points.length - 1)) * (svgW - 20) + 10;
                return (
                  <text key={i} x={x} y={svgH + 18} textAnchor="middle" style={{ fontSize: 8, fill: "#94a3b8" }}>
                    {p.date.slice(5)}
                  </text>
                );
              })}
            </svg>
          </section>

          {/* Daily bar chart */}
          <section className="campus-card p-5">
            <p className="font-semibold text-slate-800 mb-4">每日注册量 vs 退课量</p>
            <svg viewBox={`0 0 ${svgW} ${svgH + 24}`} className="w-full max-h-40">
              {points.map((p, i) => {
                const barW = Math.max(1, (svgW - 20) / points.length - 1);
                const x = (i / points.length) * (svgW - 20) + 10;
                const enrH = (p.newEnrollments / maxDaily) * (svgH - 10);
                const dropH = (p.newDrops / maxDaily) * (svgH - 10);
                return (
                  <g key={i}>
                    <rect x={x} y={svgH - enrH + 5} width={barW * 0.6} height={enrH} fill="hsl(160 60% 50%)" opacity={0.8} rx={1} />
                    <rect x={x + barW * 0.6} y={svgH - dropH + 5} width={barW * 0.4} height={dropH} fill="hsl(0 60% 60%)" opacity={0.6} rx={1} />
                  </g>
                );
              })}
            </svg>
            <div className="flex gap-4 mt-2 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-emerald-500" /> 新增注册</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-400" /> 退课</span>
            </div>
          </section>

          {/* Data table (last 10 days) */}
          <section className="campus-card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <p className="font-semibold text-slate-800">最近 {Math.min(10, points.length)} 天明细</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-500">
                  <th className="px-5 py-2 text-left">日期</th>
                  <th className="px-5 py-2 text-right">新增注册</th>
                  <th className="px-5 py-2 text-right">退课</th>
                  <th className="px-5 py-2 text-right">净变化</th>
                  <th className="px-5 py-2 text-right">累计</th>
                </tr>
              </thead>
              <tbody>
                {[...points].reverse().slice(0, 10).map((p) => (
                  <tr key={p.date} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-5 py-2.5 font-mono text-slate-700">{p.date}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-emerald-600">{p.newEnrollments}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-red-500">{p.newDrops}</td>
                    <td className={`px-5 py-2.5 text-right font-mono font-bold ${p.net >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {p.net >= 0 ? `+${p.net}` : p.net}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono font-bold text-slate-800">{p.cumulative}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
