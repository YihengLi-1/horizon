"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Performer = {
  rank: number;
  studentId: string;
  email: string;
  major: string;
  totalCredits: number;
  gpa: number;
  completedCourses: number;
};

type Term = { id: string; name: string };

function MedalIcon({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return <span className="w-8 text-center font-mono text-sm font-bold text-slate-500">#{rank}</span>;
}

export default function TopPerformersPage() {
  const [rows, setRows] = useState<Performer[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    params.set("limit", String(limit));
    void apiFetch<Performer[]>(`/admin/top-performers?${params}`)
      .then((d) => setRows(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId, limit]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => !q || r.email.toLowerCase().includes(q) || (r.major ?? "").toLowerCase().includes(q));
  }, [rows, search]);

  const top3 = filtered.slice(0, 3);
  const rest = filtered.slice(3);

  function exportCsv() {
    const headers = ["排名", "邮箱", "专业", "完成学分", "GPA", "完成课程数"];
    const csvRows = [
      headers.join(","),
      ...filtered.map((r) => [r.rank, `"${r.email}"`, `"${r.major}"`, r.totalCredits, r.gpa.toFixed(2), r.completedCourses].join(","))
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `top-performers-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学生表彰</p>
        <h1 className="campus-title">优秀学生榜单</h1>
        <p className="campus-subtitle">按 GPA 与完成学分综合排名的学生排行榜</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">上榜学生数</p>
          <p className="campus-kpi-value text-amber-600">{loading ? "—" : rows.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">最高 GPA</p>
          <p className="campus-kpi-value text-emerald-600">{loading || !rows[0] ? "—" : rows[0].gpa.toFixed(2)}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">平均 GPA</p>
          <p className="campus-kpi-value">
            {loading || !rows.length ? "—" : (rows.reduce((s, r) => s + r.gpa, 0) / rows.length).toFixed(2)}
          </p>
        </div>
      </section>

      {/* Podium top-3 */}
      {!loading && top3.length >= 3 ? (
        <section className="grid gap-4 sm:grid-cols-3">
          {[top3[1], top3[0], top3[2]].map((p, i) => {
            if (!p) return null;
            const heights = ["h-28", "h-36", "h-24"];
            const bgColors = ["bg-slate-100 border-slate-300", "bg-amber-50 border-amber-300", "bg-orange-50 border-orange-200"];
            return (
              <div key={p.studentId} className={`campus-card flex flex-col items-center gap-2 border p-5 ${bgColors[i]}`}>
                <MedalIcon rank={p.rank} />
                <div className={`w-full rounded-md bg-slate-200 flex items-end justify-center ${heights[i]}`}>
                  <span className="mb-2 text-3xl font-black text-slate-600">{p.gpa.toFixed(2)}</span>
                </div>
                <p className="text-center text-sm font-semibold text-slate-800 truncate w-full">{p.email}</p>
                <p className="text-xs text-slate-500">{p.major}</p>
                <p className="text-xs text-slate-400">{p.totalCredits} 学分 · {p.completedCourses} 门课</p>
              </div>
            );
          })}
        </section>
      ) : null}

      <div className="campus-toolbar">
        <select className="campus-select w-40" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">全部学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="campus-select w-28" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
          <option value={10}>前 10 名</option>
          <option value={20}>前 20 名</option>
          <option value={50}>前 50 名</option>
        </select>
        <input
          className="campus-input max-w-xs"
          placeholder="搜索邮箱或专业…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={exportCsv} disabled={!filtered.length} className="campus-btn-ghost shrink-0 disabled:opacity-40">
          CSV 导出
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="campus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <th className="px-4 py-3 text-left">排名</th>
                <th className="px-4 py-3 text-left">邮箱</th>
                <th className="px-4 py-3 text-left">专业</th>
                <th className="px-4 py-3 text-right">完成学分</th>
                <th className="px-4 py-3 text-right">完成课程</th>
                <th className="px-4 py-3 text-right">GPA</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">暂无数据</td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.studentId} className={`border-b border-slate-100 hover:bg-slate-50 ${row.rank <= 3 ? "bg-amber-50/40" : ""}`}>
                    <td className="px-4 py-3"><MedalIcon rank={row.rank} /></td>
                    <td className="px-4 py-3 text-slate-800 font-mono text-xs">{row.email}</td>
                    <td className="px-4 py-3 text-slate-600">{row.major || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{row.totalCredits}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{row.completedCourses}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold text-lg ${row.gpa >= 3.8 ? "text-amber-600" : row.gpa >= 3.5 ? "text-emerald-600" : "text-slate-700"}`}>
                        {row.gpa.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 ? (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            共 {filtered.length} 名学生 · 按 GPA 降序排列，同 GPA 时按完成学分排序
          </p>
        ) : null}
      </section>
    </div>
  );
}
