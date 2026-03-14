"use client";

/**
 * Student Graduation Checklist
 * Shows real-time checks for graduation requirements: credits, GPA, D-grade cap, holds.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Check = {
  id: string; label: string;
  required: number; actual: number;
  passed: boolean; detail: string;
};
type ChecklistData = {
  checks: Check[];
  allPassed: boolean;
  summary: { totalCredits: number; cumulativeGpa: number; dCredits: number; holdsCount: number };
};

export default function GraduationChecklistPage() {
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<ChecklistData>("/students/graduation-checklist")
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const passedCount = data?.checks.filter((c) => c.passed).length ?? 0;
  const totalCount = data?.checks.length ?? 0;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Graduation</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">毕业条件核查</h1>
        <p className="mt-1 text-sm text-slate-500">实时检查毕业所需条件完成情况</p>
      </section>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : data ? (
        <>
          {/* Overall status */}
          <div className={`campus-card p-6 border-2 ${data.allPassed ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
            <div className="flex items-center gap-4">
              <span className="text-4xl">{data.allPassed ? "🎓" : "⏳"}</span>
              <div>
                <h2 className={`text-xl font-bold ${data.allPassed ? "text-emerald-700" : "text-amber-700"}`}>
                  {data.allPassed ? "恭喜！所有毕业条件已满足" : "部分条件尚未满足"}
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  {passedCount} / {totalCount} 项条件通过
                </p>
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-4 h-3 w-full rounded-full bg-white/60 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${data.allPassed ? "bg-emerald-500" : "bg-amber-500"}`}
                style={{ width: `${(passedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>

          {/* Individual checks */}
          <div className="space-y-3">
            {data.checks.map((check) => (
              <div
                key={check.id}
                className={`campus-card p-4 flex items-start gap-4 border-l-4 ${check.passed ? "border-l-emerald-400" : "border-l-red-400"}`}
              >
                <div className="mt-0.5 text-xl shrink-0">
                  {check.passed ? "✅" : "❌"}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900 text-sm">{check.label}</p>
                  <p className={`text-xs mt-0.5 ${check.passed ? "text-emerald-700" : "text-red-600"}`}>
                    {check.detail}
                  </p>
                  {/* Progress indicator for numeric checks */}
                  {check.id !== "holds" && (
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${check.passed ? "bg-emerald-400" : "bg-red-400"}`}
                        style={{ width: `${Math.min(100, (check.actual / check.required) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {check.id !== "holds" && (
                    <>
                      <p className={`text-lg font-bold ${check.passed ? "text-emerald-600" : "text-red-600"}`}>
                        {check.id === "gpa" ? check.actual.toFixed(2) : check.actual}
                      </p>
                      <p className="text-xs text-slate-400">
                        {check.id === "gpa" ? `/ ${check.required.toFixed(1)}` :
                         check.id === "d_credits" ? `≤ ${check.required}` :
                         `/ ${check.required}`}
                      </p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">已修学分</p>
              <p className="campus-kpi-value text-indigo-600">{data.summary.totalCredits}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">累计 GPA</p>
              <p className={`campus-kpi-value ${data.summary.cumulativeGpa >= 2.0 ? "text-emerald-600" : "text-red-600"}`}>
                {data.summary.cumulativeGpa.toFixed(2)}
              </p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">D 等级学分</p>
              <p className={`campus-kpi-value ${data.summary.dCredits <= 12 ? "text-slate-700" : "text-red-600"}`}>
                {data.summary.dCredits}
              </p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">活跃限制</p>
              <p className={`campus-kpi-value ${data.summary.holdsCount === 0 ? "text-emerald-600" : "text-red-600"}`}>
                {data.summary.holdsCount}
              </p>
            </div>
          </div>

          {!data.allPassed && (
            <div className="campus-card border-amber-100 bg-amber-50/50 p-4">
              <h3 className="text-sm font-semibold text-amber-800 mb-2">下一步</h3>
              <ul className="space-y-1 text-xs text-amber-700">
                {data.checks.filter((c) => !c.passed).map((c) => (
                  <li key={c.id}>• {c.detail}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
