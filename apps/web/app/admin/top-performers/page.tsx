"use client";

/**
 * Admin Top Performers Report
 * Shows students ranked by GPA (for completed courses).
 * Filterable by term. CSV export supported.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };

type Performer = {
  rank: number;
  studentId: string;
  email: string;
  major: string;
  totalCredits: number;
  gpa: number;
  completedCourses: number;
};

export default function TopPerformersPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [limit, setLimit] = useState("20");
  const [data, setData] = useState<Performer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms")
      .then((d) => setTerms((d ?? []).sort((a, b) => b.name.localeCompare(a.name))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    params.set("limit", limit);
    void apiFetch<Performer[]>(`/admin/top-performers?${params}`)
      .then((d) => setData(d ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [termId, limit]);

  function exportCsv() {
    if (!data.length) return;
    const header = ["Rank", "Email", "Major", "GPA", "Completed Courses", "Total Credits"];
    const rows = data.map((p) => [p.rank, p.email, p.major, p.gpa.toFixed(2), p.completedCourses, p.totalCredits]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "top-performers.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const maxGpa = Math.max(1, ...data.map((p) => p.gpa));

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Excellence</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">优秀学生排行</h1>
        <p className="mt-1 text-sm text-slate-500">按 GPA 排名的高绩效学生名单，支持按学期筛选</p>
      </section>

      <div className="campus-toolbar flex-wrap gap-2">
        <select className="campus-select" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">所有学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="campus-select w-24" value={limit} onChange={(e) => setLimit(e.target.value)}>
          <option value="10">Top 10</option>
          <option value="20">Top 20</option>
          <option value="50">Top 50</option>
          <option value="100">Top 100</option>
        </select>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!data.length}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          CSV 导出
        </button>
      </div>

      {/* Top 3 podium */}
      {!loading && data.length >= 3 && (
        <div className="grid grid-cols-3 gap-3">
          {[data[1], data[0], data[2]].map((p, i) => {
            if (!p) return null;
            const podiumColors = ["bg-slate-100", "bg-amber-50 border-amber-300", "bg-orange-50 border-orange-200"];
            const medals = ["🥈", "🥇", "🥉"];
            return (
              <div key={p.studentId} className={`campus-card p-4 text-center border ${podiumColors[i]} ${i === 1 ? "ring-2 ring-amber-400" : ""}`}>
                <div className="text-2xl mb-1">{medals[i]}</div>
                <p className="text-xs font-bold text-slate-700 truncate">{p.email.split("@")[0]}</p>
                <p className="text-xs text-slate-400 truncate">{p.major}</p>
                <p className="text-xl font-bold text-indigo-700 mt-1">{p.gpa.toFixed(2)}</p>
                <p className="text-[10px] text-slate-400">GPA · #{p.rank}</p>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : data.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">暂无数据</div>
      ) : (
        <div className="campus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pl-4 text-left font-semibold w-10">#</th>
                  <th className="pb-2 pr-3 text-left font-semibold">学生</th>
                  <th className="pb-2 pr-3 text-left font-semibold">专业</th>
                  <th className="pb-2 pr-3 text-right font-semibold">GPA</th>
                  <th className="pb-2 pr-3 text-right font-semibold">完成课程</th>
                  <th className="pb-2 pr-4 text-right font-semibold">总学分</th>
                  <th className="pb-2 pr-4 font-semibold">GPA 条</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.studentId} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2.5 pl-4 pr-2">
                      <span className={`font-bold text-xs ${p.rank <= 3 ? "text-amber-600" : "text-slate-500"}`}>
                        {p.rank <= 3 ? ["🥇","🥈","🥉"][p.rank - 1] : `#${p.rank}`}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-700 truncate max-w-[180px]">{p.email}</td>
                    <td className="py-2.5 pr-3 text-slate-500 truncate max-w-[140px]">{p.major}</td>
                    <td className="py-2.5 pr-3 text-right">
                      <span className={`font-bold ${p.gpa >= 3.7 ? "text-emerald-600" : p.gpa >= 3.0 ? "text-indigo-600" : "text-amber-600"}`}>
                        {p.gpa.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right text-slate-600">{p.completedCourses}</td>
                    <td className="py-2.5 pr-4 text-right text-slate-600">{p.totalCredits}</td>
                    <td className="py-2.5 pr-4" style={{ minWidth: 80 }}>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${(p.gpa / maxGpa) * 100}%` }}
                        />
                      </div>
                    </td>
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
