"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type CapacityRow = {
  sectionId: string;
  courseCode: string;
  courseTitle: string;
  sectionCode: string;
  capacity: number;
  enrolled: number;
  waitlisted: number;
  utilizationPct: number;
  projectedDemand: number;
};

type Term = { id: string; name: string };
type FilterMode = "all" | "full" | "available" | "waitlisted";

export default function CapacityPlanPage() {
  const [rows, setRows] = useState<CapacityRow[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    void apiFetch<CapacityRow[]>(`/admin/capacity-plan?${params}`)
      .then((d) => setRows(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      const matchSearch = !q || r.courseCode.toLowerCase().includes(q) || r.courseTitle.toLowerCase().includes(q) || r.sectionCode.toLowerCase().includes(q);
      const matchFilter =
        filterMode === "all" ? true :
        filterMode === "full" ? r.utilizationPct >= 100 :
        filterMode === "available" ? r.utilizationPct < 100 :
        r.waitlisted > 0;
      return matchSearch && matchFilter;
    });
  }, [rows, search, filterMode]);

  const fullSections = rows.filter((r) => r.utilizationPct >= 100).length;
  const waitlistedSections = rows.filter((r) => r.waitlisted > 0).length;
  const avgUtil = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.utilizationPct, 0) / rows.length) : 0;

  function utilColor(pct: number) {
    if (pct >= 100) return "bg-red-400";
    if (pct >= 80) return "bg-amber-400";
    return "bg-emerald-400";
  }

  function exportCsv() {
    const headers = ["课程代码", "课程名称", "教学班", "容量", "已注册", "候补", "利用率(%)", "预计需求"];
    const csvRows = [
      headers.join(","),
      ...filtered.map((r) => [
        r.courseCode, `"${r.courseTitle}"`, r.sectionCode,
        r.capacity, r.enrolled, r.waitlisted, r.utilizationPct, r.projectedDemand
      ].join(","))
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `capacity-plan-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">资源规划</p>
        <h1 className="campus-hero-title">容量规划</h1>
        <p className="campus-hero-subtitle">教学班容量利用率与预计需求分析，帮助合理分配教学资源</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">教学班总数</p>
          <p className="campus-kpi-value">{loading ? "—" : rows.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">平均利用率</p>
          <p className={`campus-kpi-value ${avgUtil >= 90 ? "text-red-600" : avgUtil >= 70 ? "text-amber-600" : "text-emerald-600"}`}>
            {loading ? "—" : `${avgUtil}%`}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已满班级数</p>
          <p className="campus-kpi-value text-red-600">{loading ? "—" : fullSections}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">有候补班级数</p>
          <p className="campus-kpi-value text-amber-600">{loading ? "—" : waitlistedSections}</p>
        </div>
      </section>

      {fullSections > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ 共 <span className="font-bold">{fullSections}</span> 个班级已满员，建议考虑增加教学班或调整容量。
        </div>
      ) : null}

      <div className="campus-toolbar">
        <select className="campus-select w-40" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">全部学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="campus-select w-36" value={filterMode} onChange={(e) => setFilterMode(e.target.value as FilterMode)}>
          <option value="all">全部</option>
          <option value="full">已满员</option>
          <option value="available">有空位</option>
          <option value="waitlisted">有候补</option>
        </select>
        <input
          className="campus-input max-w-xs"
          placeholder="搜索课程代码或名称…"
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
                <th className="px-4 py-3 text-left">课程</th>
                <th className="px-4 py-3 text-left">教学班</th>
                <th className="px-4 py-3 text-right">容量</th>
                <th className="px-4 py-3 text-right">已注册</th>
                <th className="px-4 py-3 text-right">候补</th>
                <th className="px-4 py-3 text-right">预计需求</th>
                <th className="px-4 py-3 text-left">利用率</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">暂无数据</td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.sectionId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{row.courseCode}</p>
                      <p className="text-xs text-slate-500 truncate max-w-[160px]">{row.courseTitle}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.sectionCode}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500">{row.capacity}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">{row.enrolled}</td>
                    <td className={`px-4 py-3 text-right font-mono ${row.waitlisted > 0 ? "text-amber-600 font-bold" : "text-slate-400"}`}>
                      {row.waitlisted || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{row.projectedDemand}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 rounded-full bg-slate-100">
                          <div
                            className={`h-2 rounded-full ${utilColor(row.utilizationPct)}`}
                            style={{ width: `${Math.min(row.utilizationPct, 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${row.utilizationPct >= 100 ? "text-red-600" : row.utilizationPct >= 80 ? "text-amber-600" : "text-emerald-600"}`}>
                          {row.utilizationPct}%
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
            共 {filtered.length} 个教学班 · 预计需求 = 已注册 + 候补人数
          </p>
        ) : null}
      </section>
    </div>
  );
}
