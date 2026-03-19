"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type TermRow = {
  termId: string;
  termName: string;
  termStartDate: string;
  credits: number;
  courseCount: number;
  gpa: number;
  passRate: number;
};

function gpaColor(gpa: number): string {
  if (gpa >= 3.5) return "text-emerald-600";
  if (gpa >= 3.0) return "text-blue-600";
  if (gpa >= 2.5) return "text-amber-600";
  return "text-red-600";
}

function gpaBarColor(gpa: number): string {
  if (gpa >= 3.5) return "bg-emerald-500";
  if (gpa >= 3.0) return "bg-blue-500";
  if (gpa >= 2.5) return "bg-amber-500";
  return "bg-red-500";
}

export default function TermComparePage() {
  const [rows, setRows] = useState<TermRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<TermRow[]>("/students/term-compare")
      .then((d) => setRows(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const maxCredits = rows.length ? Math.max(...rows.map((r) => r.credits)) : 1;
  const avgGpa = rows.length
    ? rows.reduce((s, r) => s + r.gpa, 0) / rows.length
    : null;
  const bestTerm = rows.length
    ? rows.reduce((best, r) => (r.gpa > best.gpa ? r : best), rows[0])
    : null;
  const totalCredits = rows.reduce((s, r) => s + r.credits, 0);

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业分析</p>
        <h1 className="campus-title">学期成绩对比</h1>
        <p className="campus-subtitle">按学期纵向对比 GPA、学分与通过率，追踪学业趋势</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">学期数</p>
          <p className="campus-kpi-value">{loading ? "—" : rows.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">累计学分</p>
          <p className="campus-kpi-value">{loading ? "—" : totalCredits}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">各期平均GPA</p>
          <p className={`campus-kpi-value ${avgGpa !== null ? gpaColor(avgGpa) : ""}`}>
            {loading ? "—" : avgGpa !== null ? avgGpa.toFixed(2) : "—"}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">最佳学期</p>
          <p className="campus-kpi-value text-sm">{loading ? "—" : bestTerm?.termName ?? "—"}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : rows.length === 0 ? (
        <div className="campus-card p-10 text-center text-slate-400">暂无学期数据</div>
      ) : (
        <>
          {/* GPA trend bars */}
          <section className="campus-card p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">GPA 趋势图</h2>
            <div className="flex items-end gap-2 h-32">
              {rows.map((row) => {
                const pct = (row.gpa / 4.0) * 100;
                return (
                  <div key={row.termId} className="flex-1 flex flex-col items-center gap-1 group">
                    <span className={`text-[10px] font-bold ${gpaColor(row.gpa)} opacity-0 group-hover:opacity-100 transition`}>
                      {row.gpa.toFixed(2)}
                    </span>
                    <div className="w-full rounded-t-sm bg-slate-100 flex items-end h-20">
                      <div
                        className={`w-full rounded-t-sm transition-all ${gpaBarColor(row.gpa)}`}
                        style={{ height: `${pct}%` }}
                        title={`${row.termName}: GPA ${row.gpa.toFixed(2)}`}
                      />
                    </div>
                    <span className="text-[9px] text-slate-500 text-center leading-tight">
                      {row.termName.replace(/年|春季|秋季|夏季/g, (m) => m[0] === "年" ? "\n" : m)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-end gap-4 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-500" /> ≥ 3.5</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-blue-500" /> ≥ 3.0</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-amber-500" /> ≥ 2.5</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-red-500" /> &lt; 2.5</span>
            </div>
          </section>

          {/* Data table */}
          <section className="campus-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold text-slate-500 border-b border-slate-200">
                    <th className="px-4 py-3 text-left">学期</th>
                    <th className="px-4 py-3 text-right">课程数</th>
                    <th className="px-4 py-3 text-right">学分</th>
                    <th className="px-4 py-3 text-right">GPA</th>
                    <th className="px-4 py-3 text-right">通过率</th>
                    <th className="px-4 py-3 text-right">学分占比</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const creditPct = Math.round((row.credits / maxCredits) * 100);
                    return (
                      <tr key={row.termId} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">{row.termName}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">{row.courseCount}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">{row.credits}</td>
                        <td className={`px-4 py-3 text-right font-bold ${gpaColor(row.gpa)}`}>
                          {row.gpa > 0 ? row.gpa.toFixed(2) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {row.passRate > 0 ? `${row.passRate.toFixed(0)}%` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-slate-100">
                              <div
                                className="h-1.5 rounded-full bg-indigo-400"
                                style={{ width: `${creditPct}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500 w-8 text-right">{row.credits}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
