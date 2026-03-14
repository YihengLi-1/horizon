"use client";

/**
 * Admin Grade Curve Preview Tool
 * Lets admin enter a sectionId and boost steps to preview how grades would change.
 * Calls GET /admin/grade-curve/:sectionId/preview?steps=N
 */

import { useState } from "react";
import { apiFetch } from "@/lib/api";

type CurveEntry = { enrollmentId: string; originalGrade: string; curvedGrade: string; changed: boolean };
type CurveResult = {
  sectionId: string; steps: number;
  totalStudents: number; changedCount: number;
  currentGpa: number; newGpa: number;
  preview: CurveEntry[];
};

const GRADE_ORDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "W"];
const GRADE_COLORS: Record<string, string> = {
  "A+": "text-emerald-700 bg-emerald-50", "A": "text-emerald-700 bg-emerald-50",
  "A-": "text-emerald-600 bg-emerald-50", "B+": "text-indigo-700 bg-indigo-50",
  "B": "text-indigo-700 bg-indigo-50", "B-": "text-indigo-600 bg-indigo-50",
  "C+": "text-amber-700 bg-amber-50", "C": "text-amber-700 bg-amber-50",
  "C-": "text-amber-600 bg-amber-50", "D+": "text-orange-700 bg-orange-50",
  "D": "text-orange-700 bg-orange-50", "D-": "text-orange-600 bg-orange-50",
  "F": "text-red-700 bg-red-50", "W": "text-slate-500 bg-slate-100",
};

function gradeDistribution(entries: CurveEntry[], useOriginal: boolean) {
  const dist: Record<string, number> = {};
  for (const g of GRADE_ORDER) dist[g] = 0;
  for (const e of entries) {
    const g = useOriginal ? e.originalGrade : e.curvedGrade;
    if (g in dist) dist[g]++;
  }
  return dist;
}

export default function GradeCurvePage() {
  const [sectionId, setSectionId] = useState("");
  const [steps, setSteps] = useState(1);
  const [result, setResult] = useState<CurveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function preview() {
    if (!sectionId.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await apiFetch<CurveResult>(`/admin/grade-curve/${sectionId.trim()}/preview?steps=${steps}`);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  const origDist = result ? gradeDistribution(result.preview, true) : null;
  const newDist = result ? gradeDistribution(result.preview, false) : null;
  const maxCount = result ? Math.max(1, ...Object.values(origDist ?? {}), ...Object.values(newDist ?? {})) : 1;

  const delta = result ? result.newGpa - result.currentGpa : 0;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Grading Tools</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">成绩曲线预览</h1>
        <p className="mt-1 text-sm text-slate-500">输入课程节 ID 和提升档位数，预览成绩曲线效果</p>
      </section>

      {/* Input form */}
      <div className="campus-card p-4 space-y-4">
        <h2 className="text-sm font-bold text-slate-900">参数设置</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">课程节 ID (Section ID)</label>
            <input
              className="campus-input w-72"
              placeholder="输入 Section UUID…"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void preview()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">提升档位数 (0–5)</label>
            <input
              type="number"
              min="0" max="5" step="1"
              className="campus-input w-24"
              value={steps}
              onChange={(e) => setSteps(Math.min(5, Math.max(0, parseInt(e.target.value) || 0)))}
            />
          </div>
          <button
            type="button"
            onClick={() => void preview()}
            disabled={!sectionId.trim() || loading}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "预览中…" : "预览曲线"}
          </button>
        </div>
        <p className="text-xs text-slate-400">
          提升 1 档 = A- → A, B+ → A-, 以此类推。最高提升至 A+，W 成绩不变。
        </p>
      </div>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {result && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">学生总数</p>
              <p className="campus-kpi-value">{result.totalStudents}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">成绩变化人数</p>
              <p className="campus-kpi-value text-indigo-600">{result.changedCount}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">当前平均 GPA</p>
              <p className="campus-kpi-value text-slate-700">{result.currentGpa.toFixed(2)}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">曲线后 GPA</p>
              <p className={`campus-kpi-value ${delta > 0 ? "text-emerald-600" : "text-slate-700"}`}>
                {result.newGpa.toFixed(2)}
                {delta > 0 && <span className="text-xs font-normal ml-1 text-emerald-500">(+{delta.toFixed(2)})</span>}
              </p>
            </div>
          </div>

          {/* Distribution comparison chart */}
          <div className="campus-card p-4 space-y-3">
            <h2 className="text-sm font-bold text-slate-900">成绩分布对比</h2>
            <div className="flex gap-4 text-xs text-slate-500 mb-2">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-slate-300" />原始</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-indigo-400" />曲线后</span>
            </div>
            <div className="flex items-end gap-2 h-32 overflow-x-auto">
              {GRADE_ORDER.filter((g) => g !== "W").map((g) => {
                const orig = origDist?.[g] ?? 0;
                const next = newDist?.[g] ?? 0;
                return (
                  <div key={g} className="flex flex-col items-center gap-0.5 flex-1 min-w-[28px]">
                    <div className="flex items-end gap-0.5 h-24 w-full justify-center">
                      <div
                        title={`原始 ${g}: ${orig}`}
                        className="bg-slate-300 rounded-t w-4 transition-all"
                        style={{ height: `${(orig / maxCount) * 100}%`, minHeight: orig > 0 ? "2px" : "0" }}
                      />
                      <div
                        title={`曲线后 ${g}: ${next}`}
                        className="bg-indigo-400 rounded-t w-4 transition-all"
                        style={{ height: `${(next / maxCount) * 100}%`, minHeight: next > 0 ? "2px" : "0" }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">{g}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Student list */}
          {result.preview.length > 0 && (
            <div className="campus-card overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-500">
                共 {result.totalStudents} 名学生 · {result.changedCount} 名成绩变动
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="pb-2 pl-4 text-left font-semibold">序号</th>
                      <th className="pb-2 pr-3 text-center font-semibold">原始成绩</th>
                      <th className="pb-2 pr-3 text-center font-semibold">曲线成绩</th>
                      <th className="pb-2 pr-4 text-center font-semibold">变动</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.preview.map((entry, i) => (
                      <tr key={entry.enrollmentId} className={`border-b border-slate-50 ${entry.changed ? "bg-emerald-50/30" : ""}`}>
                        <td className="py-2 pl-4 pr-3 text-slate-400">{i + 1}</td>
                        <td className="py-2 pr-3 text-center">
                          <span className={`inline-block rounded px-1.5 py-0.5 font-mono font-bold ${GRADE_COLORS[entry.originalGrade] ?? "text-slate-600"}`}>
                            {entry.originalGrade}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-center">
                          <span className={`inline-block rounded px-1.5 py-0.5 font-mono font-bold ${GRADE_COLORS[entry.curvedGrade] ?? "text-slate-600"}`}>
                            {entry.curvedGrade}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-center">
                          {entry.changed ? (
                            <span className="text-emerald-600 font-semibold">↑ 提升</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.totalStudents === 0 && (
            <div className="campus-card px-6 py-10 text-center text-sm text-slate-400">
              该课程节暂无已完成的成绩记录
            </div>
          )}
        </>
      )}
    </div>
  );
}
