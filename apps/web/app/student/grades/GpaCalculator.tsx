"use client";

import { useState } from "react";

const GP: Record<string, number> = {
  "A+": 4,
  A: 4,
  "A-": 3.7,
  "B+": 3.3,
  B: 3,
  "B-": 2.7,
  "C+": 2.3,
  C: 2,
  "C-": 1.7,
  "D+": 1.3,
  D: 1,
  "D-": 0.7,
  F: 0
};

const GRADES = Object.keys(GP);

function calcGpa(rows: { credits: number; grade: string }[]) {
  const valid = rows.filter((row) => row.grade in GP && row.credits > 0);
  if (!valid.length) return null;
  return Math.round(
    (valid.reduce((sum, row) => sum + GP[row.grade] * row.credits, 0) /
      valid.reduce((sum, row) => sum + row.credits, 0)) *
      1000
  ) / 1000;
}

type Row = { code: string; credits: number; grade: string };

export default function GpaCalculator() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([
    { code: "Course 1", credits: 3, grade: "A" },
    { code: "Course 2", credits: 3, grade: "B" }
  ]);

  const gpa = calcGpa(rows);
  const tier =
    gpa === null
      ? null
      : gpa >= 3.7
        ? "🏆 Dean's List"
        : gpa >= 3
          ? "✅ Good Standing"
          : gpa >= 2
            ? "⚠️ Satisfactory"
            : "🚨 Warning";
  const tierCls =
    gpa === null
      ? ""
      : gpa >= 3.7
        ? "text-emerald-600"
        : gpa >= 3
          ? "text-blue-600"
          : gpa >= 2
            ? "text-amber-600"
            : "text-red-600";

  function update(index: number, key: keyof Row, value: string | number) {
    setRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
      >
        🧮 GPA Calculator
      </button>
    );
  }

  return (
    <div className="campus-card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">GPA What-If Calculator</p>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">
          ✕ Close
        </button>
      </div>
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            value={row.code}
            onChange={(event) => update(index, "code", event.target.value)}
            className="campus-input flex-1 text-sm"
            placeholder="Course"
          />
          <input
            type="number"
            value={row.credits}
            min={1}
            max={6}
            onChange={(event) => update(index, "credits", Number(event.target.value))}
            className="campus-input w-16 text-sm"
          />
          <select
            value={row.grade}
            onChange={(event) => update(index, "grade", event.target.value)}
            className="campus-select text-sm"
          >
            {GRADES.map((grade) => (
              <option key={grade}>{grade}</option>
            ))}
          </select>
          <button onClick={() => setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))} className="text-red-400 hover:text-red-600">
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() => setRows((prev) => [...prev, { code: `Course ${prev.length + 1}`, credits: 3, grade: "A" }])}
        className="text-xs font-medium text-blue-600 hover:underline"
      >
        + Add course
      </button>
      {gpa !== null ? (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{gpa.toFixed(3)}</p>
          <p className={`text-sm font-semibold ${tierCls}`}>{tier}</p>
        </div>
      ) : null}
    </div>
  );
}
