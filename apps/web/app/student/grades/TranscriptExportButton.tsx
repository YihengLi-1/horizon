"use client";

import { GRADE_POINTS } from "@sis/shared/constants";
import type { GradeItem } from "./page";

interface Props {
  grades: GradeItem[];
}

function gradePoints(grade: string | null | undefined): number | null {
  if (!grade) return null;
  return GRADE_POINTS[grade.trim().toUpperCase()] ?? null;
}

export default function TranscriptExportButton({ grades }: Props) {
  function handleExport() {
    const rows = [
      ["学期", "课程代码", "课程名称", "学分", "成绩", "绩点", "贡献"],
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
      ⬇ 导出成绩单
    </button>
  );
}
