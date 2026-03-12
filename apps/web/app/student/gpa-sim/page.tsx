"use client";

import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";

const GP: Record<string, number> = {
  "A+": 4, A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7,
  "C+": 2.3, C: 2, "C-": 1.7, "D+": 1.3, D: 1, "D-": 0.7, F: 0
};
const GRADES = Object.keys(GP);

type GradeEnrollment = {
  id: string;
  finalGrade: string | null;
  status: string;
  section: { credits: number };
};

type FutureRow = { id: string; label: string; credits: number; grade: string };

function standingLabel(gpa: number | null): { label: string; cls: string } {
  if (gpa == null) return { label: "—", cls: "text-slate-400" };
  if (gpa >= 3.7) return { label: "🏆 Dean's List", cls: "text-emerald-600" };
  if (gpa >= 3.0) return { label: "✅ Good Standing", cls: "text-blue-600" };
  if (gpa >= 2.0) return { label: "⚠️ Satisfactory", cls: "text-amber-600" };
  return { label: "🚨 Academic Probation", cls: "text-red-600" };
}

function calcGpa(weightedPoints: number, totalCredits: number): number | null {
  if (totalCredits <= 0) return null;
  return Math.round((weightedPoints / totalCredits) * 1000) / 1000;
}

// How many credits of grade X needed to reach target GPA?
function neededToReach(currentWP: number, currentCr: number, targetGpa: number, grade: string): number | null {
  const pts = GP[grade];
  if (pts === undefined || pts >= targetGpa) return null;
  // (currentWP + pts * x) / (currentCr + x) = targetGpa
  // currentWP + pts * x = targetGpa * currentCr + targetGpa * x
  // currentWP - targetGpa * currentCr = (targetGpa - pts) * x
  // x = (currentWP - targetGpa * currentCr) / (targetGpa - pts)
  if (targetGpa - pts <= 0) return null;
  const x = (targetGpa * currentCr - currentWP) / (pts - targetGpa);
  if (x <= 0) return null; // already there
  return Math.ceil(x);
}

