"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type RetentionCell = {
  offset: number;
  activeTermId: string;
  activeTermName: string;
  activeStudents: number;
  retentionPct: number;
};

type RetentionCohort = {
  cohortTermId: string;
  cohortTermName: string;
  cohortSize: number;
  retention: RetentionCell[];
};

type RetentionResponse = {
  offsets: number[];
  cohorts: RetentionCohort[];
};

function rateTone(retentionPct: number) {
  if (retentionPct >= 85) return "bg-emerald-50 text-emerald-700";
  if (retentionPct >= 65) return "bg-indigo-50 text-indigo-700";
  if (retentionPct >= 45) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

export default function AdminRetentionPage() {
  const [data, setData] = useState<RetentionResponse>({ offsets: [], cohorts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    void apiFetch<RetentionResponse>("/admin/retention")
      .then((result) => setData(result ?? { offsets: [], cohorts: [] }))
      .catch((err) => {
        setData({ offsets: [], cohorts: [] });
        setError(err instanceof Error ? err.message : "加载留存 cohort 失败");
      })
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    const allFollowUp = data.cohorts.flatMap((cohort) => cohort.retention.filter((cell) => cell.offset > 0));
    const avgFollowUp = allFollowUp.length > 0
      ? Math.round(allFollowUp.reduce((sum, cell) => sum + cell.retentionPct, 0) / allFollowUp.length)
      : 0;

    return {
      cohortCount: data.cohorts.length,
      maxOffset: data.offsets.at(-1) ?? 0,
      avgFollowUp
    };
  }, [data]);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Retention Analytics</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">学生留存 Cohort</h1>
        <p className="mt-1 text-sm text-slate-500">按首次活跃学期分 cohort，追踪后续每个学期偏移上的仍然活跃比例。</p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">Cohort 数量</p>
          <p className="campus-kpi-value">{summary.cohortCount}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">最长追踪偏移</p>
          <p className="campus-kpi-value text-indigo-600">T+{summary.maxOffset}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">后续平均留存</p>
          <p className="campus-kpi-value text-emerald-600">{summary.avgFollowUp}%</p>
        </div>
      </div>

      {error ? <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : data.cohorts.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">暂无 cohort 留存数据</div>
      ) : (
        <div className="campus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left">Cohort 学期</th>
                  <th className="px-4 py-3 text-right">学生数</th>
                  {data.offsets.map((offset) => (
                    <th key={offset} className="px-4 py-3 text-center">T+{offset}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.cohorts.map((cohort) => {
                  const rateMap = new Map(cohort.retention.map((cell) => [cell.offset, cell]));
                  return (
                    <tr key={cohort.cohortTermId} className="border-b border-slate-100">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-900">{cohort.cohortTermName}</div>
                      </td>
                      <td className="px-4 py-4 text-right text-slate-700">{cohort.cohortSize}</td>
                      {data.offsets.map((offset) => {
                        const cell = rateMap.get(offset);
                        return (
                          <td key={offset} className="px-4 py-4 text-center">
                            {cell ? (
                              <span
                                title={`${cell.activeTermName} · ${cell.activeStudents}/${cohort.cohortSize}`}
                                className={`inline-flex min-w-[64px] items-center justify-center rounded-lg px-2 py-1 text-xs font-semibold ${rateTone(cell.retentionPct)}`}
                              >
                                {cell.retentionPct}%
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
