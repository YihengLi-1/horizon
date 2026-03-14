"use client";

/**
 * Student What-If GPA Planner
 * Lets students hypothetically adjust grades on completed courses to see
 * how their GPA would change. Fully client-side — no API calls.
 * Uses the same data from /students/standing.
 */

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type TermHistory = { termName: string; credits: number; courses: number; termGpa: number | null };
type StandingData = { cumulativeGpa: number | null; totalCredits: number; standing: string; termHistory: TermHistory[] };

const GRADE_OPTIONS = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];
const GRADE_POINTS: Record<string, number> = {
  "A+": 4, "A": 4, "A-": 3.7, "B+": 3.3, "B": 3, "B-": 2.7,
  "C+": 2.3, "C": 2, "C-": 1.7, "D+": 1.3, "D": 1, "D-": 0.7, "F": 0
};

type ScenarioTerm = {
  termName: string;
  credits: number;
  courses: number;
  origGpa: number | null;
  whatIfGpa: number | null; // user override
};

export default function WhatIfPage() {
  const [standing, setStanding] = useState<StandingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scenario, setScenario] = useState<ScenarioTerm[]>([]);
  const [futureRows, setFutureRows] = useState<{ credits: number; grade: string }[]>([
    { credits: 3, grade: "A" },
    { credits: 3, grade: "B+" },
  ]);

  useEffect(() => {
    void apiFetch<StandingData>("/students/standing")
      .then((d) => {
        setStanding(d);
        setScenario(d.termHistory.map((t) => ({
          termName: t.termName, credits: t.credits, courses: t.courses, origGpa: t.termGpa, whatIfGpa: null
        })));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const whatIfGpa = useMemo(() => {
    // Existing terms (with possible overrides)
    let totalPoints = 0, totalCredits = 0;
    for (const t of scenario) {
      const gpa = t.whatIfGpa !== null ? t.whatIfGpa : t.origGpa;
      if (gpa !== null && t.credits > 0) {
        totalPoints += gpa * t.credits;
        totalCredits += t.credits;
      }
    }
    // Future hypothetical courses
    for (const row of futureRows) {
      const pts = GRADE_POINTS[row.grade];
      if (pts !== undefined && row.credits > 0) {
        totalPoints += pts * row.credits;
        totalCredits += row.credits;
      }
    }
    return totalCredits > 0 ? Math.round((totalPoints / totalCredits) * 100) / 100 : null;
  }, [scenario, futureRows]);

  const origGpa = standing?.cumulativeGpa ?? null;
  const delta = whatIfGpa !== null && origGpa !== null ? whatIfGpa - origGpa : null;

  function addFutureRow() {
    setFutureRows((prev) => [...prev, { credits: 3, grade: "B" }]);
  }

  function removeFutureRow(i: number) {
    setFutureRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function reset() {
    setScenario((prev) => prev.map((t) => ({ ...t, whatIfGpa: null })));
    setFutureRows([{ credits: 3, grade: "A" }, { credits: 3, grade: "B+" }]);
  }

  const standingLabel = !whatIfGpa ? "待定" :
    whatIfGpa >= 3.5 ? "院长荣誉榜" :
    whatIfGpa >= 2.0 ? "正常学籍" :
    whatIfGpa >= 1.5 ? "学业警告" : "学业暂停";

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">What-If Analysis</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">假设规划器</h1>
        <p className="mt-1 text-sm text-slate-500">调整历史成绩或增加未来课程，预测 GPA 变化</p>
      </section>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : (
        <>
          {/* GPA comparison */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">当前 GPA</p>
              <p className="campus-kpi-value text-slate-700">{origGpa?.toFixed(2) ?? "—"}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">假设 GPA</p>
              <p className={`campus-kpi-value ${whatIfGpa && whatIfGpa >= 3.5 ? "text-emerald-600" : whatIfGpa && whatIfGpa >= 2.0 ? "text-indigo-600" : "text-red-600"}`}>
                {whatIfGpa?.toFixed(2) ?? "—"}
              </p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">变化量</p>
              <p className={`campus-kpi-value ${delta === null ? "text-slate-400" : delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-slate-500"}`}>
                {delta !== null ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)}` : "—"}
              </p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">假设学籍状态</p>
              <p className="campus-kpi-value text-sm text-indigo-600">{standingLabel}</p>
            </div>
          </div>

          {/* Existing terms override */}
          {scenario.length > 0 && (
            <div className="campus-card p-4 space-y-3">
              <h2 className="text-sm font-bold text-slate-900">调整历史学期 GPA</h2>
              <p className="text-xs text-slate-500">将学期 GPA 调整为假设值（留空使用原始值）</p>
              <div className="space-y-2">
                {scenario.map((t, i) => (
                  <div key={t.termName} className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-medium text-slate-700 w-32 shrink-0">{t.termName}</span>
                    <span className="text-xs text-slate-500 w-20 shrink-0">原始 GPA: {t.origGpa?.toFixed(2) ?? "—"}</span>
                    <input
                      type="number"
                      min="0" max="4" step="0.01"
                      placeholder="假设 GPA"
                      value={t.whatIfGpa !== null ? t.whatIfGpa : ""}
                      onChange={(e) => {
                        const val = e.target.value === "" ? null : Math.min(4, Math.max(0, parseFloat(e.target.value)));
                        setScenario((prev) => prev.map((item, idx) => idx === i ? { ...item, whatIfGpa: val } : item));
                      }}
                      className="campus-input w-32 text-xs"
                    />
                    {t.whatIfGpa !== null && (
                      <button
                        type="button"
                        onClick={() => setScenario((prev) => prev.map((item, idx) => idx === i ? { ...item, whatIfGpa: null } : item))}
                        className="text-xs text-slate-400 hover:text-slate-600 underline"
                      >
                        重置
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Future courses */}
          <div className="campus-card p-4 space-y-3">
            <h2 className="text-sm font-bold text-slate-900">添加未来课程</h2>
            <p className="text-xs text-slate-500">假设选修以下课程并获得指定成绩</p>
            <div className="space-y-2">
              {futureRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-500 shrink-0">课程 {i + 1}</span>
                  <input
                    type="number" min="1" max="6" step="1"
                    value={row.credits}
                    onChange={(e) => setFutureRows((prev) => prev.map((r, idx) => idx === i ? { ...r, credits: parseInt(e.target.value) || 3 } : r))}
                    className="campus-input w-16 text-xs"
                    placeholder="学分"
                  />
                  <span className="text-xs text-slate-400">学分</span>
                  <select
                    value={row.grade}
                    onChange={(e) => setFutureRows((prev) => prev.map((r, idx) => idx === i ? { ...r, grade: e.target.value } : r))}
                    className="campus-select text-xs w-24"
                  >
                    {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g} ({GRADE_POINTS[g]?.toFixed(1)})</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeFutureRow(i)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" onClick={addFutureRow} className="text-xs text-indigo-600 underline hover:no-underline">
                + 添加课程
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              重置所有假设
            </button>
          </div>
        </>
      )}
    </div>
  );
}
