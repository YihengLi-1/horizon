"use client";

type RosterRow = {
  id: string;
  status: string;
  finalGrade?: string | null;
  student?: {
    email?: string;
    studentId?: string | null;
    studentProfile?: {
      legalName?: string;
    } | null;
  } | null;
};

export default function RosterExport({ rows }: { rows: RosterRow[] }) {
  const onExport = () => {
    const csv = [
      ["name", "email", "studentId", "status", "grade"],
      ...rows.map((row) => [
        row.student?.studentProfile?.legalName ?? "",
        row.student?.email ?? "",
        row.student?.studentId ?? "",
        row.status,
        row.finalGrade ?? ""
      ])
    ]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(","))
      .join("\n");

    const link = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: "section-roster.csv"
    });
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <button
      type="button"
      onClick={onExport}
      className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
    >
      导出 CSV
    </button>
  );
}
