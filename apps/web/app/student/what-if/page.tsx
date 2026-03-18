"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type EnrollmentItem = {
  enrollmentId: string;
  courseCode: string;
  title: string;
  credits: number;
  finalGrade: string | null;
  status: string;
  termName: string;
};

type CourseHistoryItem = {
  termName: string;
  termId: string;
  enrollments: EnrollmentItem[];
};

const GRADE_POINTS: Record<string, number> = {
  "A+": 4.0, "A": 4.0, "A-": 3.7,
  "B+": 3.3, "B": 3.0, "B-": 2.7,
  "C+": 2.3, "C": 2.0, "C-": 1.7,
  "D+": 1.3, "D": 1.0, "D-": 0.7, "F": 0.0,
};

const GRADE_OPTIONS = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

type Override = { grade: string };

export default function WhatIfPage() {
  const [history, setHistory] = useState<CourseHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [futureRows, setFutureRows] = useState<{ id: number; credits: number; grade: string }[]>([]);
  const [nextFutureId, setNextFutureId] = useState(1);

  useEffect(() => {
    void apiFetch<CourseHistoryItem[]>("/students/course-history")
      .then((d) => setHistory(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  // Flat list of all completed/graded enrollments
  const allEnrollments = useMemo(() => {
    return history.flatMap((t) =>
      t.enrollments.filter((e) => e.status === "COMPLETED" && e.finalGrade && e.finalGrade !== "W")
    );
  }, [history]);

  const { originalGpa, simulatedGpa, totalCredits, simulatedCredits } = useMemo(() => {
    let origWp = 0, origCr = 0;
    let simWp = 0, simCr = 0;

    for (const e of allEnrollments) {
      const origGrade = e.finalGrade!;
      const pts = GRADE_POINTS[origGrade];
      if (pts === undefined) continue;
      origWp += pts * e.credits;
      origCr += e.credits;

      const override = overrides[e.enrollmentId];
      const simGrade = override ? override.grade : origGrade;
      const simPts = GRADE_POINTS[simGrade] ?? pts;
      simWp += simPts * e.credits;
      simCr += e.credits;
    }

    // Add future rows
    for (const fr of futureRows) {
      const pts = GRADE_POINTS[fr.grade] ?? 0;
      simWp += pts * fr.credits;
      simCr += fr.credits;
    }

    const originalGpa = origCr > 0 ? origWp / origCr : 0;
    const simulatedGpa = simCr > 0 ? simWp / simCr : 0;

    return { originalGpa, simulatedGpa, totalCredits: origCr, simulatedCredits: simCr };
  }, [allEnrollments, overrides, futureRows]);

  const diff = simulatedGpa - originalGpa;

  function addFuture() {
    setFutureRows((prev) => [...prev, { id: nextFutureId, credits: 3, grade: "B" }]);
    setNextFutureId((n) => n + 1);
  }

  function updateFuture(id: number, field: "credits" | "grade", value: string | number) {
    setFutureRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
  }

  function removeFuture(id: number) {
    setFutureRows((prev) => prev.filter((r) => r.id !== id));
  }

  function resetOverrides() {
    setOverrides({});
    setFutureRows([]);
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业工具</p>
        <h1 className="campus-hero-title">GPA 假设模拟</h1>
        <p className="campus-hero-subtitle">修改历史成绩或添加未来课程，实时查看 GPA 变化</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">原始 GPA</p>
          <p className="campus-kpi-value">{loading ? "—" : originalGpa.toFixed(3)}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">模拟后 GPA</p>
          <p className={`campus-kpi-value ${diff > 0.01 ? "text-emerald-600" : diff < -0.01 ? "text-red-600" : "text-slate-800"}`}>
            {loading ? "—" : simulatedGpa.toFixed(3)}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">GPA 变化</p>
          <p className={`campus-kpi-value ${diff > 0.01 ? "text-emerald-600" : diff < -0.01 ? "text-red-600" : "text-slate-500"}`}>
            {loading ? "—" : `${diff >= 0 ? "+" : ""}${diff.toFixed(3)}`}
          </p>
        </div>
      </section>

      {Object.keys(overrides).length > 0 || futureRows.length > 0 ? (
        <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-2">
          <p className="text-sm text-blue-700">
            已修改 <strong>{Object.keys(overrides).length}</strong> 门课程，添加 <strong>{futureRows.length}</strong> 门未来课程
          </p>
          <button type="button" onClick={resetOverrides} className="text-xs text-blue-600 hover:underline">
            重置所有
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {/* Historical overrides */}
      {!loading && allEnrollments.length > 0 ? (
        <section className="campus-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="font-semibold text-slate-800">历史课程成绩调整</p>
            <p className="text-xs text-slate-400 mt-0.5">点击修改成绩等级，查看 GPA 变化</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left">课程</th>
                  <th className="px-4 py-3 text-left">学期</th>
                  <th className="px-4 py-3 text-right">学分</th>
                  <th className="px-4 py-3 text-center">原始成绩</th>
                  <th className="px-4 py-3 text-center">假设成绩</th>
                </tr>
              </thead>
              <tbody>
                {allEnrollments.map((e) => {
                  const override = overrides[e.enrollmentId];
                  const hasOverride = Boolean(override && override.grade !== e.finalGrade);
                  return (
                    <tr key={e.enrollmentId} className={`border-b border-slate-100 hover:bg-slate-50 ${hasOverride ? "bg-blue-50/40" : ""}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-slate-900">{e.courseCode}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[160px]">{e.title}</p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{e.termName}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-700">{e.credits}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="font-bold text-slate-700">{e.finalGrade}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <select
                          className={`campus-select py-1 text-sm ${hasOverride ? "border-blue-300 bg-blue-50 text-blue-800 font-bold" : ""}`}
                          value={override?.grade ?? e.finalGrade!}
                          onChange={(ev) => {
                            const val = ev.target.value;
                            if (val === e.finalGrade) {
                              setOverrides((prev) => {
                                const next = { ...prev };
                                delete next[e.enrollmentId];
                                return next;
                              });
                            } else {
                              setOverrides((prev) => ({ ...prev, [e.enrollmentId]: { grade: val } }));
                            }
                          }}
                        >
                          {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            共 {allEnrollments.length} 门课程 · 已完成学分：{totalCredits}
          </p>
        </section>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : (
        <div className="campus-card p-10 text-center text-slate-400">暂无历史成绩</div>
      )}

      {/* Future courses */}
      <section className="campus-card p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-slate-800">添加未来课程</p>
          <button type="button" onClick={addFuture} className="campus-btn-ghost text-sm">
            + 添加课程
          </button>
        </div>
        {futureRows.length === 0 ? (
          <p className="text-sm text-slate-400">点击"添加课程"模拟未来课程对 GPA 的影响</p>
        ) : (
          <div className="space-y-2">
            {futureRows.map((fr) => (
              <div key={fr.id} className="flex items-center gap-3">
                <label className="text-sm text-slate-600 w-12">学分</label>
                <input
                  type="number"
                  className="campus-input w-20 text-right"
                  value={fr.credits}
                  min={1}
                  max={12}
                  onChange={(e) => updateFuture(fr.id, "credits", Number(e.target.value))}
                />
                <label className="text-sm text-slate-600">预期等级</label>
                <select
                  className="campus-select w-24"
                  value={fr.grade}
                  onChange={(e) => updateFuture(fr.id, "grade", e.target.value)}
                >
                  {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <button type="button" onClick={() => removeFuture(fr.id)} className="text-slate-300 hover:text-red-500 text-lg transition">×</button>
              </div>
            ))}
            <p className="text-xs text-slate-400 mt-2">未来课程学分：{futureRows.reduce((s, r) => s + r.credits, 0)} · 模拟总学分：{simulatedCredits}</p>
          </div>
        )}
      </section>
    </div>
  );
}
