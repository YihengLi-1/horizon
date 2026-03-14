"use client";

/**
 * Admin Late Drop Report
 * Shows students who dropped courses after week N (default week 8).
 * Filterable by term and minimum week threshold.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type DropRow = {
  enrollmentId: string; studentEmail: string; studentName: string;
  courseCode: string; courseTitle: string; termName: string;
  droppedAt: string; weeksIntoCourse: number;
};
type DropData = {
  rows: DropRow[];
  summary: { total: number; minWeek: number; avgWeek: number };
};

function downloadCsv(data: DropData) {
  const header = "Student,Email,Course,Term,DroppedAt,WeeksIntoCourse";
  const lines = data.rows.map((r) =>
    `"${r.studentName}","${r.studentEmail}","${r.courseCode} ${r.courseTitle}","${r.termName}",${r.droppedAt},${r.weeksIntoCourse}`
  );
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = "late-drops.csv"; a.click(); URL.revokeObjectURL(url);
}

export default function LateDropsPage() {
  const [data, setData] = useState<DropData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [minWeek, setMinWeek] = useState(8);
  const [search, setSearch] = useState("");

  function load(week: number) {
    setLoading(true); setError("");
    void apiFetch<DropData>(`/admin/late-drops?minWeek=${week}`)
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(minWeek); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = data
    ? data.rows.filter((r) =>
        !search ||
        r.studentName.toLowerCase().includes(search.toLowerCase()) ||
        r.studentEmail.toLowerCase().includes(search.toLowerCase()) ||
        r.courseCode.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Enrollment Intelligence</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">逾期退课报告</h1>
        <p className="mt-1 text-sm text-slate-500">统计在课程开课若干周后仍选择退课的学生</p>
      </section>

      {/* Controls */}
      <div className="campus-card p-4 space-y-3">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">最早退课时间（第几周）</label>
            <input
              type="number" min="1" max="20" step="1"
              className="campus-input w-24"
              value={minWeek}
              onChange={(e) => setMinWeek(parseInt(e.target.value) || 8)}
            />
          </div>
          <button
            type="button"
            onClick={() => load(minWeek)}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "加载中…" : "查询"}
          </button>
        </div>
      </div>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">逾期退课总数</p>
              <p className="campus-kpi-value text-red-600">{data.summary.total}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">门槛（第几周）</p>
              <p className="campus-kpi-value text-slate-700">{data.summary.minWeek}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">平均退课周数</p>
              <p className="campus-kpi-value text-amber-600">{data.summary.avgWeek}</p>
            </div>
          </div>

          {/* Search + export */}
          <div className="campus-toolbar gap-2">
            <input
              className="campus-input flex-1 min-w-48"
              placeholder="搜索学生或课程…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              onClick={() => downloadCsv(data)}
              className="campus-chip border-indigo-200 bg-indigo-50 text-indigo-700"
            >
              导出 CSV
            </button>
          </div>

          {filtered.length === 0 ? (
            <div className="campus-card px-6 py-10 text-center text-sm text-slate-400">
              {data.rows.length === 0 ? "无逾期退课记录" : "无匹配结果"}
            </div>
          ) : (
            <div className="campus-card overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-500">
                {filtered.length} / {data.rows.length} 条记录
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="pb-2 pl-4 text-left font-semibold">学生</th>
                      <th className="pb-2 pr-3 text-left font-semibold">课程</th>
                      <th className="pb-2 pr-3 text-left font-semibold">学期</th>
                      <th className="pb-2 pr-3 text-right font-semibold">退课日期</th>
                      <th className="pb-2 pr-4 text-right font-semibold text-red-600">退课周数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.enrollmentId} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2.5 pl-4 pr-3">
                          <span className="font-medium text-slate-800">{r.studentName}</span>
                          <span className="text-slate-400 block text-xs">{r.studentEmail}</span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="font-mono font-bold text-indigo-700">{r.courseCode}</span>
                          <span className="text-slate-500 ml-1 hidden sm:inline">{r.courseTitle.slice(0, 25)}{r.courseTitle.length > 25 ? "…" : ""}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-500">{r.termName}</td>
                        <td className="py-2.5 pr-3 text-right text-slate-500">{r.droppedAt}</td>
                        <td className="py-2.5 pr-4 text-right">
                          <span className={`font-bold ${r.weeksIntoCourse >= 12 ? "text-red-600" : r.weeksIntoCourse >= 10 ? "text-amber-600" : "text-slate-700"}`}>
                            第 {r.weeksIntoCourse} 周
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
