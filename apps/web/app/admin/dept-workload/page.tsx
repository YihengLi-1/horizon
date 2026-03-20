"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type WorkloadRow = {
  prefix: string;
  instructorCount: number;
  sectionCount: number;
  totalCapacity: number;
  totalEnrolled: number;
  utilization: number;
};

type Term = { id: string; name: string };

export default function DeptWorkloadPage() {
  const [rows, setRows] = useState<WorkloadRow[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "学期列表加载失败"));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    void apiFetch<WorkloadRow[]>(`/admin/dept-workload?${params}`)
      .then((d) => setRows(d ?? []))
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
    return rows.filter((r) => !q || r.prefix.toLowerCase().includes(q));
  }, [rows, search]);

  const totalSections = rows.reduce((s, r) => s + r.sectionCount, 0);
  const totalEnrolled = rows.reduce((s, r) => s + r.totalEnrolled, 0);
  const totalCapacity = rows.reduce((s, r) => s + r.totalCapacity, 0);
  const overallUtil = totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;

  function utilColor(pct: number) {
    if (pct >= 90) return "bg-red-400";
    if (pct >= 70) return "bg-amber-400";
    return "bg-emerald-400";
  }

  function exportCsv() {
    const headers = ["课程前缀", "教师数", "教学班数", "总容量", "已注册", "利用率(%)"];
    const csvRows = [
      headers.join(","),
      ...filtered.map((r) => [r.prefix, r.instructorCount, r.sectionCount, r.totalCapacity, r.totalEnrolled, r.utilization].join(","))
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `dept-workload-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">教学分析</p>
        <h1 className="campus-title">院系工作量总览</h1>
        <p className="campus-subtitle">按课程代码前缀汇总各院系教学班、教师与注册情况</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">院系（前缀）数</p>
          <p className="campus-kpi-value">{loading ? "—" : rows.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">教学班总数</p>
          <p className="campus-kpi-value">{loading ? "—" : totalSections}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">注册总人次</p>
          <p className="campus-kpi-value text-emerald-600">{loading ? "—" : totalEnrolled}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">整体利用率</p>
          <p className={`campus-kpi-value ${overallUtil >= 90 ? "text-red-600" : overallUtil >= 70 ? "text-amber-600" : "text-emerald-600"}`}>
            {loading ? "—" : `${overallUtil}%`}
          </p>
        </div>
      </section>

      <div className="campus-toolbar">
        <select className="campus-select w-40" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">全部学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input
          ref={searchRef}
          className="campus-input max-w-xs"
          placeholder="按课程前缀搜索… (/)"
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
                <th className="px-4 py-3 text-left">课程前缀</th>
                <th className="px-4 py-3 text-right">教师数</th>
                <th className="px-4 py-3 text-right">教学班数</th>
                <th className="px-4 py-3 text-right">总容量</th>
                <th className="px-4 py-3 text-right">已注册</th>
                <th className="px-4 py-3 text-left">利用率</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">暂无数据</td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.prefix} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-700">
                        {row.prefix}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{row.instructorCount}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{row.sectionCount}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500">{row.totalCapacity}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{row.totalEnrolled}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 rounded-full bg-slate-100">
                          <div
                            className={`h-2 rounded-full ${utilColor(row.utilization)}`}
                            style={{ width: `${Math.min(row.utilization, 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${row.utilization >= 90 ? "text-red-600" : row.utilization >= 70 ? "text-amber-600" : "text-emerald-600"}`}>
                          {row.utilization}%
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
            共 {filtered.length} 个院系前缀 · 利用率 = 已注册 / 总容量
          </p>
        ) : null}
      </section>
    </div>
  );
}
