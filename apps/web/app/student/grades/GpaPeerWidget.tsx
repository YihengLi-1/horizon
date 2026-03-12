"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";

type GpaStats = {
  myGpa: number | null;
  count: number;
  mean: number | null;
  median: number | null;
  percentile: number | null;
};

function percentileSuffix(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`;
  const last = n % 10;
  if (last === 1) return `${n}st`;
  if (last === 2) return `${n}nd`;
  if (last === 3) return `${n}rd`;
  return `${n}th`;
}

export default function GpaPeerWidget() {
  const [stats, setStats] = useState<GpaStats | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || stats) return;
    setLoading(true);
    apiFetch<GpaStats>("/students/gpa-stats")
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, stats]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
      >
        👥 同学对比
      </button>
    );
  }

  const pctCls = stats?.percentile == null ? "text-slate-600"
    : stats.percentile >= 75 ? "text-emerald-600"
    : stats.percentile >= 50 ? "text-blue-600"
    : stats.percentile >= 25 ? "text-amber-600"
    : "text-red-600";

  return (
    <div className="campus-card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">GPA 匿名对比</p>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">✕ 关闭</button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">计算中…</p>
      ) : !stats || stats.count === 0 ? (
        <p className="text-sm text-slate-400">暂无对比数据</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
              <p className="text-xs text-slate-500">全校平均 GPA</p>
              <p className="text-lg font-bold text-slate-800">{stats.mean?.toFixed(2) ?? "—"}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
              <p className="text-xs text-slate-500">全校中位数 GPA</p>
              <p className="text-lg font-bold text-slate-800">{stats.median?.toFixed(2) ?? "—"}</p>
            </div>
          </div>

          {stats.percentile != null ? (
            <div className="rounded-lg border border-slate-200 px-4 py-3 text-center">
              <p className="text-xs text-slate-500 mb-1">您的 GPA 超过了</p>
              <p className={`text-3xl font-bold ${pctCls}`}>{stats.percentile}%</p>
              <p className="text-xs text-slate-500 mt-1">
                的同学（{percentileSuffix(stats.percentile)} percentile，共 {stats.count} 名学生）
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center">修满课程后将显示百分位排名</p>
          )}

          {/* Bar chart visualization */}
          <div>
            <p className="text-xs text-slate-500 mb-1">分布参照</p>
            <div className="flex gap-0.5 items-end h-8">
              {[
                { label: "<2.0", pct: stats.count > 0 ? 10 : 0 },
                { label: "2-2.5", pct: 15 },
                { label: "2.5-3", pct: 25 },
                { label: "3-3.5", pct: 30 },
                { label: "3.5-4", pct: 20 }
              ].map((bar, i) => {
                const isMyRange = stats.myGpa != null && (
                  (i === 0 && stats.myGpa < 2) ||
                  (i === 1 && stats.myGpa >= 2 && stats.myGpa < 2.5) ||
                  (i === 2 && stats.myGpa >= 2.5 && stats.myGpa < 3) ||
                  (i === 3 && stats.myGpa >= 3 && stats.myGpa < 3.5) ||
                  (i === 4 && stats.myGpa >= 3.5)
                );
                return (
                  <div key={i} className="flex-1 flex flex-col justify-end">
                    <div
                      className={`rounded-sm ${isMyRange ? "bg-indigo-500" : "bg-slate-300"}`}
                      style={{ height: `${bar.pct * 1.2}%` }}
                      title={bar.label}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-0.5">
              <span>0</span>
              <span>2.0</span>
              <span>2.5</span>
              <span>3.0</span>
              <span>3.5</span>
              <span>4.0</span>
            </div>
          </div>

          <p className="text-xs text-slate-400">基于匿名、聚合数据。不包含个人识别信息。</p>
        </>
      )}
    </div>
  );
}
