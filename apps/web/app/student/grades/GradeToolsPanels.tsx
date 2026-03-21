"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { GRADE_POINTS } from "@sis/shared/constants";

type HistoricalGrade = {
  id: string;
  courseCode: string;
  title: string;
  credits: number;
  finalGrade: string;
  termName: string;
};

type EstimatorRow = {
  id: number;
  label: string;
  weight: number;
  score: number;
};

type FutureRow = {
  id: number;
  credits: number;
  grade: string;
};

const GRADE_OPTIONS = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

export default function GradeToolsPanels({ historicalGrades }: { historicalGrades: HistoricalGrade[] }) {
  const [estimatorOpen, setEstimatorOpen] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const [estimatorRows, setEstimatorRows] = useState<EstimatorRow[]>([]);
  const [nextEstimatorId, setNextEstimatorId] = useState(1);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [futureRows, setFutureRows] = useState<FutureRow[]>([]);
  const [nextFutureId, setNextFutureId] = useState(1);

  const estimatorStats = useMemo(() => {
    const totalWeight = estimatorRows.reduce((sum, row) => sum + Math.max(0, row.weight), 0);
    const weightedScore = estimatorRows.reduce((sum, row) => sum + Math.max(0, row.weight) * Math.max(0, row.score), 0);
    return {
      totalWeight,
      average: totalWeight > 0 ? weightedScore / totalWeight : 0
    };
  }, [estimatorRows]);

  const whatIfStats = useMemo(() => {
    let originalPoints = 0;
    let originalCredits = 0;
    let simulatedPoints = 0;
    let simulatedCredits = 0;

    for (const grade of historicalGrades) {
      const original = GRADE_POINTS[grade.finalGrade];
      if (original === undefined) continue;
      originalPoints += original * grade.credits;
      originalCredits += grade.credits;

      const overrideGrade = overrides[grade.id] ?? grade.finalGrade;
      const simulated = GRADE_POINTS[overrideGrade] ?? original;
      simulatedPoints += simulated * grade.credits;
      simulatedCredits += grade.credits;
    }

    for (const row of futureRows) {
      const points = GRADE_POINTS[row.grade] ?? 0;
      simulatedPoints += points * row.credits;
      simulatedCredits += row.credits;
    }

    const originalGpa = originalCredits > 0 ? originalPoints / originalCredits : 0;
    const simulatedGpa = simulatedCredits > 0 ? simulatedPoints / simulatedCredits : 0;
    return {
      originalGpa,
      simulatedGpa,
      delta: simulatedGpa - originalGpa,
      simulatedCredits
    };
  }, [futureRows, historicalGrades, overrides]);

  function addEstimatorRow() {
    setEstimatorRows((current) => [
      ...current,
      { id: nextEstimatorId, label: `评分项 ${nextEstimatorId}`, weight: 20, score: 85 }
    ]);
    setNextEstimatorId((value) => value + 1);
  }

  function updateEstimatorRow(id: number, patch: Partial<EstimatorRow>) {
    setEstimatorRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeEstimatorRow(id: number) {
    setEstimatorRows((current) => current.filter((row) => row.id !== id));
  }

  function addFutureRow() {
    setFutureRows((current) => [...current, { id: nextFutureId, credits: 3, grade: "B" }]);
    setNextFutureId((value) => value + 1);
  }

  function updateFutureRow(id: number, patch: Partial<FutureRow>) {
    setFutureRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeFutureRow(id: number) {
    setFutureRows((current) => current.filter((row) => row.id !== id));
  }

  function resetWhatIf() {
    setOverrides({});
    setFutureRows([]);
  }

  return (
    <div className="space-y-4">
      <section className="campus-card overflow-hidden">
        <button
          type="button"
          onClick={() => setEstimatorOpen((current) => !current)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">成绩估算器</p>
            <p className="mt-1 text-xs text-slate-500">按评分项输入占比与分数，快速估算单门课程的加权平均成绩。</p>
          </div>
          {estimatorOpen ? <ChevronDown className="size-5 text-slate-400" /> : <ChevronRight className="size-5 text-slate-400" />}
        </button>
        {estimatorOpen ? (
          <div className="border-t border-slate-100 px-5 py-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <span className="campus-chip chip-blue">已覆盖 {estimatorStats.totalWeight}%</span>
                <span className="campus-chip chip-emerald">加权均值 {estimatorStats.average.toFixed(1)}</span>
              </div>
              <button type="button" onClick={addEstimatorRow} className="campus-btn-ghost inline-flex items-center gap-1 text-sm">
                <Plus className="size-4" />
                添加评分项
              </button>
            </div>

            {estimatorRows.length === 0 ? (
              <div className="campus-empty !py-8">
                <p className="campus-empty-title">暂无评分项</p>
                <p className="campus-empty-desc">先添加作业、期中、期末等评分项，再根据占比计算课程成绩。</p>
              </div>
            ) : (
              <div className="space-y-3">
                {estimatorRows.map((row) => (
                  <div key={row.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:grid-cols-[1.4fr,110px,110px,40px]">
                    <input
                      className="campus-input"
                      value={row.label}
                      onChange={(event) => updateEstimatorRow(row.id, { label: event.target.value })}
                      placeholder="评分项名称"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="campus-input"
                      value={row.weight}
                      onChange={(event) => updateEstimatorRow(row.id, { weight: Number(event.target.value) })}
                      placeholder="占比"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="campus-input"
                      value={row.score}
                      onChange={(event) => updateEstimatorRow(row.id, { score: Number(event.target.value) })}
                      placeholder="分数"
                    />
                    <button
                      type="button"
                      onClick={() => removeEstimatorRow(row.id)}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-red-200 hover:text-red-500"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className="campus-card overflow-hidden">
        <button
          type="button"
          onClick={() => setWhatIfOpen((current) => !current)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div>
            <p className="text-sm font-semibold text-slate-900">GPA 假设推演</p>
            <p className="mt-1 text-xs text-slate-500">修改历史成绩或添加未来课程，查看 GPA 变化，但不会影响正式成绩单。</p>
          </div>
          {whatIfOpen ? <ChevronDown className="size-5 text-slate-400" /> : <ChevronRight className="size-5 text-slate-400" />}
        </button>
        {whatIfOpen ? (
          <div className="border-t border-slate-100 px-5 py-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <span className="campus-chip chip-blue">当前 GPA {whatIfStats.originalGpa.toFixed(2)}</span>
                <span className={`campus-chip ${whatIfStats.delta >= 0 ? "chip-emerald" : "chip-red"}`}>
                  模拟 GPA {whatIfStats.simulatedGpa.toFixed(2)}
                </span>
                <span className={`campus-chip ${whatIfStats.delta >= 0 ? "chip-emerald" : "chip-red"}`}>
                  {whatIfStats.delta >= 0 ? "+" : ""}{whatIfStats.delta.toFixed(2)}
                </span>
              </div>
              <button type="button" onClick={resetWhatIf} className="campus-btn-ghost text-sm">
                重置推演
              </button>
            </div>

            {historicalGrades.length === 0 ? (
              <div className="campus-empty !py-8">
                <p className="campus-empty-title">暂无历史成绩</p>
                <p className="campus-empty-desc">有正式成绩后，这里会支持修改历史成绩和添加未来课程进行模拟。</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="campus-table">
                    <thead>
                      <tr>
                        <th>课程</th>
                        <th>学期</th>
                        <th>学分</th>
                        <th>当前成绩</th>
                        <th>假设成绩</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historicalGrades.map((grade) => (
                        <tr key={grade.id}>
                          <td>
                            <div className="space-y-0.5">
                              <div className="font-medium text-slate-900">{grade.courseCode}</div>
                              <div className="text-xs text-slate-500">{grade.title}</div>
                            </div>
                          </td>
                          <td>{grade.termName}</td>
                          <td>{grade.credits}</td>
                          <td>{grade.finalGrade}</td>
                          <td>
                            <select
                              className="campus-select"
                              value={overrides[grade.id] ?? grade.finalGrade}
                              onChange={(event) =>
                                setOverrides((current) => {
                                  const next = { ...current };
                                  if (event.target.value === grade.finalGrade) {
                                    delete next[grade.id];
                                  } else {
                                    next[grade.id] = event.target.value;
                                  }
                                  return next;
                                })
                              }
                            >
                              {GRADE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">未来课程模拟</p>
                      <p className="mt-1 text-xs text-slate-500">添加未来课程的预期成绩，估算新的累计 GPA。</p>
                    </div>
                    <button type="button" onClick={addFutureRow} className="campus-btn-ghost inline-flex items-center gap-1 text-sm">
                      <Plus className="size-4" />
                      添加未来课程
                    </button>
                  </div>

                  {futureRows.length === 0 ? (
                    <p className="text-sm text-slate-500">暂未添加未来课程。</p>
                  ) : (
                    <div className="space-y-3">
                      {futureRows.map((row) => (
                        <div key={row.id} className="grid gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 md:grid-cols-[120px,140px,40px]">
                          <input
                            type="number"
                            min={1}
                            max={12}
                            className="campus-input"
                            value={row.credits}
                            onChange={(event) => updateFutureRow(row.id, { credits: Number(event.target.value) })}
                            placeholder="学分"
                          />
                          <select
                            className="campus-select"
                            value={row.grade}
                            onChange={(event) => updateFutureRow(row.id, { grade: event.target.value })}
                          >
                            {GRADE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeFutureRow(row.id)}
                            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-red-200 hover:text-red-500"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="mt-3 text-xs text-slate-500">模拟总学分：{whatIfStats.simulatedCredits}</p>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
