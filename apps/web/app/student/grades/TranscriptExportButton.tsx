"use client";

import type { GradeItem } from "./page";

interface Props {
  grades: GradeItem[];
}

const GRADE_POINTS: Record<string, number> = {
  "A+": 4.0,
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.3,
  C: 2.0,
  "C-": 1.7,
  "D+": 1.3,
  D: 1.0,
  "D-": 0.7,
  F: 0.0
};

function gradePoints(grade: string | null | undefined): number | null {
  if (!grade) return null;
  return GRADE_POINTS[grade.trim().toUpperCase()] ?? null;
}

export default function TranscriptExportButton({ grades }: Props) {
  function handleExport() {
    const rows = [
      ["Term", "Course Code", "Course Title", "Credits", "Grade", "Grade Points", "Contribution"],
      ...grades.map((g) => {
        const points = gradePoints(g.finalGrade);
        const credits = g.section.credits ?? null;
        return [
          g.term.name ?? "",
          g.section.course.code ?? "",
          g.section.course.title ?? "",
          String(credits ?? ""),
          g.finalGrade ?? "IP",
          points != null ? String(points) : "",
          points != null && credits != null ? String((points * credits).toFixed(2)) : ""
        ];
      })
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcript.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
    >
      ⬇ Export Transcript
    </button>
  );
}
