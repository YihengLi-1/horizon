"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type SectionRow = {
  termId: string;
  termName: string;
  courseCode: string;
  courseTitle: string;
  sectionId: string;
  capacity: number;
  enrolled: number;
  completed: number;
  dropped: number;
  waitlisted: number;
  utilization: number;
};

type TermGroup = {
  termId: string;
  termName: string;
  totalCapacity: number;
  totalEnrolled: number;
  overallUtilization: number;
  sections: SectionRow[];
};

type CapacityData = {
  terms: TermGroup[];
  summary: {
    totalSections: number;
    totalCapacity: number;
    totalEnrolled: number;
    overCapacitySections: number;
    fullSections: number;
  };
};

export default function TermCapacityPage() {
  const [data, setData] = useState<CapacityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    void apiFetch<CapacityData>("/admin/term-capacity")
      .then((d) => setData(d ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  function toggle(termId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(termId)) next.delete(termId);
      else next.add(termId);
      return next;
    });
  }

  const filteredTerms = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.terms.map((t) => ({
      ...t,
      sections: t.sections.filter((s) => !q || s.courseCode.toLowerCase().includes(q) || s.courseTitle.toLowerCase().includes(q)),
    })).filter((t) => !q || t.sections.length > 0 || t.termName.toLowerCase().includes(q));
  }, [data, search]);

  function utilBg(pct: number) {
    if (pct >= 100) return "bg-red-400";
    if (pct >= 80) return "bg-amber-400";
    return "bg-emerald-400";
  }

  function exportCsv() {
    const allSections = (data?.terms ?? []).flatMap((t) => t.sections);
    const headers = ["学期", "课程代码", "课程名称", "教学班ID", "容量", "注册", "已完成", "已退课", "候补", "利用率(%)"];
    const rows = [
      headers.join(","),
      ...allSections.map((s) => [
        `"${s.termName}"`, s.courseCode, `"${s.courseTitle}"`, s.sectionId,
        s.capacity, s.enrolled, s.completed, s.dropped, s.waitlisted, s.utilization
      ].join(","))
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `term-capacity-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">资源分析</p>
        <h1 className="campus-hero-title">学期容量汇总</h1>
        <p className="campus-hero-subtitle">按学期展示所有教学班的容量使用情况</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">教学班总数</p>
          <p className="campus-kpi-value">{loading ? "—" : data?.summary.totalSections}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">总容量</p>
          <p className="campus-kpi-value">{loading ? "—" : data?.summary.totalCapacity}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">满员班（≥90%）</p>
          <p className="campus-kpi-value text-amber-600">{loading ? "—" : data?.summary.fullSections}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">超容班（&gt;100%）</p>
          <p className="campus-kpi-value text-red-600">{loading ? "—" : data?.summary.overCapacitySections}</p>
        </div>
      </section>

      <div className="campus-toolbar">
        <input
          className="campus-input max-w-xs"
          placeholder="搜索课程代码或名称…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={() => setExpanded(new Set((data?.terms ?? []).map((t) => t.termId)))} className="campus-btn-ghost text-xs">全部展开</button>
        <button type="button" onClick={() => setExpanded(new Set())} className="campus-btn-ghost text-xs">全部收起</button>
        <button type="button" onClick={exportCsv} disabled={!data} className="campus-btn-ghost shrink-0 disabled:opacity-40">CSV 导出</button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : (
        <div className="space-y-3">
          {filteredTerms.map((term) => {
            const open = expanded.has(term.termId);
            return (
              <div key={term.termId} className="campus-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(term.termId)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{term.termName}</p>
                    <p className="text-xs text-slate-400">{term.sections.length} 个教学班</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-700">{term.totalEnrolled}/{term.totalCapacity}</p>
                      <p className="text-xs text-slate-400">注册/容量</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 rounded-full bg-slate-100">
                        <div className={`h-2 rounded-full ${utilBg(term.overallUtilization)}`} style={{ width: `${Math.min(100, term.overallUtilization)}%` }} />
                      </div>
                      <span className={`text-xs font-bold ${term.overallUtilization >= 90 ? "text-red-600" : term.overallUtilization >= 70 ? "text-amber-600" : "text-emerald-600"}`}>
                        {term.overallUtilization}%
                      </span>
                    </div>
                    <span className="text-slate-400 text-sm">{open ? "▲" : "▼"}</span>
                  </div>
                </button>
                {open ? (
                  <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs font-semibold text-slate-400">
                          <th className="px-5 py-2 text-left">课程</th>
                          <th className="px-5 py-2 text-right">容量</th>
                          <th className="px-5 py-2 text-right">在读</th>
                          <th className="px-5 py-2 text-right">完成</th>
                          <th className="px-5 py-2 text-right">退课</th>
                          <th className="px-5 py-2 text-right">候补</th>
                          <th className="px-5 py-2 text-left">利用率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {term.sections.map((s) => (
                          <tr key={s.sectionId} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-5 py-2.5">
                              <span className="font-semibold text-slate-800">{s.courseCode}</span>
                              <span className="text-slate-400 ml-1 text-xs truncate max-w-[120px]">— {s.courseTitle}</span>
                            </td>
                            <td className="px-5 py-2.5 text-right font-mono text-slate-500">{s.capacity}</td>
                            <td className="px-5 py-2.5 text-right font-mono text-slate-700">{s.enrolled}</td>
                            <td className="px-5 py-2.5 text-right font-mono text-emerald-600">{s.completed}</td>
                            <td className="px-5 py-2.5 text-right font-mono text-red-400">{s.dropped}</td>
                            <td className="px-5 py-2.5 text-right font-mono text-amber-500">{s.waitlisted}</td>
                            <td className="px-5 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 rounded-full bg-slate-100">
                                  <div className={`h-1.5 rounded-full ${utilBg(s.utilization)}`} style={{ width: `${Math.min(100, s.utilization)}%` }} />
                                </div>
                                <span className={`text-xs font-bold ${s.utilization >= 100 ? "text-red-600" : s.utilization >= 80 ? "text-amber-600" : "text-emerald-600"}`}>
                                  {s.utilization}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
