"use client";

import { useState } from "react";

const GP: Record<string, number> = {
  "A+": 4, A: 4, "A-": 3.7,
  "B+": 3.3, B: 3, "B-": 2.7,
  "C+": 2.3, C: 2, "C-": 1.7,
  "D+": 1.3, D: 1, "D-": 0.7,
  F: 0
};

type GradeEntry = {
  code: string;
  credits: number;
  grade: string;
};

type CurrentEnrollment = {
  code: string;
  credits: number;
};

function computeGPA(entries: GradeEntry[]): number | null {
  const valid = entries.filter((e) => e.grade in GP && e.credits > 0);
  if (!valid.length) return null;
  const wp = valid.reduce((s, e) => s + GP[e.grade] * e.credits, 0);
  const tc = valid.reduce((s, e) => s + e.credits, 0);
  return Math.round((wp / tc) * 1000) / 1000;
}

type Props = {
  currentGpa: number | null;
  completedCredits: number;
  currentEnrollments: CurrentEnrollment[];
};

export default function DropImpactCalc({ currentGpa, completedCredits, currentEnrollments }: Props) {
  const [open, setOpen] = useState(false);
  // For each current enrollment: null = keep (enter grade), "W" = drop
  const [scenarios, setScenarios] = useState<Array<{ grade: string; drop: boolean }>>(
    () => currentEnrollments.map(() => ({ grade: "B", drop: false }))
  );

  if (currentEnrollments.length === 0) return null;

  function updateScenario(idx: number, patch: Partial<{ grade: string; drop: boolean }>) {
    setScenarios((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  // Build simulated entry list
  const historicWeight = currentGpa != null ? currentGpa * completedCredits : 0;
  const historicCredits = completedCredits;

  const projectedEntries: Array<{ credits: number; gradePoints: number }> = [];
  for (let i = 0; i < currentEnrollments.length; i++) {
    const sc = scenarios[i];
    if (sc.drop) continue; // W = no credits, no GPA impact
    const gp = GP[sc.grade];
    if (gp === undefined) continue;
    projectedEntries.push({ credits: currentEnrollments[i].credits, gradePoints: gp });
  }

  const addedWP = projectedEntries.reduce((s, e) => s + e.gradePoints * e.credits, 0);
  const addedCr = projectedEntries.reduce((s, e) => s + e.credits, 0);

  const totalWP = historicWeight + addedWP;
  const totalCr = historicCredits + addedCr;
  const projectedGpa = totalCr > 0 ? Math.round((totalWP / totalCr) * 1000) / 1000 : null;

  const gpaDelta = projectedGpa != null && currentGpa != null ? projectedGpa - currentGpa : null;

  let totalDroppedCredits = 0;
  for (let i = 0; i < scenarios.length; i++) {
    if (scenarios[i].drop) totalDroppedCredits += currentEnrollments[i].credits;
  }

  return (
    <div className="campus-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div>
          <p className="text-sm font-semibold text-slate-800">Drop Impact Calculator</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Simulate how dropping courses or earning different grades affects your GPA
          </p>
        </div>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {/* Baseline */}
          <div className="flex flex-wrap gap-4 rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <span className="text-slate-600">
              Current GPA: <strong className="text-slate-900">{currentGpa?.toFixed(2) ?? "—"}</strong>
            </span>
            <span className="text-slate-600">
              Completed Credits: <strong className="text-slate-900">{completedCredits}</strong>
            </span>
          </div>

          {/* Per-enrollment rows */}
          <div className="space-y-2">
            {currentEnrollments.map((enr, idx) => (
              <div key={enr.code} className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 ${scenarios[idx].drop ? "border-amber-200 bg-amber-50/50" : "border-slate-100"}`}>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{enr.code}</p>
                  <p className="text-xs text-slate-500">{enr.credits} credits</p>
                </div>

                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={scenarios[idx].drop}
                    onChange={(e) => updateScenario(idx, { drop: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-amber-700 font-medium">Drop (W)</span>
                </label>

                {!scenarios[idx].drop && (
                  <select
                    value={scenarios[idx].grade}
                    onChange={(e) => updateScenario(idx, { grade: e.target.value })}
                    className="campus-select h-8 w-24 text-sm"
                  >
                    {Object.keys(GP).map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>

          {/* Result */}
          <div className={`rounded-xl border-2 px-5 py-4 ${gpaDelta == null ? "border-slate-200" : gpaDelta >= 0 ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Projected GPA</p>
                <p className={`mt-1 text-3xl font-bold ${gpaDelta == null ? "text-slate-400" : gpaDelta >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {projectedGpa?.toFixed(2) ?? "—"}
                </p>
              </div>
              {gpaDelta != null && (
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Change</p>
                  <p className={`mt-1 text-xl font-bold ${gpaDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {gpaDelta >= 0 ? "+" : ""}{gpaDelta.toFixed(3)}
                  </p>
                </div>
              )}
              {totalDroppedCredits > 0 && (
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Dropped Credits</p>
                  <p className="mt-1 text-xl font-bold text-amber-700">{totalDroppedCredits}</p>
                  <p className="text-[10px] text-amber-600">W grades (no GPA impact)</p>
                </div>
              )}
            </div>

            {projectedGpa != null && (
              <div className="mt-2 text-xs text-slate-500">
                {projectedGpa >= 3.5 ? "🏆 Dean's List territory" :
                 projectedGpa >= 3.0 ? "✅ Good Standing" :
                 projectedGpa >= 2.0 ? "⚠️ Satisfactory — watch your GPA" :
                 "🚨 Academic Probation risk — consider your options"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
