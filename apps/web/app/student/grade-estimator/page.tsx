"use client";

/**
 * Student Final Grade Estimator
 * Weighted-average grade calculator with target-grade reverse computation.
 * Entirely client-side — no API needed.
 */

import { useState } from "react";

type Component = {
  id: string;
  label: string;
  weight: number;   // 0-100
  earned:  number;  // 0-100, -1 = not yet
};

const DEFAULT_COMPONENTS: Component[] = [
  { id: "hw",     label: "作业 Homework",  weight: 25, earned: 88 },
  { id: "quiz",   label: "小测 Quizzes",   weight: 15, earned: 82 },
  { id: "mid",    label: "期中 Midterm",   weight: 30, earned: 76 },
  { id: "final",  label: "期末 Final",     weight: 30, earned: -1 }
];

const GRADE_CUTOFFS = [
  { grade: "A+", min: 97 }, { grade: "A", min: 93 }, { grade: "A-", min: 90 },
  { grade: "B+", min: 87 }, { grade: "B", min: 83 }, { grade: "B-", min: 80 },
  { grade: "C+", min: 77 }, { grade: "C", min: 73 }, { grade: "C-", min: 70 },
  { grade: "D",  min: 60 }, { grade: "F", min: 0 }
];

function toGrade(pct: number): string {
  for (const { grade, min } of GRADE_CUTOFFS) {
    if (pct >= min) return grade;
  }
  return "F";
}

function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return "text-emerald-600";
  if (grade.startsWith("B")) return "text-indigo-600";
  if (grade.startsWith("C")) return "text-amber-600";
  return "text-red-600";
}

function uid() { return Math.random().toString(36).slice(2); }

