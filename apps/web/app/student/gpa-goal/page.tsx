"use client";

/**
 * Student GPA Goal Tracker
 * Set a target GPA and calculate how many credits/courses at what grade needed.
 * Uses /students/standing data. Fully client-side.
 */

import { useEffect, useMemo, useState } from "react";
import { GRADE_POINTS } from "@sis/shared/constants";
import { apiFetch } from "@/lib/api";

type TermHistory = { termName: string; credits: number; courses: number; termGpa: number | null };
type StandingData = {
  cumulativeGpa: number | null;
  totalCredits: number;
  standing: string;
  termHistory: TermHistory[];
};

const GRADE_OPTIONS = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

export default function GpaGoalPage() {
  const [standing, setStanding] = useState<StandingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [targetGpa, setTargetGpa] = useState(3.5);
  const [targetGrade, setTargetGrade] = useState("A");
  const [creditsPerCourse, setCreditsPerCourse] = useState(3);

  useEffect(() => {
    void apiFetch<StandingData>("/students/standing")
      .then((d) => setStanding(d))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const currentGpa = standing?.cumulativeGpa ?? null;
  const currentCredits = standing?.totalCredits ?? 0;
  const currentPoints = currentGpa !== null ? currentGpa * currentCredits : 0;

  // How many additional credits at targetGrade needed to reach targetGpa?
  const analysis = useMemo(() => {
    if (currentGpa === null) return null;
    const gradePoints = GRADE_POINTS[targetGrade] ?? 0;

    if (targetGpa <= currentGpa) {
      return { creditsNeeded: 0, coursesNeeded: 0, feasible: true, message: "已达到目标 GPA！" };
    }
    if (gradePoints <= targetGpa) {
      return {
        creditsNeeded: null, coursesNeeded: null, feasible: false,
        message: `以 ${targetGrade} (${gradePoints.toFixed(1)} 绩点) 无法达到目标 GPA ${targetGpa.toFixed(2)}，需要更高成绩`
      };
    }

    // (currentPoints + x * gradePoints) / (currentCredits + x) = targetGpa
    // currentPoints + x * gradePoints = targetGpa * currentCredits + targetGpa * x
    // x * (gradePoints - targetGpa) = targetGpa * currentCredits - currentPoints
    const x = (targetGpa * currentCredits - currentPoints) / (gradePoints - targetGpa);
    const creditsNeeded = Math.ceil(x);
    const coursesNeeded = Math.ceil(creditsNeeded / creditsPerCourse);
    return {
      creditsNeeded, coursesNeeded, feasible: true,
      message: `需修读约 ${creditsNeeded} 学分（约 ${coursesNeeded} 门课，每门 ${creditsPerCourse} 学分），全部获得 ${targetGrade}`
    };
  }, [currentGpa, currentCredits, currentPoints, targetGpa, targetGrade, creditsPerCourse]);

  // Simulated GPA at various future credit amounts
  const simPoints = useMemo(() => {
    const gradePoints = GRADE_POINTS[targetGrade] ?? 0;
    const points: { additionalCredits: number; projectedGpa: number }[] = [];
    for (let add = 0; add <= 60; add += 3) {
      const projected = (currentPoints + add * gradePoints) / (currentCredits + add);
      points.push({ additionalCredits: add, projectedGpa: Math.round(projected * 100) / 100 });
    }
    return points;
  }, [currentPoints, currentCredits, targetGrade]);

  // SVG projection line
  const svgLine = useMemo(() => {
    if (simPoints.length < 2) return "";
    const w = 600, h = 140, padL = 40, padR = 20, padT = 10, padB = 30;
    const maxX = 60, minY = Math.min(currentGpa ?? 0, targetGpa, ...simPoints.map((p) => p.projectedGpa));
    const gpaRange = Math.max(0.1, 4 - Math.max(0, minY - 0.2));
    const toX = (add: number) => padL + (add / maxX) * (w - padL - padR);
    const toY = (gpa: number) => h - padB - ((gpa - Math.max(0, minY - 0.2)) / gpaRange) * (h - padT - padB);
    return simPoints.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.additionalCredits).toFixed(1)},${toY(p.projectedGpa).toFixed(1)}`).join(" ");
  }, [simPoints, currentGpa, targetGpa]);

  const gpaRange = useMemo(() => {
    const all = simPoints.map((p) => p.projectedGpa);
    const min = Math.max(0, Math.min(...all) - 0.2);
    return { min, max: 4 };
  }, [simPoints]);

  const toSvgX = (add: number) => 40 + (add / 60) * 540;
  const toSvgY = (gpa: number) => {
    const range = gpaRange.max - gpaRange.min;
    return 140 - 30 - ((gpa - gpaRange.min) / Math.max(0.1, range)) * 100;
  };

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Planning</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">GPA 目标规划</h1>
        <p className="mt-1 text-sm text-slate-500">设定目标 GPA，计算所需学分和成绩</p>
      </section>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : standing ? (
        <>
          {/* Current standing */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="campus-kpi">
              <p className="campus-kpi-label">当前 GPA</p>
              <p className="campus-kpi-value text-slate-700">{currentGpa?.toFixed(2) ?? "—"}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">已修学分</p>
              <p className="campus-kpi-value text-slate-600">{currentCredits}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">学籍状态</p>
              <p className="campus-kpi-value text-sm text-indigo-600">{standing.standing}</p>
            </div>
          </div>

          {/* Goal settings */}
          <div className="campus-card p-4 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">目标设置</h2>
            <div className="flex flex-wrap gap-6 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">目标 GPA</label>
                <input
                  type="number" min="0" max="4" step="0.01"
                  className="campus-input w-28"
                  value={targetGpa}
                  onChange={(e) => setTargetGpa(Math.min(4, Math.max(0, parseFloat(e.target.value) || 0)))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">预期成绩</label>
                <select
                  className="campus-select w-28"
                  value={targetGrade}
                  onChange={(e) => setTargetGrade(e.target.value)}
                >
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g} ({GRADE_POINTS[g]?.toFixed(1)})</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-500">每门课学分</label>
                <input
                  type="number" min="1" max="6" step="1"
                  className="campus-input w-20"
                  value={creditsPerCourse}
                  onChange={(e) => setCreditsPerCourse(Math.min(6, Math.max(1, parseInt(e.target.value) || 3)))}
                />
              </div>
            </div>
          </div>

          {/* Analysis result */}
          {analysis && (
            <div className={`campus-card p-4 border ${analysis.feasible ? "border-indigo-100 bg-indigo-50/30" : "border-red-100 bg-red-50/30"}`}>
              <h2 className="text-sm font-bold text-slate-900 mb-2">分析结果</h2>
              <p className={`text-sm font-semibold ${analysis.feasible ? "text-indigo-700" : "text-red-700"}`}>
                {analysis.message}
              </p>
              {analysis.feasible && analysis.creditsNeeded !== null && analysis.creditsNeeded > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-slate-500">需增加学分</p>
                    <p className="text-xl font-bold text-indigo-700">{analysis.creditsNeeded}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">约需课程数</p>
                    <p className="text-xl font-bold text-indigo-700">{analysis.coursesNeeded}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">所需成绩</p>
                    <p className="text-xl font-bold text-emerald-700">{targetGrade}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">目标 GPA</p>
                    <p className="text-xl font-bold text-slate-700">{targetGpa.toFixed(2)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Projection chart */}
          <div className="campus-card p-4 space-y-2">
            <h2 className="text-sm font-bold text-slate-900">GPA 预测曲线</h2>
            <p className="text-xs text-slate-400">按当前成绩 {targetGrade} 增加学分时的 GPA 变化</p>
            <svg viewBox="0 0 600 140" className="w-full">
              {/* Grid */}
              {[0, 1, 2, 3, 4].map((v) => {
                if (v < gpaRange.min - 0.1 || v > 4.05) return null;
                const y = toSvgY(v);
                return (
                  <g key={v}>
                    <line x1="40" y1={y} x2="580" y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 2" />
                    <text x="34" y={y + 3} textAnchor="end" fontSize="8" fill="#94a3b8">{v}</text>
                  </g>
                );
              })}
              {/* Target GPA line */}
              <line x1="40" y1={toSvgY(targetGpa)} x2="580" y2={toSvgY(targetGpa)} stroke="#4f46e5" strokeWidth="1" strokeDasharray="6 3" />
              <text x="582" y={toSvgY(targetGpa) + 3} fontSize="8" fill="#4f46e5">目标</text>
              {/* Projection path */}
              {svgLine && <path d={svgLine} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />}
              {/* X axis labels */}
              {[0, 15, 30, 45, 60].map((add) => (
                <text key={add} x={toSvgX(add)} y="137" textAnchor="middle" fontSize="8" fill="#94a3b8">+{add}cr</text>
              ))}
            </svg>
          </div>

          {/* Milestones table */}
          <div className="campus-card overflow-hidden">
            <div className="px-4 pt-3 pb-1 text-xs font-bold text-slate-700 border-b border-slate-100">
              增加学分 → 预测 GPA（成绩: {targetGrade}）
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400">
                    <th className="pb-2 pl-4 pt-2 text-left font-semibold">额外学分</th>
                    <th className="pb-2 pr-3 text-right font-semibold">约需课程数</th>
                    <th className="pb-2 pr-4 text-right font-semibold">预测 GPA</th>
                  </tr>
                </thead>
                <tbody>
                  {simPoints.filter((_, i) => i % 2 === 0).map((p) => {
                    const reached = p.projectedGpa >= targetGpa;
                    return (
                      <tr key={p.additionalCredits} className={`border-b border-slate-50 ${reached ? "bg-emerald-50/50" : ""}`}>
                        <td className="py-2 pl-4 pr-3 font-medium text-slate-700">+{p.additionalCredits} 学分</td>
                        <td className="py-2 pr-3 text-right text-slate-500">
                          {p.additionalCredits === 0 ? "—" : `~${Math.ceil(p.additionalCredits / creditsPerCourse)} 门`}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          <span className={`font-bold ${reached ? "text-emerald-600" : "text-slate-700"}`}>
                            {p.projectedGpa.toFixed(2)}{reached ? " ✓" : ""}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
