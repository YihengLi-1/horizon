"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };
type PerfRow = {
  instructorName: string;
  instructorEmail: string;
  sections: number;
  totalStudents: number;
  completedStudents: number;
  droppedStudents: number;
  avgGpa: number | null;
  dropRate: number;
};

type SortKey = "sections" | "totalStudents" | "avgGpa" | "dropRate";

export default function InstructorPerformancePage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [rows, setRows] = useState<PerfRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("totalStudents");
  const [asc, setAsc] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms")
      .then((data) => setTerms(data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const url = termId ? `/admin/instructor-performance?termId=${termId}` : "/admin/instructor-performance";
    void apiFetch<PerfRow[]>(url)
      .then((data) => setRows(data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "SELECT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows
      .filter((r) => !q || r.instructorName.toLowerCase().includes(q) || r.instructorEmail.toLowerCase().includes(q))
      .sort((a, b) => {
        const av = a[sort] ?? -1;
        const bv = b[sort] ?? -1;
        return asc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
      });
  }, [rows, search, sort, asc]);

  const totalSections = rows.reduce((s, r) => s + r.sections, 0);
  const totalStudents = rows.reduce((s, r) => s + r.totalStudents, 0);
  const avgGpaAll = rows.filter((r) => r.avgGpa !== null).length
    ? (rows.reduce((s, r) => s + (r.avgGpa ?? 0), 0) / rows.filter((r) => r.avgGpa !== null).length)
    : null;

  function toggleSort(key: SortKey) {
    if (sort === key) setAsc((v) => !v);
    else { setSort(key); setAsc(false); }
  }

  function sortIcon(key: SortKey) {
    if (sort !== key) return null;
    return asc ? " ↑" : " ↓";
  }

  function exportCsv() {
    const headers = ["教师姓名", "邮箱", "教学班数", "学生总数", "完课数", "退课数", "平均GPA", "退课率%"];
    const csvRows = [
      headers.join(","),
      ...filtered.map((r) =>
        [
          `"${r.instructorName}"`,
          `"${r.instructorEmail}"`,
          r.sections,
          r.totalStudents,
          r.completedStudents,
          r.droppedStudents,
          r.avgGpa !== null ? r.avgGpa.toFixed(2) : "—",
          r.dropRate,
        ].join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `instructor-performance-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">教学质量</p>
        <h1 className="campus-title">教师绩效分析</h1>
        <p className="campus-subtitle">按教师汇总教学班数量、学生规模、完课率与平均GPA</p>
      </section>

      {/* KPIs */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">参与教师</p>
          <p className="campus-kpi-value">{rows.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">总教学班数</p>
          <p className="campus-kpi-value">{totalSections}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">平均 GPA（全体）</p>
          <p className="campus-kpi-value">{avgGpaAll !== null ? avgGpaAll.toFixed(2) : "—"}</p>
        </div>
      </section>

      {/* Toolbar */}
      <div className="campus-toolbar">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <input
            ref={searchRef}
            className="campus-input max-w-xs"
            placeholder="按教师姓名或邮箱筛选… (/)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="campus-select w-48"
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
          >
            <option value="">全部学期</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!filtered.length}
          className="campus-btn-ghost shrink-0 disabled:opacity-40"
        >
          CSV 导出
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {/* Table */}
      <section className="campus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-3">教师</th>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-slate-800"
                  onClick={() => toggleSort("sections")}
                >
                  教学班数{sortIcon("sections")}
                </th>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-slate-800"
                  onClick={() => toggleSort("totalStudents")}
                >
                  学生总数{sortIcon("totalStudents")}
                </th>
                <th className="px-4 py-3">完课 / 退课</th>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-slate-800"
                  onClick={() => toggleSort("avgGpa")}
                >
                  平均 GPA{sortIcon("avgGpa")}
                </th>
                <th
                  className="cursor-pointer px-4 py-3 hover:text-slate-800"
                  onClick={() => toggleSort("dropRate")}
                >
                  退课率{sortIcon("dropRate")}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">加载中…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">暂无数据</td>
                </tr>
              ) : (
                filtered.map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{row.instructorName || "—"}</p>
                      <p className="text-xs text-slate-500">{row.instructorEmail}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">{row.sections}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{row.totalStudents}</td>
                    <td className="px-4 py-3">
                      <span className="text-emerald-600">{row.completedStudents} 完课</span>
                      {" · "}
                      <span className="text-red-500">{row.droppedStudents} 退课</span>
                    </td>
                    <td className="px-4 py-3">
                      {row.avgGpa !== null ? (
                        <span className={`font-semibold ${row.avgGpa >= 3.5 ? "text-emerald-600" : row.avgGpa >= 2.5 ? "text-blue-600" : "text-red-600"}`}>
                          {row.avgGpa.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-slate-100">
                          <div
                            className={`h-1.5 rounded-full ${row.dropRate > 20 ? "bg-red-400" : row.dropRate > 10 ? "bg-amber-400" : "bg-emerald-400"}`}
                            style={{ width: `${Math.min(100, row.dropRate)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-600">{row.dropRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 ? (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            共 {filtered.length} 位教师
          </p>
        ) : null}
      </section>
    </div>
  );
}
