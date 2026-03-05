"use client";

type AuditExportRow = {
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorLabel: string;
};

export default function AuditExportButton({ rows }: { rows: AuditExportRow[] }) {
  const exportCsv = () => {
    const csvRows = [
      ["Timestamp", "Action", "Entity Type", "Entity ID", "User"],
      ...rows.map((row) => [row.createdAt, row.action, row.entityType, row.entityId ?? "", row.actorLabel])
    ];
    const csv = csvRows
      .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={exportCsv}
      disabled={rows.length === 0}
      className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      Export CSV
    </button>
  );
}
