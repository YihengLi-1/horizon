"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type SectionQueue = {
  sectionId: string;
  sectionCode: string;
  courseCode: string;
  courseTitle: string;
  termName: string;
  capacity: number;
  enrolled: number;
  waitlistCount: number;
  avgPosition: number;
  maxPosition: number;
  utilizationPct: number;
};

type DeptBreakdown = {
  dept: string;
  waitlistCount: number;
  sectionsAffected: number;
};

type WaitlistData = {
  totalWaitlisted: number;
  uniqueStudents: number;
  sectionsWithWaitlist: number;
  sections: SectionQueue[];
  byDept: DeptBreakdown[];
};

type Term = { id: string; name: string };

export default function WaitlistAnalyticsPage() {
  const [data, setData] = useState<WaitlistData | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"sections" | "dept">("sections");

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    void apiFetch<WaitlistData>(`/admin/waitlist-analytics?${params}`)
      .then((d) => setData(d ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId]);

  const filteredSections = useMemo(() => {
    const q = search.toLowerCase();
    return (data?.sections ?? []).filter(
      (s) => !q || s.courseCode.toLowerCase().includes(q) || s.courseTitle.toLowerCase().includes(q) || s.sectionCode.toLowerCase().includes(q)
    );
  }, [data, search]);

  const filteredDept = useMemo(() => {
    const q = search.toLowerCase();
    return (data?.byDept ?? []).filter((d) => !q || d.dept.toLowerCase().includes(q));
  }, [data, search]);

  const maxWait = Math.max(1, ...(data?.sections ?? []).map((s) => s.waitlistCount));

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">注册管理</p>
        <h1 className="campus-hero-title">候补名单分析</h1>
        <p className="campus-hero-subtitle">各教学班候补队列深度与学生分布情况</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">候补总人次</p>
          <p className="campus-kpi-value text-amber-600">{loading ? "—" : data?.totalWaitlisted ?? 0}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">涉及学生数</p>
          <p className="campus-kpi-value">{loading ? "—" : data?.uniqueStudents ?? 0}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">有候补的教学班</p>
          <p className="campus-kpi-value text-red-600">{loading ? "—" : data?.sectionsWithWaitlist ?? 0}</p>
        </div>
      </section>

      <div className="campus-toolbar">
        <select className="campus-select w-40" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">全部学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setTab("sections")}
            className={`px-3 py-1.5 text-sm font-medium transition ${tab === "sections" ? "bg-[hsl(221_83%_43%)] text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            教学班队列
          </button>
          <button
            type="button"
            onClick={() => setTab("dept")}
            className={`px-3 py-1.5 text-sm font-medium transition ${tab === "dept" ? "bg-[hsl(221_83%_43%)] text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            院系分布
          </button>
        </div>
        <input
          className="campus-input max-w-xs"
          placeholder="搜索…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {tab === "sections" ? (
        <section className="campus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left">课程</th>
                  <th className="px-4 py-3 text-left">教学班</th>
                  <th className="px-4 py-3 text-right">容量</th>
                  <th className="px-4 py-3 text-right">已注册</th>
                  <th className="px-4 py-3 text-left">候补人数</th>
                  <th className="px-4 py-3 text-right">平均位次</th>
                  <th className="px-4 py-3 text-right">利用率</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
                ) : filteredSections.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">暂无候补数据</td></tr>
                ) : (
                  filteredSections.map((s) => (
                    <tr key={s.sectionId} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{s.courseCode}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[160px]">{s.courseTitle}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.sectionCode}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-500">{s.capacity}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">{s.enrolled}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full bg-amber-400"
                              style={{ width: `${(s.waitlistCount / maxWait) * 100}%` }}
                            />
                          </div>
                          <span className="font-bold text-amber-700">{s.waitlistCount}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">{s.avgPosition}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${s.utilizationPct >= 90 ? "text-red-600" : s.utilizationPct >= 70 ? "text-amber-600" : "text-emerald-600"}`}>
                          {s.utilizationPct}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="campus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 text-left">专业/院系</th>
                  <th className="px-4 py-3 text-left">候补人次</th>
                  <th className="px-4 py-3 text-right">涉及教学班</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
                ) : filteredDept.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-10 text-center text-slate-400">暂无数据</td></tr>
                ) : (
                  filteredDept.map((d) => {
                    const maxCount = Math.max(1, ...(data?.byDept ?? []).map((x) => x.waitlistCount));
                    return (
                      <tr key={d.dept} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-800">{d.dept}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-32 rounded-full bg-slate-100">
                              <div
                                className="h-2 rounded-full bg-amber-400"
                                style={{ width: `${(d.waitlistCount / maxCount) * 100}%` }}
                              />
                            </div>
                            <span className="font-bold text-amber-700">{d.waitlistCount}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600">{d.sectionsAffected}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
