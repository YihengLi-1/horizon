"use client";

/**
 * Admin Course Demand Comparison
 * Shows cross-term enrollment trends for each course.
 * Admins can filter by course to see demand history.
 */

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type TermStat = {
  termId: string; termName: string;
  enrolled: number; completed: number; dropped: number; waitlisted: number; capacity: number; total: number;
};

type CourseDemand = {
  courseId: string; courseCode: string; courseTitle: string; credits: number;
  terms: TermStat[];
};

export default function CourseDemandComparePage() {
  const [data, setData] = useState<CourseDemand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CourseDemand | null>(null);

  useEffect(() => {
    void apiFetch<CourseDemand[]>("/admin/course-demand-compare")
      .then((d) => setData(d ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => data.filter((c) =>
      !search ||
      c.courseCode.toLowerCase().includes(search.toLowerCase()) ||
      c.courseTitle.toLowerCase().includes(search.toLowerCase())
    ),
    [data, search]
  );

  // Collect all unique term names across data
  const allTerms = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const c of data) {
      for (const t of c.terms) {
        if (!seen.has(t.termName)) { seen.add(t.termName); result.push(t.termName); }
      }
    }
    return result;
  }, [data]);

  function sparkbar(terms: TermStat[]) {
    const maxTotal = Math.max(1, ...terms.map((t) => t.total));
    return (
      <div className="flex items-end gap-0.5 h-8">
        {terms.map((t) => (
          <div
            key={t.termId}
            title={`${t.termName}: ${t.total} 人`}
            className="flex-1 bg-indigo-400 rounded-t opacity-80 hover:opacity-100 cursor-default transition"
            style={{ height: `${(t.total / maxTotal) * 100}%`, minHeight: "2px" }}
          />
        ))}
      </div>
    );
  }

  const viewCourse = selected ?? null;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Demand Analytics</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">课程需求跨学期对比</h1>
        <p className="mt-1 text-sm text-slate-500">查看各课程在不同学期的注册量趋势与容量利用率</p>
      </section>

      <div className="campus-toolbar gap-2">
        <input
          className="campus-input flex-1 min-w-48"
          placeholder="搜索课程代码或名称…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {selected && (
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="campus-chip border-slate-200 bg-slate-50 text-slate-600"
          >
            ← 返回列表
          </button>
        )}
      </div>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : viewCourse ? (
        /* Detail view */
        <div className="space-y-4">
          <div className="campus-card p-4 space-y-1">
            <p className="font-mono text-lg font-bold text-indigo-700">{viewCourse.courseCode}</p>
            <p className="text-slate-700">{viewCourse.courseTitle}</p>
            <p className="text-xs text-slate-400">{viewCourse.credits} 学分</p>
          </div>

          {/* Bar chart */}
          <div className="campus-card p-4">
            <h2 className="text-sm font-bold text-slate-900 mb-4">各学期注册量（已选 + 完成 + 退课 + 候补）</h2>
            {viewCourse.terms.length === 0 ? (
              <p className="text-sm text-slate-400">暂无数据</p>
            ) : (
              <>
                <svg viewBox="0 0 700 220" className="w-full">
                  <line x1="60" y1="190" x2="680" y2="190" stroke="#e2e8f0" strokeWidth="1.5" />
                  <line x1="60" y1="10" x2="60" y2="190" stroke="#e2e8f0" strokeWidth="1.5" />
                  {(() => {
                    const maxTotal = Math.max(1, ...viewCourse.terms.map((t) => t.total));
                    const n = viewCourse.terms.length;
                    const barW = Math.min(50, (620 / Math.max(n, 1)) * 0.6);
                    return viewCourse.terms.map((t, i) => {
                      const cx = 60 + (i / Math.max(n - 1, 1)) * 620;
                      const stackDefs = [
                        { val: t.enrolled, color: "#4f46e5" },
                        { val: t.completed, color: "#10b981" },
                        { val: t.dropped, color: "#f59e0b" },
                        { val: t.waitlisted, color: "#e2e8f0" },
                      ];
                      let cumH = 0;
                      return (
                        <g key={t.termId}>
                          {stackDefs.map(({ val, color }) => {
                            const h = (val / maxTotal) * 170;
                            const y = 190 - cumH - h;
                            cumH += h;
                            return h > 0 ? <rect key={color} x={cx - barW / 2} y={y} width={barW} height={h} fill={color} rx="1" /> : null;
                          })}
                          <text x={cx} y="205" textAnchor="middle" fontSize="7.5" fill="#94a3b8">
                            {t.termName.slice(-6)}
                          </text>
                          <text x={cx} y={190 - cumH - 3} textAnchor="middle" fontSize="8" fill="#475569" fontWeight="bold">
                            {t.total}
                          </text>
                        </g>
                      );
                    });
                  })()}
                </svg>
                <div className="flex gap-4 mt-1 flex-wrap text-xs text-slate-500">
                  {[["bg-indigo-600", "在读"], ["bg-emerald-500", "完成"], ["bg-amber-400", "退课"], ["bg-slate-200", "候补"]].map(([bg, lbl]) => (
                    <span key={lbl} className="flex items-center gap-1">
                      <span className={`inline-block w-3 h-3 rounded-sm ${bg}`} />{lbl}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Table */}
          <div className="campus-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 pl-4 text-left font-semibold">学期</th>
                    <th className="pb-2 pr-3 text-right font-semibold">容量</th>
                    <th className="pb-2 pr-3 text-right font-semibold">在读</th>
                    <th className="pb-2 pr-3 text-right font-semibold">完成</th>
                    <th className="pb-2 pr-3 text-right font-semibold">退课</th>
                    <th className="pb-2 pr-3 text-right font-semibold">候补</th>
                    <th className="pb-2 pr-4 text-right font-semibold text-indigo-600">利用率</th>
                  </tr>
                </thead>
                <tbody>
                  {viewCourse.terms.map((t) => {
                    const pct = t.capacity > 0 ? Math.round(((t.enrolled + t.completed) / t.capacity) * 100) : 0;
                    return (
                      <tr key={t.termId} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2.5 pl-4 pr-3 font-medium text-slate-800">{t.termName}</td>
                        <td className="py-2.5 pr-3 text-right text-slate-500">{t.capacity}</td>
                        <td className="py-2.5 pr-3 text-right text-indigo-600">{t.enrolled}</td>
                        <td className="py-2.5 pr-3 text-right text-emerald-600">{t.completed}</td>
                        <td className="py-2.5 pr-3 text-right text-amber-600">{t.dropped}</td>
                        <td className="py-2.5 pr-3 text-right text-slate-400">{t.waitlisted}</td>
                        <td className="py-2.5 pr-4 text-right">
                          <span className={pct >= 90 ? "text-red-600 font-bold" : pct >= 70 ? "text-amber-600" : "text-emerald-600"}>
                            {pct}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* List view */
        filtered.length === 0 ? (
          <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">暂无课程数据</div>
        ) : (
          <div className="campus-card overflow-hidden">
            {!loading && (
              <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-500">
                共 {filtered.length} 门课程
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 pl-4 text-left font-semibold">课程</th>
                    <th className="pb-2 pr-3 text-right font-semibold">学期数</th>
                    <th className="pb-2 pr-3 text-right font-semibold">总注册</th>
                    <th className="pb-2 pr-4 font-semibold" style={{ minWidth: 100 }}>趋势</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const totalEnrolled = c.terms.reduce((s, t) => s + t.total, 0);
                    return (
                      <tr
                        key={c.courseId}
                        className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer"
                        onClick={() => setSelected(c)}
                      >
                        <td className="py-2.5 pl-4 pr-3">
                          <span className="font-mono font-bold text-indigo-700">{c.courseCode}</span>
                          <span className="text-slate-500 ml-2 hidden sm:inline">{c.courseTitle.slice(0, 30)}{c.courseTitle.length > 30 ? "…" : ""}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-slate-600">{c.terms.length}</td>
                        <td className="py-2.5 pr-3 text-right font-bold text-slate-700">{totalEnrolled}</td>
                        <td className="py-2.5 pr-4">{sparkbar(c.terms)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
