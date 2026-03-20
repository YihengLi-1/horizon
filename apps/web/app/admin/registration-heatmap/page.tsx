"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type HeatmapData = {
  grid: number[][];
  dayLabels: string[];
  maxCount: number;
  totalRegistrations: number;
  topSlots: { day: string; hour: number; count: number }[];
};

type Term = { id: string; name: string };

const DAY_LABELS_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const DAY_EN_TO_IDX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function dayZh(day: string) { return DAY_LABELS_ZH[DAY_EN_TO_IDX[day] ?? -1] ?? day; }
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function heatColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "bg-slate-100";
  const ratio = value / max;
  if (ratio >= 0.8) return "bg-[hsl(221_83%_30%)]";
  if (ratio >= 0.6) return "bg-[hsl(221_83%_43%)]";
  if (ratio >= 0.4) return "bg-[hsl(221_70%_58%)]";
  if (ratio >= 0.2) return "bg-[hsl(221_65%_73%)]";
  return "bg-[hsl(221_60%_88%)]";
}

export default function RegistrationHeatmapPage() {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tooltip, setTooltip] = useState<{ day: string; hour: number; count: number } | null>(null);

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "学期列表加载失败"));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    void apiFetch<HeatmapData>(`/admin/registration-heatmap?${params}`)
      .then((d) => setData(d ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId]);

  const grid = data?.grid ?? [];
  const maxCount = data?.maxCount ?? 0;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">注册分析</p>
        <h1 className="campus-title">注册活动热图</h1>
        <p className="campus-subtitle">按星期与小时展示选课注册集中时段，帮助优化系统资源调度</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">总注册记录</p>
          <p className="campus-kpi-value">{loading ? "—" : data?.totalRegistrations ?? 0}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">峰值时段注册数</p>
          <p className="campus-kpi-value text-[hsl(221_83%_43%)]">{loading ? "—" : maxCount}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">最热星期</p>
          <p className="campus-kpi-value">
            {loading || !data?.topSlots.length ? "—" : dayZh(data.topSlots[0]?.day ?? "")}
          </p>
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
      ) : null}

      {loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : (
        <>
          <section className="campus-card overflow-hidden p-4">
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                {/* Hour headers */}
                <div className="flex gap-0.5 pl-10 mb-0.5">
                  {HOURS.map((h) => (
                    <div key={h} className="w-7 flex-shrink-0 text-center text-[9px] text-slate-400">
                      {h % 3 === 0 ? `${String(h).padStart(2, "0")}` : ""}
                    </div>
                  ))}
                </div>
                {/* Rows */}
                {DAY_LABELS_ZH.map((dayZh, dow) => (
                  <div key={dow} className="flex items-center gap-0.5 mb-0.5">
                    <div className="w-9 shrink-0 text-right text-xs text-slate-500 pr-1">{dayZh}</div>
                    {HOURS.map((h) => {
                      const count = grid[dow]?.[h] ?? 0;
                      return (
                        <div
                          key={h}
                          className={`w-7 h-6 flex-shrink-0 rounded-sm cursor-pointer transition-opacity hover:opacity-80 ${heatColor(count, maxCount)}`}
                          onMouseEnter={() => setTooltip({ day: dayZh, hour: h, count })}
                          onMouseLeave={() => setTooltip(null)}
                          title={`${dayZh} ${String(h).padStart(2, "0")}:00 — ${count} 次注册`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-2 mt-4 pl-10">
              <span className="text-xs text-slate-400">少</span>
              {["bg-slate-100", "bg-[hsl(221_60%_88%)]", "bg-[hsl(221_65%_73%)]", "bg-[hsl(221_70%_58%)]", "bg-[hsl(221_83%_43%)]", "bg-[hsl(221_83%_30%)]"].map((cls, i) => (
                <div key={i} className={`w-5 h-5 rounded-sm ${cls}`} />
              ))}
              <span className="text-xs text-slate-400">多</span>
            </div>
            {tooltip ? (
              <p className="mt-2 pl-10 text-xs text-slate-600">
                {tooltip.day} {String(tooltip.hour).padStart(2, "0")}:00–{String(tooltip.hour + 1).padStart(2, "0")}:00：<span className="font-bold text-slate-900">{tooltip.count}</span> 次注册
              </p>
            ) : null}
          </section>

          {data?.topSlots.length ? (
            <section className="campus-card p-5">
              <p className="font-semibold text-slate-800 mb-3">注册高峰时段 Top 5</p>
              <div className="space-y-2">
                {data.topSlots.map((slot, i) => {
                  const slotDayZh = dayZh(slot.day);
                  return (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className="w-5 font-bold text-slate-500">#{i + 1}</span>
                      <span className="w-20 text-slate-700">{slotDayZh} {String(slot.hour).padStart(2, "0")}:00</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-[hsl(221_83%_43%)]"
                          style={{ width: `${(slot.count / (data.topSlots[0]?.count || 1)) * 100}%` }}
                        />
                      </div>
                      <span className="font-bold text-slate-800 w-12 text-right">{slot.count}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
