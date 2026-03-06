"use client";

import { useState } from "react";

interface EnrollRow {
  studentName?: string;
  studentEmail?: string;
  courseCode?: string;
  courseTitle?: string;
  credits?: number;
  finalGrade?: string | null;
  termName?: string;
}

export default function AllTranscriptsExport({ enrollments }: { enrollments: EnrollRow[] }) {
  const [busy, setBusy] = useState(false);

  function exportAll() {
    setBusy(true);
    const rows = [
      ["Student Name", "Email", "Term", "Course Code", "Course Title", "Credits", "Grade"],
      ...enrollments.map((enrollment) => [
        enrollment.studentName ?? "",
        enrollment.studentEmail ?? "",
        enrollment.termName ?? "",
        enrollment.courseCode ?? "",
        enrollment.courseTitle ?? "",
        String(enrollment.credits ?? ""),
        enrollment.finalGrade ?? ""
      ])
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const anchor = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: `all-transcripts-${new Date().toISOString().slice(0, 10)}.csv`
    });
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={exportAll}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
    >
      {busy ? "Exporting…" : "⬇ All Transcripts CSV"}
    </button>
  );
}
