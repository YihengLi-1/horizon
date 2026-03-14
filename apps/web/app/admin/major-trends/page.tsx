"use client";

/**
 * Admin Enrollment Trends by Major
 * Shows per-major enrollment counts across terms with drop rate analysis.
 */

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type TermStat = { termName: string; enrolled: number; completed: number; dropped: number; total: number };
type MajorData = {
  major: string; terms: TermStat[];
  totalEnrollments: number; dropRate: number;
};
type TrendsData = { majors: MajorData[]; termNames: string[]; totalRows: number };

function sparkbar(terms: TermStat[]) {
  const maxTotal = Math.max(1, ...terms.map((t) => t.total));
  return (
    <div className="flex items-end gap-0.5 h-8">
      {terms.map((t, i) => (
        <div
          key={i}
          title={`${t.termName}: ${t.total}`}
          className="flex-1 bg-indigo-400 rounded-t hover:opacity-70 transition"
          style={{ height: `${(t.total / maxTotal) * 100}%`, minHeight: "2px" }}
        />
      ))}
    </div>
  );
}

export default function MajorTrendsPage() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"total" | "dropRate">("total");
  const [selected, setSelected] = useState<MajorData | null>(null);

  useEffect(() => {
    void apiFetch<TrendsData>("/admin/major-trends")
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.majors
      .filter((m) => !search || m.major.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => sortBy === "total" ? b.totalEnrollments - a.totalEnrollments : b.dropRate - a.dropRate);
  }, [data, search, sortBy]);

  const viewMajor = selected;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Enrollment Analytics</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">各专业注册趋势</h1>
        <p className="mt-1 text-sm text-slate-500">按专业查看历史学期注册量与退课率</p>
      </section>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      <div className="campus-toolbar gap-2 flex-wrap">
        <input
          className="campus-input flex-1 min-w-48"
          placeholder="搜索专业…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="campus-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "total" | "dropRate")}
        >
          <option value="total">按总注册量排序</option>
          <option value="dropRate">按退课率排序</option>
        </select>
        {selected && (
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="campus-chip border-slate-200 bg-slate-50 text-slate-600"
          >
            ← 返回
          </button>
        )}
      </div>

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : viewMajor ? (
        /* Detail view */
        <div className="space-y-4">
          <div className="campus-card p-4">
            <p className="font-bold text-lg text-indigo-700">{viewMajor.major}</p>
            <div className="flex gap-6 mt-2 text-sm">
              <span className="text-slate-500">总注册: <strong className="text-slate-800">{viewMajor.totalEnrollments}</strong></span>
              <span className="text-slate-500">退课率: <strong className={viewMajor.dropRate > 0.2 ? "text-red-600" : "text-slate-800"}>{(viewMajor.dropRate * 100).toFixed(1)}%</strong></span>
            </div>
          </div>

          {/* Bar chart per term */}
          <div className="campus-card p-4">
            <h2 className="text-sm font-bold text-slate-900 mb-4">各学期注册量</h2>
            {viewMajor.terms.length === 0 ? (
              <p className="text-sm text-slate-400">暂无数据</p>
            ) : (
              <div className="flex items-end gap-3 h-32 overflow-x-auto">
                {viewMajor.terms.map((t, i) => {
                  const maxT = Math.max(1, ...viewMajor.terms.map((x) => x.total));
                  return (
                    <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-[40px]">
                      <span className="text-xs text-slate-500 font-bold">{t.total}</span>
                      <div className="flex items-end gap-0.5 h-20 w-full">
                        <div className="bg-indigo-500 rounded-t flex-1" style={{ height: `${(t.enrolled / maxT) * 100}%`, minHeight: t.enrolled > 0 ? "2px" : "0" }} title={`在读: ${t.enrolled}`} />
                        <div className="bg-emerald-400 rounded-t flex-1" style={{ height: `${(t.completed / maxT) * 100}%`, minHeight: t.completed > 0 ? "2px" : "0" }} title={`完成: ${t.completed}`} />
                        <div className="bg-amber-400 rounded-t flex-1" style={{ height: `${(t.dropped / maxT) * 100}%`, minHeight: t.dropped > 0 ? "2px" : "0" }} title={`退课: ${t.dropped}`} />
                      </div>
                      <span className="text-xs text-slate-400 text-center leading-tight">{t.termName.slice(-6)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex gap-4 mt-2 text-xs text-slate-500">
              {[["bg-indigo-500", "在读"], ["bg-emerald-400", "完成"], ["bg-amber-400", "退课"]].map(([bg, lbl]) => (
                <span key={lbl} className="flex items-center gap-1"><span className={`w-3 h-3 rounded ${bg}`} />{lbl}</span>
              ))}
            </div>
          </div>

          <div className="campus-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 pl-4 text-left font-semibold">学期</th>
                    <th className="pb-2 pr-3 text-right font-semibold">在读</th>
                    <th className="pb-2 pr-3 text-right font-semibold">完成</th>
                    <th className="pb-2 pr-3 text-right font-semibold">退课</th>
                    <th className="pb-2 pr-4 text-right font-semibold">合计</th>
                  </tr>
                </thead>
                <tbody>
                  {viewMajor.terms.map((t, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 pl-4 pr-3 font-medium text-slate-800">{t.termName}</td>
                      <td className="py-2.5 pr-3 text-right text-indigo-600">{t.enrolled}</td>
                      <td className="py-2.5 pr-3 text-right text-emerald-600">{t.completed}</td>
                      <td className="py-2.5 pr-3 text-right text-amber-600">{t.dropped}</td>
                      <td className="py-2.5 pr-4 text-right font-bold text-slate-700">{t.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* List view */
        <div className="campus-card overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-500">
            共 {filtered.length} 个专业
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="pb-2 pl-4 text-left font-semibold">专业</th>
                  <th className="pb-2 pr-3 text-right font-semibold">学期数</th>
                  <th className="pb-2 pr-3 text-right font-semibold">总注册</th>
                  <th className="pb-2 pr-3 text-right font-semibold">退课率</th>
                  <th className="pb-2 pr-4 font-semibold" style={{ minWidth: 80 }}>趋势</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr
                    key={m.major}
                    className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setSelected(m)}
                  >
                    <td className="py-2.5 pl-4 pr-3 font-medium text-slate-800">{m.major}</td>
                    <td className="py-2.5 pr-3 text-right text-slate-500">{m.terms.length}</td>
                    <td className="py-2.5 pr-3 text-right font-bold text-slate-700">{m.totalEnrollments}</td>
                    <td className="py-2.5 pr-3 text-right">
                      <span className={m.dropRate > 0.2 ? "text-red-600 font-bold" : m.dropRate > 0.1 ? "text-amber-600" : "text-emerald-600"}>
                        {(m.dropRate * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">{sparkbar(m.terms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
