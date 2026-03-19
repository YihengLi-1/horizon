"use client";

import { useMemo, useState } from "react";

type Component = {
  id: number;
  name: string;
  weight: number;
  earned: string;
  maxPoints: number;
};

const GRADE_TABLE: [number, string][] = [
  [97, "A+"], [93, "A"], [90, "A-"],
  [87, "B+"], [83, "B"], [80, "B-"],
  [77, "C+"], [73, "C"], [70, "C-"],
  [67, "D+"], [63, "D"], [60, "D-"],
  [0, "F"],
];

function pctToLetter(pct: number): string {
  for (const [min, letter] of GRADE_TABLE) {
    if (pct >= min) return letter;
  }
  return "F";
}

const LETTER_TO_POINTS: Record<string, number> = {
  "A+": 4.0, "A": 4.0, "A-": 3.7,
  "B+": 3.3, "B": 3.0, "B-": 2.7,
  "C+": 2.3, "C": 2.0, "C-": 1.7,
  "D+": 1.3, "D": 1.0, "D-": 0.7, "F": 0.0,
};

let nextId = 1;
function mkId() { return nextId++; }

export default function GradeEstimatorPage() {
  const [components, setComponents] = useState<Component[]>([
    { id: mkId(), name: "作业", weight: 30, earned: "85", maxPoints: 100 },
    { id: mkId(), name: "期中考试", weight: 30, earned: "78", maxPoints: 100 },
    { id: mkId(), name: "期末考试", weight: 40, earned: "", maxPoints: 100 },
  ]);
  const [targetGrade, setTargetGrade] = useState("B");

  function update(id: number, field: keyof Component, value: string | number) {
    setComponents((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
  }

  function addRow() {
    setComponents((prev) => [...prev, { id: mkId(), name: `成分 ${prev.length + 1}`, weight: 10, earned: "", maxPoints: 100 }]);
  }

  function removeRow(id: number) {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }

  const { currentPct, currentGrade, totalWeight, earnedWeight, missingWeight, neededPct } = useMemo(() => {
    const totalWeight = components.reduce((s, c) => s + Number(c.weight), 0);
    let earnedWeight = 0;
    let earnedPoints = 0;
    let missingWeight = 0;

    for (const c of components) {
      const w = Number(c.weight);
      const e = c.earned.trim();
      if (e === "") {
        missingWeight += w;
      } else {
        earnedWeight += w;
        earnedPoints += (Number(e) / Number(c.maxPoints)) * w;
      }
    }

    const currentPct = earnedWeight > 0 ? (earnedPoints / earnedWeight) * 100 : 0;
    const currentGrade = pctToLetter(currentPct);

    // What percent do you need on remaining components to hit target?
    const targetEntry = GRADE_TABLE.find(([, l]) => l === targetGrade);
    const targetPct = targetEntry ? targetEntry[0] : 60;

    // current*(earnedWeight/100) + needed*(missingWeight/100) = targetPct * (totalWeight/100)
    // needed = (targetPct*totalWeight - currentPct*earnedWeight) / missingWeight
    const neededPct = missingWeight > 0
      ? ((targetPct * totalWeight - currentPct * earnedWeight) / missingWeight)
      : null;

    return { currentPct, currentGrade, totalWeight, earnedWeight, missingWeight, neededPct };
  }, [components, targetGrade]);

  const overWeighted = totalWeight > 100;
  const underWeighted = totalWeight < 100;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业工具</p>
        <h1 className="campus-title">成绩估算器</h1>
        <p className="campus-subtitle">输入各评分项目的权重与得分，实时估算最终课程成绩</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">当前加权均分</p>
          <p className={`campus-kpi-value ${currentPct >= 90 ? "text-emerald-600" : currentPct >= 70 ? "text-amber-600" : "text-red-600"}`}>
            {earnedWeight > 0 ? currentPct.toFixed(1) : "—"}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">预估等级</p>
          <p className={`campus-kpi-value ${LETTER_TO_POINTS[currentGrade] >= 3.0 ? "text-emerald-600" : LETTER_TO_POINTS[currentGrade] >= 2.0 ? "text-amber-600" : "text-red-600"}`}>
            {earnedWeight > 0 ? currentGrade : "—"}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">绩点当量</p>
          <p className="campus-kpi-value">{earnedWeight > 0 ? LETTER_TO_POINTS[currentGrade]?.toFixed(1) ?? "—" : "—"}</p>
        </div>
      </section>

      {(overWeighted || underWeighted) && components.length > 0 ? (
        <div className={`rounded-xl border px-4 py-3 text-sm ${overWeighted ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
          {overWeighted ? `⚠ 权重总和为 ${totalWeight}%，超过 100%，请检查输入。` : `ℹ 权重总和为 ${totalWeight}%（低于 100%），剩余 ${100 - totalWeight}% 尚未分配。`}
        </div>
      ) : null}

      <section className="campus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <th className="px-4 py-3 text-left">评分项目</th>
                <th className="px-4 py-3 text-right w-24">权重 (%)</th>
                <th className="px-4 py-3 text-right w-24">得分</th>
                <th className="px-4 py-3 text-right w-24">满分</th>
                <th className="px-4 py-3 text-right w-20">百分比</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {components.map((c) => {
                const pct = c.earned.trim() ? (Number(c.earned) / Number(c.maxPoints)) * 100 : null;
                return (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="px-4 py-2">
                      <input
                        className="campus-input w-full"
                        value={c.name}
                        onChange={(e) => update(c.id, "name", e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="campus-input w-full text-right"
                        value={c.weight}
                        min={0}
                        max={100}
                        onChange={(e) => update(c.id, "weight", Number(e.target.value))}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="campus-input w-full text-right"
                        placeholder="未填写"
                        value={c.earned}
                        min={0}
                        onChange={(e) => update(c.id, "earned", e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        className="campus-input w-full text-right"
                        value={c.maxPoints}
                        min={1}
                        onChange={(e) => update(c.id, "maxPoints", Number(e.target.value))}
                      />
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {pct != null ? (
                        <span className={pct >= 90 ? "text-emerald-600 font-bold" : pct >= 70 ? "text-amber-600" : "text-red-600"}>
                          {pct.toFixed(1)}%
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(c.id)}
                        className="text-slate-300 hover:text-red-500 transition text-lg"
                        aria-label="删除"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={addRow} className="campus-btn-ghost text-sm">
            + 添加评分项目
          </button>
          <span className="text-xs text-slate-400">权重总和: <span className={totalWeight !== 100 ? "text-amber-600 font-bold" : "text-emerald-600 font-bold"}>{totalWeight}%</span></span>
        </div>
      </section>

      {/* Target grade reverse calculator */}
      <section className="campus-card p-5">
        <p className="font-semibold text-slate-800 mb-3">目标成绩计算</p>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">我的目标等级：</label>
            <select
              className="campus-select w-28"
              value={targetGrade}
              onChange={(e) => setTargetGrade(e.target.value)}
            >
              {GRADE_TABLE.map(([, l]) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          {missingWeight > 0 && neededPct != null ? (
            <div className={`rounded-xl border px-4 py-2 text-sm ${neededPct > 100 ? "border-red-200 bg-red-50 text-red-700" : neededPct > 90 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              {neededPct > 100
                ? `❌ 即使满分也无法获得 ${targetGrade}，当前分数差距过大`
                : neededPct < 0
                ? `✅ 当前成绩已确保获得 ${targetGrade}，无需担心剩余部分`
                : `📌 剩余项目（共 ${missingWeight}% 权重）需均分 ${neededPct.toFixed(1)}% 才能达到 ${targetGrade}`
              }
            </div>
          ) : missingWeight === 0 ? (
            <p className="text-sm text-slate-500">所有项目已填写完毕</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