export default function GpaSimPage() {
  const [grades, setGrades] = useState<GradeEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<FutureRow[]>([
    { id: "r1", label: "未来课程 1", credits: 3, grade: "A" },
    { id: "r2", label: "未来课程 2", credits: 3, grade: "B+" }
  ]);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<GradeEnrollment[]>("/registration/grades");
      setGrades(data.filter((g) => g.status === "COMPLETED" && g.finalGrade));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Compute historic weighted points and credits
  const { historicWP, historicCr } = useMemo(() => {
    let wp = 0, cr = 0;
    for (const g of grades) {
      const pts = GP[g.finalGrade ?? ""];
      if (pts !== undefined && g.section.credits > 0) {
        wp += pts * g.section.credits;
        cr += g.section.credits;
      }
    }
    return { historicWP: wp, historicCr: cr };
  }, [grades]);

  const currentGpa = useMemo(() => calcGpa(historicWP, historicCr), [historicWP, historicCr]);

  const { projectedWP, projectedCr } = useMemo(() => {
    let wp = historicWP, cr = historicCr;
    for (const r of rows) {
      const pts = GP[r.grade];
      if (pts !== undefined && r.credits > 0) {
        wp += pts * r.credits;
        cr += r.credits;
      }
    }
    return { projectedWP: wp, projectedCr: cr };
  }, [historicWP, historicCr, rows]);

  const projectedGpa = useMemo(() => calcGpa(projectedWP, projectedCr), [projectedWP, projectedCr]);
  const gpaDelta = projectedGpa != null && currentGpa != null
    ? Math.round((projectedGpa - currentGpa) * 1000) / 1000
    : null;

  const futureCredits = rows.reduce((s, r) => s + r.credits, 0);

  function updateRow(id: string, key: keyof FutureRow, value: string | number) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [key]: value } : r));
  }
  function addRow() {
    setRows((prev) => [...prev, { id: Date.now().toString(), label: `未来课程 ${prev.length + 1}`, credits: 3, grade: "B" }]);
  }
  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  const current = standingLabel(currentGpa);
  const projected = standingLabel(projectedGpa);

  // Target GPA suggestions
  const targets = [
    { label: "Dean's List (3.7)", target: 3.7 },
    { label: "Good Standing (3.0)", target: 3.0 }
  ].filter((t) => currentGpa == null || currentGpa < t.target);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业规划</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">GPA 预测模拟器</h1>
        <p className="mt-1 text-sm text-slate-600 md:text-base">
          基于您的真实成绩，模拟未来选课对累积绩点的影响。
        </p>
      </section>

      {/* Current status */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">已修学分</p>
          <p className="campus-kpi-value">{historicCr}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">当前 GPA</p>
          <p className={`campus-kpi-value ${current.cls}`}>{currentGpa?.toFixed(3) ?? "—"}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">模拟后 GPA</p>
          <p className={`campus-kpi-value ${projected.cls}`}>{projectedGpa?.toFixed(3) ?? "—"}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">GPA 变化</p>
          <p className={`campus-kpi-value ${gpaDelta == null ? "text-slate-400" : gpaDelta > 0 ? "text-emerald-600" : gpaDelta < 0 ? "text-red-600" : "text-slate-600"}`}>
            {gpaDelta == null ? "—" : `${gpaDelta > 0 ? "+" : ""}${gpaDelta.toFixed(3)}`}
          </p>
        </div>
      </div>

      {/* Standing comparison */}
      {currentGpa != null && projectedGpa != null && (
        <section className={`campus-card p-4 flex flex-wrap items-center gap-3 ${projected.cls.includes("emerald") ? "border-l-4 border-l-emerald-400" : projected.cls.includes("red") ? "border-l-4 border-l-red-400" : "border-l-4 border-l-blue-300"}`}>
          <div className="flex-1">
            <p className="text-sm text-slate-500">当前学业状态 → 模拟后状态</p>
            <p className="text-base font-semibold">
              <span className={current.cls}>{current.label}</span>
              <span className="mx-2 text-slate-400">→</span>
              <span className={projected.cls}>{projected.label}</span>
            </p>
          </div>
          <div className="text-sm text-slate-500">
            模拟课程：{rows.length} 门 / {futureCredits} 学分
          </div>
        </section>
      )}

      {/* Future course editor */}
      <section className="campus-card p-5 space-y-4">
        <h2 className="text-base font-semibold text-slate-800">模拟未来课程</h2>
        <p className="text-xs text-slate-500">输入您计划选择的课程及预期成绩，查看对 GPA 的影响。</p>

        {loading ? (
          <p className="text-sm text-slate-400">加载历史成绩…</p>
        ) : grades.length === 0 ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
            暂无已修课程记录，以下模拟将基于未来课程独立计算绩点。
          </div>
        ) : null}

        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2">
              <input
                className="campus-input flex-1 min-w-[140px] text-sm"
                value={r.label}
                onChange={(e) => updateRow(r.id, "label", e.target.value)}
                placeholder="课程名称"
              />
              <input
                type="number"
                className="campus-input w-16 text-sm"
                value={r.credits}
                min={1}
                max={6}
                onChange={(e) => updateRow(r.id, "credits", Math.max(1, Number(e.target.value)))}
              />
              <span className="text-xs text-slate-400">学分</span>
              <select
                className="campus-select text-sm"
                value={r.grade}
                onChange={(e) => updateRow(r.id, "grade", e.target.value)}
              >
                {GRADES.map((g) => <option key={g}>{g}</option>)}
              </select>
              {rows.length > 1 && (
                <button onClick={() => removeRow(r.id)} className="text-slate-300 hover:text-red-500 text-lg leading-none">✕</button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={addRow}
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          + 添加课程
        </button>
      </section>

      {/* Target GPA helpers */}
      {targets.length > 0 && historicCr > 0 && (
        <section className="campus-card p-5 space-y-3">
          <h2 className="text-base font-semibold text-slate-800">达成目标需要多少学分？</h2>
          <p className="text-xs text-slate-500">以下为达成各学业目标所需的最低学分估算（基于当前累积成绩）：</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {targets.map((t) => (
              <div key={t.label} className="rounded-lg border border-slate-200 p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-700">{t.label}</p>
                <div className="space-y-1">
                  {["A", "A-", "B+", "B"].map((g) => {
                    const needed = neededToReach(historicWP, historicCr, t.target, g);
                    if (needed == null) return null;
                    return (
                      <div key={g} className="flex justify-between text-xs">
                        <span className="text-slate-500">全拿 {g}</span>
                        <span className="font-semibold text-slate-800">{needed} 学分</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Visual GPA bar */}
      {projectedGpa != null && (
        <section className="campus-card p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">绩点可视化（满分 4.0）</h2>
          <div className="space-y-2">
            {[
              { label: "当前 GPA", gpa: currentGpa, cls: "bg-slate-400" },
              { label: "模拟后 GPA", gpa: projectedGpa, cls: "bg-indigo-500" }
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>{item.label}</span>
                  <span className="font-semibold">{item.gpa?.toFixed(3) ?? "—"}</span>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all ${item.cls}`}
                    style={{ width: item.gpa ? `${Math.min(100, (item.gpa / 4) * 100)}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-400">
            <span>0.0</span>
            <span>2.0 (Satisfactory)</span>
            <span>3.0 (Good)</span>
            <span>3.7 (Dean's)</span>
            <span>4.0</span>
          </div>
        </section>
      )}
    </div>
  );
}
