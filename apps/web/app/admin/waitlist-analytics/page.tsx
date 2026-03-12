"use client";

/**
 * Admin Waitlist Analytics
 * Deep-dive into waitlist patterns: which sections have the longest queues,
 * which departments are most affected, utilization vs waitlist count.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };

type SectionWL = {
  sectionId: string; sectionCode: string; courseCode: string; courseTitle: string;
  termName: string; capacity: number; enrolled: number; waitlistCount: number;
  avgPosition: number; maxPosition: number; utilizationPct: number;
};

type DeptWL = { dept: string; waitlistCount: number; sectionsAffected: number };

type WLAnalytics = {
  totalWaitlisted: number;
  uniqueStudents: number;
  sectionsWithWaitlist: number;
  sections: SectionWL[];
  byDept: DeptWL[];
};

function UtilBar({ pct }: { pct: number }) {
  const color = pct >= 95 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs text-slate-500 tabular-nums">{pct}%</span>
    </div>
  );
}

export default function WaitlistAnalyticsPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [data, setData] = useState<WLAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms").then((d) => {
      setTerms(d ?? []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setData(null);
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    void apiFetch<WLAnalytics>(`/admin/waitlist-analytics?${params}`)
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [termId]);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Registration Analytics</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">候补名单分析</h1>
        <p className="mt-1 text-sm text-slate-500">各教学班候补队列深度、利用率与部门分布</p>
      </section>

      {/* Term selector */}
      <div className="campus-card p-4 flex items-center gap-3">
        <label className="text-sm font-semibold text-slate-700 shrink-0">学期：</label>
        <select className="campus-select flex-1 max-w-xs" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">所有学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {loading && (
        <div className="campus-card px-6 py-12 text-center text-sm text-slate-500">⏳ 加载中…</div>
      )}

      {data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="campus-kpi">
              <p className="campus-kpi-label">总候补人数</p>
              <p className="campus-kpi-value text-amber-600">{data.totalWaitlisted}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">涉及学生</p>
              <p className="campus-kpi-value text-indigo-600">{data.uniqueStudents}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">有候补的班</p>
              <p className="campus-kpi-value">{data.sectionsWithWaitlist}</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Section table — takes 2 cols */}
            <div className="lg:col-span-2 campus-card p-4 space-y-3">
              <h2 className="text-sm font-bold text-slate-900">候补队列最长班级（前30）</h2>
              {data.sections.length === 0 ? (
                <p className="text-sm text-slate-400">当前无候补记录</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="pb-2 text-left font-semibold">课程</th>
                        <th className="pb-2 text-left font-semibold">班级</th>
                        <th className="pb-2 text-left font-semibold">学期</th>
                        <th className="pb-2 text-right font-semibold">候补</th>
                        <th className="pb-2 text-right font-semibold">最长序号</th>
                        <th className="pb-2 text-left font-semibold pl-3">利用率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sections.map((s) => (
                        <tr key={s.sectionId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 pr-2">
                            <span className="font-mono font-bold text-indigo-700">{s.courseCode}</span>
                            <span className="text-slate-500 ml-1 hidden sm:inline">{s.courseTitle.slice(0, 20)}{s.courseTitle.length > 20 ? "…" : ""}</span>
                          </td>
                          <td className="py-2 pr-2 font-mono text-slate-600">{s.sectionCode}</td>
                          <td className="py-2 pr-2 text-slate-500">{s.termName}</td>
                          <td className="py-2 pr-2 text-right">
                            <span className="font-bold text-amber-700">{s.waitlistCount}</span>
                          </td>
                          <td className="py-2 pr-2 text-right text-slate-600">{s.maxPosition}</td>
                          <td className="py-2 pl-3">
                            <UtilBar pct={s.utilizationPct} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Dept breakdown */}
            <div className="campus-card p-4 space-y-3">
              <h2 className="text-sm font-bold text-slate-900">按院系分布（前15）</h2>
              {data.byDept.length === 0 ? (
                <p className="text-sm text-slate-400">无数据</p>
              ) : (
                <div className="space-y-2">
                  {data.byDept.map((d) => {
                    const maxCount = data.byDept[0]?.waitlistCount ?? 1;
                    const widthPct = Math.round((d.waitlistCount / maxCount) * 100);
                    return (
                      <div key={d.dept}>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="font-medium text-slate-700 truncate max-w-[130px]">{d.dept}</span>
                          <span className="text-slate-500 shrink-0 ml-1">{d.waitlistCount} 人 / {d.sectionsAffected} 班</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-400 rounded-full transition-all"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
