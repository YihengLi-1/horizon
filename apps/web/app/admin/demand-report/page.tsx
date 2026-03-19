"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type DemandRow = {
  id: string;
  sectionCode: string;
  course: { code: string; title: string; credits: number };
  term: { id: string; name: string };
  instructorName: string;
  capacity: number;
  enrolled: number;
  inCart: number;
  waitlisted: number;
  watching: number;
  demand: number;
  utilizationPct: number | null;
};

type Term = { id: string; name: string };

type SortKey = "demand" | "enrolled" | "inCart" | "waitlisted" | "watching" | "utilizationPct";

function utilColor(pct: number | null): string {
  if (pct === null) return "bg-slate-200";
  if (pct >= 90) return "bg-red-400";
  if (pct >= 70) return "bg-amber-400";
  if (pct >= 40) return "bg-emerald-400";
  return "bg-blue-300";
}

export default function DemandReportPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [rows, setRows] = useState<DemandRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("demand");
  const [asc, setAsc] = useState(false);

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const url = termId ? `/admin/demand-report?termId=${termId}` : "/admin/demand-report";
    void apiFetch<DemandRow[]>(url)
      .then((d) => setRows(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return [...rows]
      .filter(
        (r) =>
          !q ||
          r.course.code.toLowerCase().includes(q) ||
          r.course.title.toLowerCase().includes(q) ||
          r.sectionCode.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const av = a[sort] ?? -1;
        const bv = b[sort] ?? -1;
        return asc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
      });
  }, [rows, search, sort, asc]);

  const totalDemand = rows.reduce((s, r) => s + r.demand, 0);
  const totalWaitlisted = rows.reduce((s, r) => s + r.waitlisted, 0);
  const highDemand = rows.filter((r) => r.demand > 5).length;

  function toggleSort(key: SortKey) {
    if (sort === key) setAsc((v) => !v);
    else { setSort(key); setAsc(false); }
  }

  function sortIcon(key: SortKey) {
    if (sort !== key) return null;
    return asc ? " ↑" : " ↓";
  }

  function exportCsv() {
    const headers = ["教学班编号", "课程代码", "课程名称", "学期", "教师", "容量", "已选", "购物车", "候补", "关注", "需求总量", "使用率%"];
    const csvRows = [
      headers.join(","),
      ...filtered.map((r) =>
        [
          `"${r.sectionCode}"`,
          `"${r.course.code}"`,
          `"${r.course.title}"`,
          `"${r.term.name}"`,
          `"${r.instructorName}"`,
          r.capacity,
          r.enrolled,
          r.inCart,
          r.waitlisted,
          r.watching,
          r.demand,
          r.utilizationPct ?? "—",
        ].join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `demand-report-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">选课分析</p>
        <h1 className="campus-hero-title">教学班需求报告</h1>
        <p className="campus-hero-subtitle">按购物车、候补与关注人数综合评估各教学班的选课需求热度</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">教学班总数</p>
          <p className="campus-kpi-value">{rows.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">需求总量</p>
          <p className="campus-kpi-value">{totalDemand}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">候补人数</p>
          <p className="campus-kpi-value text-amber-600">{totalWaitlisted}</p>
        </div>
      </section>

      <div className="campus-toolbar">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <input
            className="campus-input max-w-xs"
            placeholder="按课程代码或名称搜索…"
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

      {highDemand > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ 共 <span className="font-bold">{highDemand}</span> 个教学班需求量超过 5 人，建议考虑扩容或增班。
        </div>
      ) : null}

      <section className="campus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-3">教学班</th>
                <th className="px-4 py-3">课程</th>
                <th className="px-4 py-3">学期</th>
                <th className="px-4 py-3 text-right">容量/已选</th>
                <th
                  className="cursor-pointer px-4 py-3 text-right hover:text-slate-800"
                  onClick={() => toggleSort("inCart")}
                >
                  购物车{sortIcon("inCart")}
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-right hover:text-slate-800"
                  onClick={() => toggleSort("waitlisted")}
                >
                  候补{sortIcon("waitlisted")}
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-right hover:text-slate-800"
                  onClick={() => toggleSort("watching")}
                >
                  关注{sortIcon("watching")}
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-right hover:text-slate-800"
                  onClick={() => toggleSort("demand")}
                >
                  需求{sortIcon("demand")}
                </th>
                <th
                  className="cursor-pointer px-4 py-3 text-right hover:text-slate-800"
                  onClick={() => toggleSort("utilizationPct")}
                >
                  使用率{sortIcon("utilizationPct")}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">加载中…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">暂无数据</td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{row.sectionCode}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{row.course.code}</p>
                      <p className="text-xs text-slate-500 max-w-[200px] truncate">{row.course.title}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{row.term.name}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono text-slate-700">{row.enrolled}</span>
                      <span className="text-slate-400"> / {row.capacity}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{row.inCart}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono ${row.waitlisted > 0 ? "font-bold text-amber-600" : "text-slate-700"}`}>
                        {row.waitlisted}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{row.watching}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${row.demand > 10 ? "text-red-600" : row.demand > 5 ? "text-amber-600" : "text-slate-700"}`}>
                        {row.demand}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-14 rounded-full bg-slate-100">
                          <div
                            className={`h-1.5 rounded-full ${utilColor(row.utilizationPct)}`}
                            style={{ width: `${Math.min(100, row.utilizationPct ?? 0)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-600 w-9 text-right">
                          {row.utilizationPct !== null ? `${row.utilizationPct}%` : "—"}
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
            共 {filtered.length} 个教学班
          </p>
        ) : null}
      </section>
    </div>
  );
}
