"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = {
  id: string;
  name: string;
};

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

type CapacityFilter = "all" | "full" | "tight" | "comfortable";

function utilizationTone(utilizationPct: number) {
  if (utilizationPct >= 100) return "bg-red-500";
  if (utilizationPct >= 80) return "bg-amber-500";
  return "bg-emerald-500";
}

function utilizationLabel(filter: CapacityFilter) {
  if (filter === "full") return "满员";
  if (filter === "tight") return "紧张";
  if (filter === "comfortable") return "充裕";
  return "全部";
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

export default function CapacityPlanPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [rows, setRows] = useState<CapacityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<CapacityFilter>("all");

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms")
      .then((data) => {
        const nextTerms = (data ?? []).sort((a, b) => b.name.localeCompare(a.name));
        setTerms(nextTerms);
        if (nextTerms[0]) {
          setTermId(nextTerms[0].id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "加载学期失败"));
  }, []);

  useEffect(() => {
    if (!termId && terms.length === 0) return;
    setLoading(true);
    setError("");
    const suffix = termId ? `?termId=${termId}` : "";
    void apiFetch<CapacityRow[]>(`/admin/capacity-plan${suffix}`)
      .then((data) => setRows(data ?? []))
      .catch((err) => {
        setRows([]);
        setError(err instanceof Error ? err.message : "加载容量规划失败");
      })
      .finally(() => setLoading(false));
  }, [termId, terms.length]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (filter === "full") return row.utilizationPct >= 100;
      if (filter === "tight") return row.utilizationPct >= 80 && row.utilizationPct < 100;
      if (filter === "comfortable") return row.utilizationPct < 80;
      return true;
    });
  }, [filter, rows]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.capacity += row.capacity;
        acc.enrolled += row.enrolled;
        acc.waitlisted += row.waitlisted;
        acc.projectedDemand += row.projectedDemand;
        return acc;
      },
      { capacity: 0, enrolled: 0, waitlisted: 0, projectedDemand: 0 }
    );
  }, [filteredRows]);

  function exportCsv() {
    const header = [
      "courseCode",
      "courseTitle",
      "sectionCode",
      "capacity",
      "enrolled",
      "waitlisted",
      "utilizationPct",
      "projectedDemand"
    ];
    const lines = [
      header.join(","),
      ...filteredRows.map((row) =>
        [
          row.courseCode,
          row.courseTitle,
          row.sectionCode,
          row.capacity,
          row.enrolled,
          row.waitlisted,
          row.utilizationPct,
          row.projectedDemand
        ]
          .map(csvCell)
          .join(",")
      )
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `capacity-plan-${termId || "all"}-${filter}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Section Operations</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">容量规划</h1>
        <p className="mt-1 text-sm text-slate-500">按利用率排序查看容量压力、候补量和预估需求</p>
      </section>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">教学班</p>
          <p className="campus-kpi-value">{filteredRows.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已选人数</p>
          <p className="campus-kpi-value text-indigo-600">{totals.enrolled}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">候补人数</p>
          <p className="campus-kpi-value text-amber-600">{totals.waitlisted}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">预估需求</p>
          <p className="campus-kpi-value text-emerald-600">{totals.projectedDemand}</p>
        </div>
      </div>

      <div className="campus-toolbar flex-wrap gap-3">
        <select className="campus-select" value={termId} onChange={(event) => setTermId(event.target.value)}>
          <option value="">所有学期</option>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.name}
            </option>
          ))}
        </select>
        <select
          className="campus-select"
          value={filter}
          onChange={(event) => setFilter(event.target.value as CapacityFilter)}
        >
          <option value="all">{utilizationLabel("all")}</option>
          <option value="full">{utilizationLabel("full")}</option>
          <option value="tight">{utilizationLabel("tight")}</option>
          <option value="comfortable">{utilizationLabel("comfortable")}</option>
        </select>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filteredRows.length === 0}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          CSV 导出
        </button>
      </div>

      {error ? <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : filteredRows.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">暂无容量规划数据</div>
      ) : (
        <div className="campus-card overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">课程</th>
                <th className="px-4 py-3">教学班</th>
                <th className="px-4 py-3">容量</th>
                <th className="px-4 py-3">已选</th>
                <th className="px-4 py-3">候补</th>
                <th className="px-4 py-3">利用率</th>
                <th className="px-4 py-3">容量条</th>
                <th className="px-4 py-3">预估需求</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.sectionId} className="border-b border-slate-50 hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-xs font-bold text-indigo-700">{row.courseCode}</span>
                      <span className="text-slate-600">{row.courseTitle}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">§{row.sectionCode}</td>
                  <td className="px-4 py-3 text-slate-700">{row.capacity}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{row.enrolled}</td>
                  <td className="px-4 py-3 text-amber-700">{row.waitlisted}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`campus-chip ${
                        row.utilizationPct >= 100
                          ? "border-red-200 bg-red-50 text-red-700"
                          : row.utilizationPct >= 80
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {row.utilizationPct}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${utilizationTone(row.utilizationPct)}`}
                          style={{ width: `${Math.min(100, row.utilizationPct)}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{row.enrolled}/{row.capacity}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{row.projectedDemand}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