export default function GradeEstimatorPage() {
  const [components, setComponents] = useState<Component[]>(DEFAULT_COMPONENTS);
  const [targetGrade, setTargetGrade] = useState<string>("B+");
  const [courseLabel, setCourseLabel] = useState("");

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);

  // Known weighted score (exclude -1 items = not yet submitted)
  const completedWeight = components.filter((c) => c.earned >= 0).reduce((s, c) => s + c.weight, 0);
  const completedScore  = components.filter((c) => c.earned >= 0).reduce((s, c) => s + (c.earned * c.weight / 100), 0);

  // If all submitted: just compute
  const allDone = components.every((c) => c.earned >= 0);
  const currentPct = totalWeight > 0 ? Math.round((completedScore / (totalWeight)) * 100) : 0;

  // Remaining weight from un-submitted items
  const remainingWeight = components.filter((c) => c.earned < 0).reduce((s, c) => s + c.weight, 0);

  // What score on remaining items to reach target?
  const targetMin = GRADE_CUTOFFS.find((g) => g.grade === targetGrade)?.min ?? 80;
  const needed = remainingWeight > 0
    ? Math.round(((targetMin * totalWeight / 100) - completedScore) / (remainingWeight / 100))
    : null;

  const projectedMin = allDone ? currentPct : (completedScore / totalWeight) * 100;
  const projectedGrade = toGrade(allDone ? currentPct : projectedMin);

  function updateComponent(id: string, field: keyof Component, value: number | string) {
    setComponents((prev) =>
      prev.map((c) => c.id === id ? { ...c, [field]: value } : c)
    );
  }

  function addComponent() {
    setComponents((prev) => [...prev, { id: uid(), label: "新项目", weight: 10, earned: -1 }]);
  }

  function removeComponent(id: string) {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }

  function reset() {
    setComponents(DEFAULT_COMPONENTS);
    setCourseLabel("");
  }

  const weightError = totalWeight !== 100;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Tools</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">期末成绩估算</h1>
        <p className="mt-1 text-sm text-slate-500">
          输入各评分项权重和得分，预测最终成绩及目标分数要求
        </p>
      </section>

      {/* Course label */}
      <div className="campus-card p-4 flex items-center gap-3">
        <label className="text-sm font-semibold text-slate-700 shrink-0">课程：</label>
        <input
          className="campus-input flex-1"
          placeholder="输入课程代码或名称（可选）"
          value={courseLabel}
          onChange={(e) => setCourseLabel(e.target.value)}
        />
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          重置
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Component editor */}
        <div className="lg:col-span-2 space-y-4">
          <div className="campus-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">评分项配置</h2>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${weightError ? "text-red-600" : "text-emerald-600"}`}>
                  总权重：{totalWeight}% {weightError ? "(应为100%)" : "✓"}
                </span>
                <button
                  type="button"
                  onClick={addComponent}
                  className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  ＋ 添加
                </button>
              </div>
            </div>

            {/* Header */}
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold uppercase text-slate-400 px-1">
              <span className="col-span-4">项目</span>
              <span className="col-span-2 text-center">权重%</span>
              <span className="col-span-3 text-center">得分 (0-100)</span>
              <span className="col-span-2 text-center">加权分</span>
              <span className="col-span-1" />
            </div>

            {components.map((c) => {
              const weighted = c.earned >= 0 ? (c.earned * c.weight / 100) : null;
              return (
                <div key={c.id} className="grid grid-cols-12 items-center gap-2">
                  <input
                    className="campus-input col-span-4 text-sm"
                    value={c.label}
                    onChange={(e) => updateComponent(c.id, "label", e.target.value)}
                  />
                  <input
                    className="campus-input col-span-2 text-center font-mono"
                    type="number" min="0" max="100"
                    value={c.weight}
                    onChange={(e) => updateComponent(c.id, "weight", Number(e.target.value))}
                  />
                  <div className="col-span-3 flex items-center gap-1">
                    <input
                      className="campus-input flex-1 text-center font-mono"
                      type="number" min="0" max="100"
                      placeholder="—"
                      value={c.earned < 0 ? "" : c.earned}
                      onChange={(e) => updateComponent(c.id, "earned", e.target.value === "" ? -1 : Number(e.target.value))}
                    />
                    {c.earned < 0 && (
                      <span className="text-xs text-slate-400 shrink-0">未有</span>
                    )}
                  </div>
                  <span className="col-span-2 text-center font-mono text-sm text-slate-600">
                    {weighted !== null ? weighted.toFixed(1) : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeComponent(c.id)}
                    className="col-span-1 text-red-400 hover:text-red-600 text-center"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Results */}
        <div className="space-y-4">
          {/* Current standing */}
          <div className="campus-card p-5 text-center space-y-3">
            <p className="text-xs font-bold uppercase text-slate-500">
              {allDone ? "最终成绩预测" : "当前加权均分"}
            </p>
            <p className="text-6xl font-bold font-mono text-slate-800">
              {completedWeight > 0 ? Math.round(completedScore / totalWeight * 100) : "—"}
              <span className="text-2xl text-slate-400">%</span>
            </p>
            <p className={`text-3xl font-bold ${gradeColor(projectedGrade)}`}>
              {completedWeight > 0 ? projectedGrade : "—"}
            </p>
            {!allDone && (
              <p className="text-xs text-slate-400">
                已完成 {Math.round(completedWeight)}% 的评分项
              </p>
            )}
          </div>

          {/* Target grade calculator */}
          {!allDone && (
            <div className="campus-card p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">目标成绩</h3>
              <select
                className="campus-select w-full"
                value={targetGrade}
                onChange={(e) => setTargetGrade(e.target.value)}
              >
                {GRADE_CUTOFFS.filter((g) => g.grade !== "F").map((g) => (
                  <option key={g.grade} value={g.grade}>{g.grade} (≥{g.min}%)</option>
                ))}
              </select>
              {needed !== null && (
                <div className={`rounded-lg border px-3 py-3 text-center ${
                  needed > 100
                    ? "border-red-200 bg-red-50"
                    : needed > 85
                    ? "border-amber-200 bg-amber-50"
                    : "border-emerald-200 bg-emerald-50"
                }`}>
                  <p className="text-xs text-slate-500 mb-1">剩余评分项需达到</p>
                  <p className={`text-3xl font-bold font-mono ${
                    needed > 100 ? "text-red-600" : needed > 85 ? "text-amber-600" : "text-emerald-600"
                  }`}>
                    {needed > 100 ? "无法达到" : `${needed}%`}
                  </p>
                  {needed > 100 && (
                    <p className="text-xs text-red-500 mt-1">
                      即使满分也无法达到 {targetGrade}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Grade scale reference */}
          <div className="campus-card p-4">
            <h3 className="text-xs font-bold uppercase text-slate-500 mb-3">成绩参考</h3>
            <div className="space-y-1">
              {GRADE_CUTOFFS.map(({ grade, min }, i) => {
                const max = i === 0 ? 100 : GRADE_CUTOFFS[i - 1].min - 1;
                const isCurrent = completedWeight > 0 && Math.round(completedScore / totalWeight * 100) >= min && Math.round(completedScore / totalWeight * 100) <= max;
                return (
                  <div key={grade} className={`flex items-center justify-between rounded px-2 py-0.5 text-xs ${
                    isCurrent ? "bg-indigo-100 font-bold" : ""
                  }`}>
                    <span className={`font-mono font-bold ${gradeColor(grade)}`}>{grade}</span>
                    <span className="text-slate-500">{min}% – {max}%</span>
                    {isCurrent && <span className="text-indigo-600">← 当前</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
