"use client";

type GradeRow = {
  term: string;
  courseCode: string;
  courseTitle: string;
  credits: number;
  grade: string;
  points: string;
};

export function GradesCsvButton({ rows, gpa }: { rows: GradeRow[]; gpa: string }) {
  const handleExport = () => {
    const headers = ["Term", "Course Code", "Course Title", "Credits", "Grade", "Grade Points"];
    const csvRows = [
      headers.join(","),
      ...rows.map((r) =>
        [
          `"${r.term.replace(/"/g, '""')}"`,
          r.courseCode,
          `"${r.courseTitle.replace(/"/g, '""')}"`,
          r.credits,
          r.grade,
          r.points
        ].join(",")
      ),
      "",
      `"Cumulative GPA",${gpa}`
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transcript-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={rows.length === 0}
      className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/35 bg-white/90 px-4 text-sm font-semibold text-slate-800 transition hover:bg-white disabled:opacity-50"
    >
      ↓ Export Transcript
    </button>
  );
}
