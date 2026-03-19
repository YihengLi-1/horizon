"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type CheckItem = {
  id: string;
  label: string;
  required: number;
  actual: number;
  passed: boolean;
  detail: string;
};

type ChecklistData = {
  checks: CheckItem[];
  allPassed: boolean;
  summary: {
    totalCredits: number;
    cumulativeGpa: number;
    dCredits: number;
    holdsCount: number;
  };
};

export default function GraduationChecklistPage() {
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<ChecklistData>("/students/graduation-checklist")
      .then((d) => setData(d ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const passedCount = data?.checks.filter((c) => c.passed).length ?? 0;
  const totalCount = data?.checks.length ?? 0;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">毕业申请</p>
        <h1 className="campus-title">毕业条件核查</h1>
        <p className="campus-subtitle">检查您是否满足毕业所需的全部条件</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">已修学分</p>
          <p className="campus-kpi-value">{loading ? "—" : data?.summary.totalCredits}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">累计 GPA</p>
          <p className={`campus-kpi-value ${data && data.summary.cumulativeGpa >= 2.0 ? "text-emerald-600" : "text-red-600"}`}>
            {loading ? "—" : data?.summary.cumulativeGpa.toFixed(2)}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">D 等级学分</p>
          <p className={`campus-kpi-value ${data && data.summary.dCredits <= 12 ? "text-slate-700" : "text-red-600"}`}>
            {loading ? "—" : data?.summary.dCredits}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">通过条件</p>
          <p className={`campus-kpi-value ${data?.allPassed ? "text-emerald-600" : "text-amber-600"}`}>
            {loading ? "—" : `${passedCount} / ${totalCount}`}
          </p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {!loading && data ? (
        <>
          {/* Overall status banner */}
          <div className={`rounded-xl border px-5 py-4 flex items-center gap-4 ${
            data.allPassed
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-200 bg-amber-50"
          }`}>
            <span className="text-3xl">{data.allPassed ? "🎓" : "⏳"}</span>
            <div>
              <p className={`font-bold text-lg ${data.allPassed ? "text-emerald-700" : "text-amber-700"}`}>
                {data.allPassed ? "恭喜！您已满足所有毕业条件" : "尚未满足全部毕业条件"}
              </p>
              <p className="text-sm text-slate-600 mt-0.5">
                {data.allPassed
                  ? "请联系注册办公室提交毕业申请"
                  : `还有 ${totalCount - passedCount} 个条件需要满足`}
              </p>
            </div>
          </div>

          {/* Checklist */}
          <section className="campus-card overflow-hidden">
            <div className="divide-y divide-slate-100">
              {data.checks.map((check) => {
                const pct = Math.min(100, (check.actual / Math.max(1, check.required)) * 100);
                return (
                  <div key={check.id} className="px-5 py-4 flex items-center gap-4">
                    <div className={`shrink-0 size-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      check.passed
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-600"
                    }`}>
                      {check.passed ? "✓" : "✗"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm">{check.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{check.detail}</p>
                      {/* Progress bar for numeric checks */}
                      {["credits", "d_credits"].includes(check.id) ? (
                        <div className="mt-2 h-1.5 w-full max-w-xs rounded-full bg-slate-100">
                          <div
                            className={`h-1.5 rounded-full transition-all ${
                              check.passed ? "bg-emerald-400" : "bg-amber-400"
                            }`}
                            style={{ width: `${check.id === "d_credits" ? Math.min(100, (check.actual / check.required) * 100) : pct}%` }}
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-bold font-mono ${check.passed ? "text-emerald-600" : "text-red-500"}`}>
                        {typeof check.actual === "number" && typeof check.required === "number"
                          ? `${check.actual} / ${check.required}`
                          : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">检查中…</div>
      ) : null}
    </div>
  );
}
