"use client";

/**
 * Admin Cohort Analytics
 * Groups students by programMajor, shows GPA, credit completion, active count.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };

type CohortRow = {
  major: string;
  studentCount: number;
  avgGpa: number;
  totalCredits: number;
  activeCount: number;
  completedCount: number;
};

export default function CohortAnalyticsPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [data, setData] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<keyof CohortRow>("studentCount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms")
      .then((d) => setTerms((d ?? []).sort((a, b) => b.name.localeCompare(a.name))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setData([]);
    setError("");
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    void apiFetch<CohortRow[]>(`/admin/cohort-by-major?${params}`)
      .then((d) => setData(d ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId]);

  function toggleSort(key: keyof CohortRow) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = [...data].sort((a, b) => {
    const va = a[sortKey], vb = b[sortKey];
    const cmp = typeof va === "number" ? (va as number) - (vb as number) : String(va).localeCompare(String(vb));
    return sortDir === "desc" ? -cmp : cmp;
  });

  const maxStudents = Math.max(1, ...data.map((r) => r.studentCount));
  const totalStudents = data.reduce((s, r) => s + r.studentCount, 0);
  const avgGpaAll = data.length ? (data.reduce((s, r) => s + r.avgGpa * r.studentCount, 0) / Math.max(1, totalStudents)) : 0;

  function col(key: keyof CohortRow, label: string, extra = "") {
    const active = sortKey === key;
    return (
      <th
        onClick={() => toggleSort(key)}
        className={`cursor-pointer select-none pb-2 font-semibold text-xs ${extra} ${active ? "text-indigo-600" : "text-slate-500"}`}
      >
        {label} {active ? (sortDir === "desc" ? "↓" : "↑") : ""}
      </th>
    );
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Cohort Analytics</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">专业群体分析</h1>
        <p className="mt-1 text-sm text-slate-500">按专业方向统计学生数量、GPA、学分完成及活跃状态</p>
      </section>

      <div className="campus-toolbar flex-wrap gap-2">
        <select className="campus-select" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">所有学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {!loading && data.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="campus-kpi">
            <p className="campus-kpi-label">专业数</p>
            <p className="campus-kpi-value text-indigo-600">{data.length}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">总学生数</p>
            <p className="campus-kpi-value">{totalStudents}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">综合 GPA</p>
            <p className="campus-kpi-value text-emerald-600">{avgGpaAll.toFixed(2)}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">总学分完成</p>
            <p className="campus-kpi-value">{data.reduce((s, r) => s + r.totalCredits, 0)}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : sorted.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">暂无数据</div>
      ) : (
        <div className="campus-card overflow-hidden">
          {/* Bar chart */}
          <div className="p-4 border-b border-slate-100 space-y-2">
            <h2 className="text-sm font-bold text-slate-900 mb-3">各专业学生数量对比</h2>
            {data.sort((a, b) => b.studentCount - a.studentCount).slice(0, 10).map((r) => (
              <div key={r.major}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="truncate max-w-[200px] text-slate-700 font-medium">{r.major}</span>
                  <span className="text-slate-500 ml-2 shrink-0">{r.studentCount} 人 · GPA {r.avgGpa.toFixed(2)}</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${(r.studentCount / maxStudents) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  {col("major", "专业", "text-left pl-4")}
                  {col("studentCount", "学生数", "text-right pr-3")}
                  {col("activeCount", "在读", "text-right pr-3")}
                  {col("completedCount", "结课人次", "text-right pr-3")}
                  {col("avgGpa", "均 GPA", "text-right pr-3")}
                  {col("totalCredits", "总学分", "text-right pr-4")}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.major} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 pl-4 pr-3 font-medium text-slate-800">{r.major}</td>
                    <td className="py-2.5 pr-3 text-right font-bold text-indigo-700">{r.studentCount}</td>
                    <td className="py-2.5 pr-3 text-right text-emerald-600">{r.activeCount}</td>
                    <td className="py-2.5 pr-3 text-right text-slate-500">{r.completedCount}</td>
                    <td className="py-2.5 pr-3 text-right">
                      <span className={r.avgGpa >= 3.5 ? "text-emerald-600 font-bold" : r.avgGpa >= 2.5 ? "text-amber-600" : "text-red-600"}>
                        {r.avgGpa.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-slate-600">{r.totalCredits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
