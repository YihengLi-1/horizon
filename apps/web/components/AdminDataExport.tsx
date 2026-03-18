"use client";

import { useState } from "react";

const ENDPOINTS = [
  { name: "students", url: "/admin/students" },
  { name: "enrollments", url: "/admin/enrollments?limit=9999" },
  { name: "sections", url: "/admin/sections" },
  { name: "courses", url: "/admin/courses" },
  { name: "terms", url: "/admin/terms" }
];

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.map((key) => `"${key}"`).join(","),
    ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","))
  ].join("\n");
}

export default function AdminDataExport({ apiUrl }: { apiUrl: string }) {
  const [busy, setBusy] = useState(false);

  async function exportAll() {
    setBusy(true);
    try {
      for (const endpoint of ENDPOINTS) {
        try {
          const response = await fetch(`${apiUrl}${endpoint.url}`, { credentials: "include" });
          if (!response.ok) continue;
          const data = await response.json();
          const rows = Array.isArray(data) ? data : (data.data ?? data.items ?? []);
          const anchor = Object.assign(document.createElement("a"), {
            href: URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" })),
            download: `sis-${endpoint.name}-${new Date().toISOString().slice(0, 10)}.csv`
          });
          anchor.click();
          URL.revokeObjectURL(anchor.href);
          await new Promise((resolve) => setTimeout(resolve, 300));
        } catch {
          // Skip failed endpoint without blocking the rest.
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={() => void exportAll()}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
    >
      {busy ? "导出中…" : "⬇ 导出全部数据"}
    </button>
  );
}
