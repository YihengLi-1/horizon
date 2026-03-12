"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type CohortRow = {
  year: string;
  total: number;
  active: number;
  retentionPct: number;
  completedPct: number;
  avgGpa: number | null;
};

export default function CohortChart() {
  const [rows, setRows] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<CohortRow[]>("/admin/cohort-analytics")
      .then((data) => setRows(data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-32 animate-pulse rounded-xl bg-slate-100" />;
  if (rows.length === 0) return null;

  return (
    <div className="campus-card overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-700">Cohort Retention Analysis</p>
        <p className="text-xs text-slate-400 mt-0.5">Students grouped by registration year</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {["Cohort", "Students", "Active", "Retention", "Completed ≥1", "Avg GPA"].map((h) => (
                <th key={h} scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.year} className="border-t border-slate-50 hover:bg-slate-50/60">
                <td className="px-4 py-3 font-bold text-slate-900">{row.year}</td>
                <td className="px-4 py-3 text-slate-700">{row.total}</td>
                <td className="px-4 py-3 text-emerald-700 font-semibold">{row.active}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${row.retentionPct >= 70 ? "bg-emerald-500" : row.retentionPct >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${row.retentionPct}%` }}
                      />
                    </div>
                    <span className={`text-xs font-semibold ${row.retentionPct >= 70 ? "text-emerald-700" : row.retentionPct >= 40 ? "text-amber-700" : "text-red-700"}`}>
                      {row.retentionPct}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-semibold text-indigo-700">{row.completedPct}%</span>
                </td>
                <td className="px-4 py-3">
                  {row.avgGpa != null ? (
                    <span className={`text-sm font-bold ${row.avgGpa >= 3.5 ? "text-emerald-700" : row.avgGpa >= 3.0 ? "text-blue-700" : row.avgGpa >= 2.0 ? "text-amber-700" : "text-red-700"}`}>
                      {row.avgGpa.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
