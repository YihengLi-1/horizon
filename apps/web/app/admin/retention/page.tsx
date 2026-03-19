"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type RetentionPoint = {
  offset: number;
  activeTermId: string;
  activeTermName: string;
  activeStudents: number;
  retentionPct: number;
};

type CohortRow = {
  cohortTermId: string;
  cohortTermName: string;
  cohortSize: number;
  retention: RetentionPoint[];
};

type RetentionData = {
  cohorts: CohortRow[];
  offsets: number[];
};

function pctColor(pct: number): string {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 60) return "bg-blue-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function pctText(pct: number): string {
  if (pct >= 80) return "text-emerald-700";
  if (pct >= 60) return "text-blue-700";
  if (pct >= 40) return "text-amber-700";
  return "text-red-700";
}

export default function RetentionPage() {
  const [data, setData] = useState<RetentionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<RetentionData>("/admin/retention")
      .then((d) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const cohorts = data?.cohorts ?? [];
  const offsets = data?.offsets ?? [];

  // KPIs
  const avgInitialRetention = cohorts.length
    ? Math.round(cohorts.reduce((sum, c) => {
        const t1 = c.retention.find((r) => r.offset === 1);
        return sum + (t1?.retentionPct ?? 100);
      }, 0) / cohorts.length)
    : null;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学生留存</p>
        <h1 className="campus-hero-title">学期留存率分析</h1>
        <p className="campus-hero-subtitle">按入学学期追踪各届学生的跨期留存情况</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">入学届次</p>
          <p className="campus-kpi-value">{cohorts.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">首期留存率均值</p>
          <p className="campus-kpi-value">{avgInitialRetention !== null ? `${avgInitialRetention}%` : "—"}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">最大追踪跨度</p>
          <p className="campus-kpi-value">{offsets.length > 0 ? `${Math.max(...offsets)} 期` : "—"}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : cohorts.length === 0 ? (
        <div className="campus-card p-10 text-center text-slate-400">暂无留存数据</div>
      ) : (
        <>
          {/* Heat table */}
          <section className="campus-card overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-800">留存率热力表</h2>
              <p className="mt-0.5 text-xs text-slate-500">每格为该届学生在对应学期偏移时的留存百分比（100% = 首期基准）</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold text-slate-500">
                    <th className="px-4 py-3 text-left">入学学期</th>
                    <th className="px-4 py-3 text-right">人数</th>
                    {offsets.map((o) => (
                      <th key={o} className="px-3 py-3 text-center">+{o} 期</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((cohort) => (
                    <tr key={cohort.cohortTermId} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{cohort.cohortTermName}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">{cohort.cohortSize}</td>
                      {offsets.map((o) => {
                        const point = cohort.retention.find((r) => r.offset === o);
                        if (!point) {
                          return <td key={o} className="px-3 py-3 text-center text-slate-200">—</td>;
                        }
                        return (
                          <td key={o} className="px-3 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-xs font-bold ${pctText(point.retentionPct)}`}>
                                {point.retentionPct}%
                              </span>
                              <div className="h-1 w-10 rounded-full bg-slate-100">
                                <div
                                  className={`h-1 rounded-full ${pctColor(point.retentionPct)}`}
                                  style={{ width: `${point.retentionPct}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Color legend */}
          <section className="campus-card p-4">
            <p className="text-xs font-semibold text-slate-500 mb-2">图例</p>
            <div className="flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="size-3 rounded-full bg-emerald-500" />
                <span className="text-emerald-700">≥ 80% 高留存</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-3 rounded-full bg-blue-500" />
                <span className="text-blue-700">60–79% 良好</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-3 rounded-full bg-amber-500" />
                <span className="text-amber-700">40–59% 一般</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-3 rounded-full bg-red-500" />
                <span className="text-red-700">&lt; 40% 需关注</span>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
