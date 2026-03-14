"use client";

/**
 * Admin Term Capacity Summary
 * Overview of capacity utilization across all terms and sections.
 * Grouped by term with drill-down into individual sections.
 */

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type SectionCap = {
  termId: string; termName: string;
  courseCode: string; courseTitle: string; sectionId: string;
  capacity: number; enrolled: number; completed: number;
  dropped: number; waitlisted: number; utilization: number;
};
type TermGroup = {
  termId: string; termName: string;
  totalCapacity: number; totalEnrolled: number; overallUtilization: number;
  sections: SectionCap[];
};
type CapacityData = {
  terms: TermGroup[];
  summary: {
    totalSections: number; totalCapacity: number;
    totalEnrolled: number; overCapacitySections: number; fullSections: number;
  };
};

function utilizationColor(pct: number) {
  if (pct >= 100) return "text-red-600 font-bold";
  if (pct >= 90) return "text-amber-600 font-bold";
  if (pct >= 70) return "text-indigo-600";
  return "text-emerald-600";
}

function downloadCsv(data: CapacityData) {
  const header = "Term,Course,SectionID,Capacity,Enrolled,Completed,Dropped,Waitlisted,Utilization%";
  const lines: string[] = [];
  for (const term of data.terms) {
    for (const s of term.sections) {
      lines.push(`"${s.termName}","${s.courseCode} ${s.courseTitle}",${s.sectionId},${s.capacity},${s.enrolled},${s.completed},${s.dropped},${s.waitlisted},${s.utilization}`);
    }
  }
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "term-capacity.csv";
  a.click(); URL.revokeObjectURL(url);
}

export default function TermCapacityPage() {
  const [data, setData] = useState<CapacityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedTermId, setExpandedTermId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void apiFetch<CapacityData>("/admin/term-capacity")
      .then((d) => {
        setData(d);
        if (d.terms.length > 0) setExpandedTermId(d.terms[0].termId);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const filteredTerms = useMemo(() => {
    if (!data) return [];
    if (!search) return data.terms;
    return data.terms.map((t) => ({
      ...t,
      sections: t.sections.filter((s) =>
        s.courseCode.toLowerCase().includes(search.toLowerCase()) ||
        s.courseTitle.toLowerCase().includes(search.toLowerCase())
      )
    })).filter((t) => t.sections.length > 0);
  }, [data, search]);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Capacity Management</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">学期容量汇总</h1>
        <p className="mt-1 text-sm text-slate-500">各学期课程节容量利用率一览</p>
      </section>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : data ? (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div className="campus-kpi">
              <p className="campus-kpi-label">课程节总数</p>
              <p className="campus-kpi-value">{data.summary.totalSections}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">总容量</p>
              <p className="campus-kpi-value text-slate-700">{data.summary.totalCapacity}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">总注册</p>
              <p className="campus-kpi-value text-indigo-600">{data.summary.totalEnrolled}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">≥90% 满员</p>
              <p className="campus-kpi-value text-amber-600">{data.summary.fullSections}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">超员节</p>
              <p className="campus-kpi-value text-red-600">{data.summary.overCapacitySections}</p>
            </div>
          </div>

          {/* Toolbar */}
          <div className="campus-toolbar gap-2">
            <input
              className="campus-input flex-1 min-w-48"
              placeholder="搜索课程代码或名称…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {data && (
              <button
                type="button"
                onClick={() => downloadCsv(data)}
                className="campus-chip border-indigo-200 bg-indigo-50 text-indigo-700"
              >
                导出 CSV
              </button>
            )}
          </div>

          {/* Terms accordion */}
          <div className="space-y-3">
            {filteredTerms.map((term) => {
              const isExpanded = expandedTermId === term.termId;
              return (
                <div key={term.termId} className="campus-card overflow-hidden">
                  {/* Term header */}
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
                    onClick={() => setExpandedTermId(isExpanded ? null : term.termId)}
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-slate-900">{term.termName}</span>
                      <span className="text-xs text-slate-400">{term.sections.length} 个课程节</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${term.overallUtilization >= 90 ? "bg-amber-400" : "bg-indigo-400"}`}
                            style={{ width: `${Math.min(100, term.overallUtilization)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${utilizationColor(term.overallUtilization)}`}>
                          {term.overallUtilization}%
                        </span>
                      </div>
                      <span className="text-slate-400 text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {/* Sections table */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-400">
                            <th className="pb-2 pl-4 pt-2 text-left font-semibold">课程</th>
                            <th className="pb-2 pr-3 text-right font-semibold">容量</th>
                            <th className="pb-2 pr-3 text-right font-semibold">在读</th>
                            <th className="pb-2 pr-3 text-right font-semibold">完成</th>
                            <th className="pb-2 pr-3 text-right font-semibold">退课</th>
                            <th className="pb-2 pr-3 text-right font-semibold">候补</th>
                            <th className="pb-2 pr-4 text-right font-semibold">利用率</th>
                          </tr>
                        </thead>
                        <tbody>
                          {term.sections.map((s) => (
                            <tr key={s.sectionId} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="py-2 pl-4 pr-3">
                                <span className="font-mono font-bold text-indigo-700">{s.courseCode}</span>
                                <span className="text-slate-400 ml-1 hidden sm:inline">
                                  {s.courseTitle.length > 30 ? s.courseTitle.slice(0, 30) + "…" : s.courseTitle}
                                </span>
                              </td>
                              <td className="py-2 pr-3 text-right text-slate-500">{s.capacity}</td>
                              <td className="py-2 pr-3 text-right text-indigo-600">{s.enrolled}</td>
                              <td className="py-2 pr-3 text-right text-emerald-600">{s.completed}</td>
                              <td className="py-2 pr-3 text-right text-amber-600">{s.dropped}</td>
                              <td className="py-2 pr-3 text-right text-slate-400">{s.waitlisted}</td>
                              <td className="py-2 pr-4 text-right">
                                <span className={utilizationColor(s.utilization)}>{s.utilization}%</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
