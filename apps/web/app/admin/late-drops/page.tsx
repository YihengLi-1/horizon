"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type LateDropRow = {
  enrollmentId: string;
  studentEmail: string;
  studentName: string;
  courseCode: string;
  courseTitle: string;
  termName: string;
  droppedAt: string;
  weeksIntoCourse: number;
};

type LateDropData = {
  rows: LateDropRow[];
  summary: { total: number; minWeek: number; avgWeek: number };
};

type Term = { id: string; name: string };

export default function LateDropsPage() {
  const [data, setData] = useState<LateDropData | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [minWeek, setMinWeek] = useState(8);
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
    params.set("minWeek", String(minWeek));
    void apiFetch<LateDropData>(`/admin/late-drops?${params}`)
      .then((d) => setData(d ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId, minWeek]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (data?.rows ?? []).filter(
      (r) => !q || r.studentEmail.toLowerCase().includes(q) || r.studentName.toLowerCase().includes(q) || r.courseCode.toLowerCase().includes(q)
    );
  }, [data, search]);

  const maxWeeks = Math.max(1, ...(data?.rows ?? []).map((r) => r.weeksIntoCourse));

  function exportCsv() {
    const headers = ["学生邮箱", "学生姓名", "课程代码", "课程名称", "学期", "退课日期", "第几周"];
    const rows = [
      headers.join(","),
      ...filtered.map((r) => [
        `"${r.studentEmail}"`, `"${r.studentName}"`, r.courseCode, `"${r.courseTitle}"`,
        `"${r.termName}"`, r.droppedAt, r.weeksIntoCourse
      ].join(","))
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `late-drops-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">注册管理</p>
        <h1 className="campus-title">晚期退课报告</h1>
        <p className="campus-subtitle">筛选开课若干周后仍退课的记录，识别潜在学业风险</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">晚期退课总数</p>
          <p className="campus-kpi-value text-amber-600">{loading ? "—" : data?.summary.total}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">平均退课周数</p>
          <p className="campus-kpi-value">{loading ? "—" : data?.summary.avgWeek}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">筛选阈值</p>
          <p className="campus-kpi-value text-slate-600">第 {minWeek} 周后</p>
        </div>
      </section>

      <div className="campus-toolbar">
        <select className="campus-select w-40" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">全部学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 whitespace-nowrap">≥ 第</label>
          <input
            type="number"
            className="campus-input w-20"
            value={minWeek}
            min={1}
            max={20}
            onChange={(e) => setMinWeek(Math.max(1, Number(e.target.value)))}
          />
          <span className="text-sm text-slate-600">周</span>
        </div>
        <input
          className="campus-input max-w-xs"
          placeholder="搜索学生或课程…"
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
                <th className="px-4 py-3 text-left">学生</th>
                <th className="px-4 py-3 text-left">课程</th>
                <th className="px-4 py-3 text-left">学期</th>
                <th className="px-4 py-3 text-right">退课日期</th>
                <th className="px-4 py-3 text-left">退课周数</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  {data?.rows.length === 0 ? "暂无晚期退课记录" : "无匹配结果"}
                </td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.enrollmentId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{row.studentName}</p>
                      <p className="text-xs text-slate-500">{row.studentEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{row.courseCode}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[160px]">{row.courseTitle}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{row.termName}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{row.droppedAt}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 rounded-full bg-slate-100">
                          <div
                            className={`h-2 rounded-full ${row.weeksIntoCourse >= 12 ? "bg-red-400" : "bg-amber-400"}`}
                            style={{ width: `${(row.weeksIntoCourse / maxWeeks) * 100}%` }}
                          />
                        </div>
                        <span className={`font-bold text-sm ${row.weeksIntoCourse >= 12 ? "text-red-600" : "text-amber-600"}`}>
                          第 {row.weeksIntoCourse} 周
                        </span>
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
            共 {filtered.length} 条记录 · 仅显示开课第 {minWeek} 周及以后的退课
          </p>
        ) : null}
      </section>
    </div>
  );
}
