"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type InstructorRow = {
  name: string;
  sectionCount: number;
  totalEnrolled: number;
  totalCompleted: number;
  depts: string[];
  ratingCount: number;
  avgRating: number | null;
  avgDifficulty: number | null;
  avgWorkload: number | null;
  recommendPct: number | null;
};

function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  const full = Math.round(value);
  return (
    <span className="text-amber-400 text-xs" title={value.toFixed(2)}>
      {"★".repeat(full)}{"☆".repeat(5 - full)}
      <span className="ml-1 text-slate-600 font-semibold">{value.toFixed(1)}</span>
    </span>
  );
}

function Bar({ value, max, color }: { value: number | null; max: number; color: string }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-700">{value.toFixed(1)}</span>
    </div>
  );
}

type SortKey = "sectionCount" | "totalEnrolled" | "avgRating" | "avgDifficulty" | "recommendPct";

export default function InstructorAnalyticsPage() {
  const [rows, setRows] = useState<InstructorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("sectionCount");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    apiFetch<InstructorRow[]>("/admin/instructors/analytics")
      .then((data) => setRows(data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let filtered = rows.filter((r) =>
      !q || r.name.toLowerCase().includes(q) || r.depts.some((d) => d.toLowerCase().includes(q))
    );
    filtered = [...filtered].sort((a, b) => {
      const av = a[sort] ?? -Infinity;
      const bv = b[sort] ?? -Infinity;
      return dir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
    return filtered;
  }, [rows, search, sort, dir]);

  function toggleSort(key: SortKey) {
    if (sort === key) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSort(key); setDir("desc"); }
  }

  const totalSections = rows.reduce((sum, r) => sum + r.sectionCount, 0);
  const totalEnrolled = rows.reduce((sum, r) => sum + r.totalEnrolled, 0);
  const rated = rows.filter((r) => r.ratingCount > 0);
  const avgGlobalRating = rated.length
    ? rated.reduce((sum, r) => sum + (r.avgRating ?? 0), 0) / rated.length
    : null;

  const Th = ({ label, sk }: { label: string; sk: SortKey }) => (
    <th
      scope="col"
      className="cursor-pointer px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800 select-none"
      onClick={() => toggleSort(sk)}
    >
      {label} {sort === sk ? (dir === "desc" ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <h1 className="text-2xl font-bold text-slate-900">Instructor Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">Teaching load, ratings, and student outcomes by instructor</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Instructors</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{rows.length}</p>
        </div>
        <div className="campus-kpi border-indigo-200 bg-indigo-50/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Total Sections</p>
          <p className="mt-1 text-2xl font-bold text-indigo-900">{totalSections}</p>
        </div>
        <div className="campus-kpi border-emerald-200 bg-emerald-50/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Avg Rating</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">
            {avgGlobalRating != null ? avgGlobalRating.toFixed(2) : "—"}
          </p>
          {avgGlobalRating != null ? (
            <p className="text-xs text-emerald-600">across {totalEnrolled} enrolled</p>
          ) : null}
        </div>
      </div>

      <div className="campus-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <input
            type="search"
            placeholder="Search instructor or dept…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="campus-input h-9 w-64 text-sm"
          />
          <p className="ml-auto text-xs text-slate-400">{sorted.length} instructor(s)</p>
        </div>

        {loading ? (
          <div className="px-4 py-12 text-center text-slate-400">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="px-4 py-12 text-center text-slate-400">No instructors found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Instructor</th>
                  <Th label="Sections" sk="sectionCount" />
                  <Th label="Enrolled" sk="totalEnrolled" />
                  <Th label="Rating" sk="avgRating" />
                  <Th label="Difficulty" sk="avgDifficulty" />
                  <Th label="Recommend" sk="recommendPct" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.name} className="border-t border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{row.name}</p>
                      {row.depts.length > 0 ? (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {row.depts.map((d) => (
                            <span key={d} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">{d}</span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{row.sectionCount}</p>
                      {row.totalCompleted > 0 ? (
                        <p className="text-[10px] text-slate-400">{row.totalCompleted} completed</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{row.totalEnrolled}</td>
                    <td className="px-4 py-3">
                      <Stars value={row.avgRating} />
                      {row.ratingCount > 0 ? (
                        <p className="text-[10px] text-slate-400">{row.ratingCount} review(s)</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Bar value={row.avgDifficulty} max={5} color="bg-rose-400" />
                    </td>
                    <td className="px-4 py-3">
                      {row.recommendPct != null ? (
                        <span className={`text-sm font-semibold ${row.recommendPct >= 70 ? "text-emerald-600" : row.recommendPct >= 40 ? "text-amber-600" : "text-red-600"}`}>
                          {row.recommendPct}%
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
        )}
      </div>
    </div>
  );
}
