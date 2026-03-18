"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type CohortRow = {
  major: string;
  studentCount: number;
  avgGpa: number;
  totalCredits: number;
  activeCount: number;
  completedCount: number;
};

type Term = { id: string; name: string };
type SortKey = "studentCount" | "avgGpa" | "totalCredits" | "activeCount";

export default function CohortAnalyticsPage() {
  const [rows, setRows] = useState<CohortRow[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("studentCount");

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    void apiFetch<CohortRow[]>(`/admin/cohort-by-major?${params}`)
      .then((d) => setRows(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId]);

  const sorted = useMemo(() => {
    const q = search.toLowerCase();
    return rows
      .filter((r) => !q || r.major.toLowerCase().includes(q))
      .sort((a, b) => b[sortKey] - a[sortKey]);
  }, [rows, search, sortKey]);

  const maxStudents = Math.max(1, ...rows.map((r) => r.studentCount));

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学生分析</p>
        <h1 className="campus-hero-title">按专业学生群体分析</h1>
        <p className="campus-hero-subtitle">按专业汇总学生人数、平均 GPA 与学分完成情况</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">专业数</p>
          <p className="campus-kpi-value">{loading ? "—" : rows.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">总学生数</p>
          <p className="campus-kpi-value">{loading ? "—" : rows.reduce((s, r) => s + r.studentCount, 0)}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">最高平均 GPA</p>
          <p className="campus-kpi-value text-emerald-600">
            {loading || !rows.length ? "—" : Math.max(...rows.map((r) => r.avgGpa)).toFixed(2)}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">全体均值 GPA</p>
          <p className="campus-kpi-value">
            {loading || !rows.length ? "—" :
              (rows.reduce((s, r) => s + r.avgGpa * r.studentCount, 0) / Math.max(1, rows.reduce((s, r) => s + r.studentCount, 0))).toFixed(2)}
          </p>
        </div>
      </section>

      <div className="campus-toolbar">
        <select className="campus-select w-40" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">全部学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="campus-select w-36" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
          <option value="studentCount">按学生数排序</option>
          <option value="avgGpa">按 GPA 排序</option>
          <option value="totalCredits">按学分排序</option>
          <option value="activeCount">按在读人数排序</option>
        </select>
        <input className="campus-input max-w-xs" placeholder="搜索专业…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {/* Bar chart */}
      {!loading && sorted.length > 0 ? (
        <section className="campus-card p-5">
          <p className="font-semibold text-slate-800 mb-3">学生分布（按专业）</p>
          <div className="space-y-2">
            {sorted.slice(0, 15).map((r) => (
              <div key={r.major} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-slate-700 text-xs truncate" title={r.major}>{r.major}</span>
                <div className="flex-1 h-3 rounded-full bg-slate-100">
                  <div
                    className="h-3 rounded-full bg-[hsl(221_83%_43%)]"
                    style={{ width: `${(r.studentCount / maxStudents) * 100}%` }}
                  />
                </div>
                <span className="w-10 text-right font-bold text-slate-800 text-xs">{r.studentCount}</span>
                <span className={`w-12 text-right text-xs font-semibold ${r.avgGpa >= 3.5 ? "text-emerald-600" : r.avgGpa >= 2.0 ? "text-slate-500" : "text-red-500"}`}>
                  {r.avgGpa > 0 ? r.avgGpa.toFixed(2) : "—"}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="campus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 text-left">专业</th>
                <th className="px-4 py-3 text-right">学生数</th>
                <th className="px-4 py-3 text-right">在读人数</th>
                <th className="px-4 py-3 text-right">已完课</th>
                <th className="px-4 py-3 text-right">总学分</th>
                <th className="px-4 py-3 text-right">平均 GPA</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">暂无数据</td></tr>
              ) : sorted.map((r) => (
                <tr key={r.major} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-900">{r.major}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">{r.studentCount}</td>
                  <td className="px-4 py-3 text-right font-mono text-blue-600">{r.activeCount}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-600">{r.completedCount}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">{r.totalCredits}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold ${r.avgGpa >= 3.5 ? "text-emerald-600" : r.avgGpa >= 2.0 ? "text-slate-700" : r.avgGpa > 0 ? "text-red-600" : "text-slate-300"}`}>
                      {r.avgGpa > 0 ? r.avgGpa.toFixed(2) : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
