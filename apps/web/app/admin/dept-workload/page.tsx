"use client";

/**
 * Admin Department Workload Overview
 * Groups sections by course prefix, shows instructor count, section count,
 * capacity, enrollment, and utilization.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };

type DeptRow = {
  prefix: string;
  instructorCount: number;
  sectionCount: number;
  totalCapacity: number;
  totalEnrolled: number;
  utilization: number;
};

export default function DeptWorkloadPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [data, setData] = useState<DeptRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms")
      .then((d) => setTerms((d ?? []).sort((a, b) => b.name.localeCompare(a.name))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setData([]);
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    void apiFetch<DeptRow[]>(`/admin/dept-workload?${params}`)
      .then((d) => setData(d ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [termId]);

  const totalSections = data.reduce((s, r) => s + r.sectionCount, 0);
  const totalCapacity = data.reduce((s, r) => s + r.totalCapacity, 0);
  const totalEnrolled = data.reduce((s, r) => s + r.totalEnrolled, 0);
  const overallUtil = totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;
  const maxSections = Math.max(1, ...data.map((r) => r.sectionCount));

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Workload Analytics</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">学院工作负荷总览</h1>
        <p className="mt-1 text-sm text-slate-500">按课程前缀分组，展示各学院教学班、师资与容量利用情况</p>
      </section>

      <div className="campus-toolbar gap-2">
        <select className="campus-select" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">所有学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {!loading && data.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="campus-kpi">
            <p className="campus-kpi-label">课程组</p>
            <p className="campus-kpi-value text-indigo-600">{data.length}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">总班级数</p>
            <p className="campus-kpi-value">{totalSections}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">总容量</p>
            <p className="campus-kpi-value">{totalCapacity}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">综合利用率</p>
            <p className={`campus-kpi-value ${overallUtil >= 80 ? "text-red-600" : overallUtil >= 60 ? "text-amber-600" : "text-emerald-600"}`}>
              {overallUtil}%
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : data.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">暂无数据</div>
      ) : (
        <div className="space-y-4">
          {/* Bar chart overview */}
          <div className="campus-card p-4">
            <h2 className="text-sm font-bold text-slate-900 mb-4">各课程组班级数量对比</h2>
            <div className="space-y-2">
              {data.map((r) => (
                <div key={r.prefix}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="font-mono font-bold text-indigo-700 w-16">{r.prefix}</span>
                    <div className="flex gap-4 text-slate-500 text-right">
                      <span>{r.sectionCount} 班 · {r.instructorCount} 师</span>
                      <span className={`font-semibold ${r.utilization >= 80 ? "text-red-600" : r.utilization >= 60 ? "text-amber-600" : "text-emerald-600"}`}>
                        {r.utilization}%
                      </span>
                    </div>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${r.utilization >= 80 ? "bg-red-400" : r.utilization >= 60 ? "bg-amber-400" : "bg-emerald-400"}`}
                      style={{ width: `${(r.sectionCount / maxSections) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="campus-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 pl-4 text-left font-semibold">课程组</th>
                    <th className="pb-2 pr-3 text-right font-semibold">教师数</th>
                    <th className="pb-2 pr-3 text-right font-semibold">班级数</th>
                    <th className="pb-2 pr-3 text-right font-semibold">总容量</th>
                    <th className="pb-2 pr-3 text-right font-semibold">已选</th>
                    <th className="pb-2 pr-4 text-right font-semibold">利用率</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.prefix} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 pl-4 pr-3 font-mono font-bold text-indigo-700">{r.prefix}</td>
                      <td className="py-2.5 pr-3 text-right text-slate-600">{r.instructorCount}</td>
                      <td className="py-2.5 pr-3 text-right font-bold text-slate-700">{r.sectionCount}</td>
                      <td className="py-2.5 pr-3 text-right text-slate-500">{r.totalCapacity}</td>
                      <td className="py-2.5 pr-3 text-right text-emerald-600">{r.totalEnrolled}</td>
                      <td className="py-2.5 pr-4 text-right">
                        <span className={`font-bold ${r.utilization >= 80 ? "text-red-600" : r.utilization >= 60 ? "text-amber-600" : "text-emerald-600"}`}>
                          {r.utilization}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
