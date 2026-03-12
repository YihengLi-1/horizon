"use client";

/**
 * Admin Registration Activity Heatmap
 * Shows when (day-of-week × hour) students register for courses.
 * Also shows credit-load distribution among currently enrolled students.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };

type HeatmapData = {
  grid: number[][];
  dayLabels: string[];
  maxCount: number;
  totalRegistrations: number;
  topSlots: { day: string; hour: number; count: number }[];
};

type CreditLoad = {
  totalStudents: number;
  mean: number;
  distribution: { label: string; count: number; tag: string }[];
};

const DAY_LABELS_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function cellColor(value: number, max: number) {
  if (max === 0 || value === 0) return "bg-slate-100 text-transparent";
  const ratio = value / max;
  if (ratio >= 0.8) return "bg-indigo-700 text-white";
  if (ratio >= 0.6) return "bg-indigo-500 text-white";
  if (ratio >= 0.4) return "bg-indigo-300 text-indigo-900";
  if (ratio >= 0.2) return "bg-indigo-200 text-indigo-800";
  return "bg-indigo-100 text-indigo-700";
}

const LOAD_COLORS: Record<string, string> = {
  underload: "bg-red-400",
  light: "bg-amber-400",
  normal: "bg-emerald-500",
  heavy: "bg-indigo-500",
  overload: "bg-purple-600"
};

export default function RegistrationHeatmapPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [creditLoad, setCreditLoad] = useState<CreditLoad | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms").then((d) => setTerms(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setHeatmap(null);
    setCreditLoad(null);
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    Promise.all([
      apiFetch<HeatmapData>(`/admin/registration-heatmap?${params}`).catch(() => null),
      apiFetch<CreditLoad>(`/admin/credit-load?${params}`).catch(() => null)
    ]).then(([h, c]) => {
      setHeatmap(h);
      setCreditLoad(c);
      setLoading(false);
    });
  }, [termId]);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Registration Analytics</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">注册活动热力图</h1>
        <p className="mt-1 text-sm text-slate-500">按星期和小时展示学生选课时段分布及学分负担分析</p>
      </section>

      {/* Term selector */}
      <div className="campus-card p-4 flex items-center gap-3">
        <label className="text-sm font-semibold text-slate-700 shrink-0">学期：</label>
        <select className="campus-select flex-1 max-w-xs" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">所有学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {heatmap && (
          <span className="text-xs text-slate-500 ml-2 shrink-0">
            共 {heatmap.totalRegistrations.toLocaleString()} 条记录
          </span>
        )}
      </div>

      {loading && (
        <div className="campus-card px-6 py-12 text-center text-sm text-slate-500">⏳ 加载中…</div>
      )}

      {heatmap && (
        <div className="campus-card p-4 space-y-4 overflow-x-auto">
          <h2 className="text-sm font-bold text-slate-900">选课时段热力图（星期 × 小时）</h2>
          <div className="min-w-[700px]">
            {/* Hour labels */}
            <div className="flex ml-12">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex-1 text-center text-[9px] text-slate-400 font-mono">
                  {h === 0 ? "0" : h % 3 === 0 ? `${h}` : ""}
                </div>
              ))}
            </div>
            {/* Rows per day */}
            {heatmap.grid.map((row, dow) => (
              <div key={dow} className="flex items-center gap-0.5 mt-0.5">
                <div className="w-12 shrink-0 text-xs text-slate-500 text-right pr-1.5">{DAY_LABELS_ZH[dow]}</div>
                {row.map((val, hour) => (
                  <div
                    key={hour}
                    title={`${DAY_LABELS_ZH[dow]} ${hour}:00 — ${val} 次`}
                    className={`flex-1 h-6 rounded-sm text-[8px] flex items-center justify-center cursor-default transition ${cellColor(val, heatmap.maxCount)}`}
                  >
                    {val > 0 ? val : ""}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>少</span>
            {["bg-indigo-100", "bg-indigo-200", "bg-indigo-300", "bg-indigo-500", "bg-indigo-700"].map((c, i) => (
              <div key={i} className={`w-5 h-3 rounded ${c}`} />
            ))}
            <span>多</span>
          </div>

          {/* Top slots */}
          {heatmap.topSlots.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-500 mb-2">最活跃时段 TOP 5</h3>
              <div className="flex flex-wrap gap-2">
                {heatmap.topSlots.map((s, i) => (
                  <span key={i} className="campus-chip border-indigo-200 bg-indigo-50 text-indigo-800 font-mono text-xs">
                    {s.day} {String(s.hour).padStart(2, "0")}:00 — {s.count} 次
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {creditLoad && (
        <div className="campus-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">学分负担分布（当前已选课学生）</h2>
            <span className="text-xs text-slate-500">均值 {creditLoad.mean} 学分 · {creditLoad.totalStudents} 名学生</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {creditLoad.distribution.map((d) => {
              const pct = creditLoad.totalStudents > 0
                ? Math.round((d.count / creditLoad.totalStudents) * 100) : 0;
              return (
                <div key={d.label} className="text-center space-y-1">
                  <div className={`w-full rounded-t-md ${LOAD_COLORS[d.tag] ?? "bg-slate-400"}`}
                    style={{ height: `${Math.max(4, pct * 2)}px` }} />
                  <p className="text-xs font-bold text-slate-700">{d.count}</p>
                  <p className="text-[10px] text-slate-500">{d.label} 学分</p>
                  <p className="text-[10px] text-slate-400">{pct}%</p>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 text-xs text-slate-500 flex-wrap">
            <span><span className="inline-block w-3 h-3 rounded-sm bg-red-400 mr-1" />欠载 (&lt;9)</span>
            <span><span className="inline-block w-3 h-3 rounded-sm bg-amber-400 mr-1" />轻载 (9-11)</span>
            <span><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500 mr-1" />正常 (12-15)</span>
            <span><span className="inline-block w-3 h-3 rounded-sm bg-indigo-500 mr-1" />重载 (16-18)</span>
            <span><span className="inline-block w-3 h-3 rounded-sm bg-purple-600 mr-1" />超载 (&gt;18)</span>
          </div>
        </div>
      )}
    </div>
  );
}
