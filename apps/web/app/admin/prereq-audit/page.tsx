"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type ViolationRow = {
  studentId: string;
  studentEmail: string;
  courseCode: string;
  courseTitle: string;
  prereqCode: string;
  prereqTitle: string;
  sectionId: string;
  termName: string;
};

export default function PrereqAuditPage() {
  const [rows, setRows] = useState<ViolationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    void apiFetch<ViolationRow[]>("/admin/prereq-audit")
      .then((d) => setRows(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.studentEmail.toLowerCase().includes(q) || r.courseCode.toLowerCase().includes(q) || r.prereqCode.toLowerCase().includes(q);
  });

  function exportCsv() {
    const headers = ["学生邮箱", "课程代码", "课程名称", "缺少先修课", "先修课名称", "学期"];
    const csvRows = [
      headers.join(","),
      ...filtered.map((r) => [`"${r.studentEmail}"`, r.courseCode, `"${r.courseTitle}"`, r.prereqCode, `"${r.prereqTitle}"`, `"${r.termName}"`].join(","))
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `prereq-violations-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">数据审计</p>
        <h1 className="campus-hero-title">先修课违规审计</h1>
        <p className="campus-hero-subtitle">检测已注册但未完成先修课程要求的学生</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">违规记录总数</p>
          <p className={`campus-kpi-value ${rows.length > 0 ? "text-red-600" : "text-emerald-600"}`}>
            {loading ? "—" : rows.length === 0 ? "✓ 无" : rows.length}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">涉及学生数</p>
          <p className="campus-kpi-value">{loading ? "—" : new Set(rows.map((r) => r.studentId)).size}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">涉及课程数</p>
          <p className="campus-kpi-value">{loading ? "—" : new Set(rows.map((r) => r.courseCode)).size}</p>
        </div>
      </section>

      {rows.length > 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          ⚠ 发现 <strong>{rows.length}</strong> 条先修课违规记录，请及时处理或联系学生补修。
        </div>
      ) : null}

      <div className="campus-toolbar">
        <input
          className="campus-input max-w-xs"
          placeholder="搜索学生邮箱或课程代码…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={exportCsv} disabled={!filtered.length} className="campus-btn-ghost shrink-0 disabled:opacity-40">
          CSV 导出
        </button>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="campus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 text-left">学生</th>
                <th className="px-4 py-3 text-left">已注册课程</th>
                <th className="px-4 py-3 text-left">缺少先修课</th>
                <th className="px-4 py-3 text-left">学期</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">检测中…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  {rows.length === 0 ? "✅ 未发现先修课违规" : "无匹配结果"}
                </td></tr>
              ) : filtered.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-red-50/30">
                  <td className="px-4 py-3 text-xs text-slate-600">{row.studentEmail}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900">{row.courseCode}</p>
                    <p className="text-xs text-slate-500">{row.courseTitle}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">
                      {row.prereqCode}
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">{row.prereqTitle}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{row.termName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
