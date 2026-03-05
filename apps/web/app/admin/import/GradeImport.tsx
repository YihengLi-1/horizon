"use client";

import { useRef, useState } from "react";

interface GradeRow {
  studentId: string;
  sectionId: string;
  grade: string;
}

function parseCsv(text: string): GradeRow[] {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((header) => header.replace(/"/g, "").trim().toLowerCase());
  return lines
    .slice(1)
    .map((line) => {
      const values = line.split(",").map((value) => value.replace(/"/g, "").trim());
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ?? "";
      });
      return {
        studentId: row.studentid ?? row["student id"] ?? "",
        sectionId: row.sectionid ?? row["section id"] ?? "",
        grade: row.grade ?? row.finalgrade ?? ""
      };
    })
    .filter((row) => row.studentId && row.sectionId && row.grade);
}

export default function GradeImport({ apiUrl }: { apiUrl: string }) {
  const [rows, setRows] = useState<GradeRow[]>([]);
  const [result, setResult] = useState<{ ok: number; failed: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setRows(parseCsv(String(loadEvent.target?.result ?? "")));
      setResult(null);
    };
    reader.readAsText(file);
  }

  async function submit() {
    setBusy(true);
    let ok = 0;
    let failed = 0;

    try {
      for (const row of rows) {
        try {
          const response = await fetch(`${apiUrl}/admin/enrollments/grade`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(row)
          });
          if (response.ok) ok += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }
    } finally {
      setResult({ ok, failed });
      setBusy(false);
    }
  }

  return (
    <div className="campus-card p-4 space-y-4">
      <p className="text-sm font-semibold text-slate-700">📥 Bulk Grade Import (CSV)</p>
      <p className="text-xs text-slate-500">
        CSV columns: <code>studentId, sectionId, grade</code>
      </p>
      <input ref={fileRef} type="file" accept=".csv" onChange={onFile} className="text-sm text-slate-600" />
      {rows.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">{rows.length} rows parsed</p>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 text-xs font-mono">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-1 text-left">StudentID</th>
                  <th className="px-2 py-1 text-left">SectionID</th>
                  <th className="px-2 py-1 text-left">Grade</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((row, index) => (
                  <tr key={index} className="border-t border-slate-100">
                    <td className="px-2 py-1">{row.studentId}</td>
                    <td className="px-2 py-1">{row.sectionId}</td>
                    <td className="px-2 py-1 font-semibold">{row.grade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? `Uploading… (${rows.length} rows)` : "Upload Grades"}
          </button>
        </div>
      ) : null}
      {result ? (
        <div
          className={`rounded-lg border p-3 text-sm ${
            result.failed ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          ✅ {result.ok} updated, {result.failed} failed
        </div>
      ) : null}
    </div>
  );
}
