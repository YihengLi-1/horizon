"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type MajorTrend = {
  major: string;
  totalEnrollments: number;
  dropRate: number;
  terms: { termName: string; enrolled: number; completed: number; dropped: number; total: number }[];
};

type TrendsData = { majors: MajorTrend[]; termNames: string[]; totalRows: number };
type Term = { id: string; name: string };

export default function MajorTrendsPage() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    void apiFetch<TrendsData>(`/admin/major-trends?${params}`)
      .then((d) => { setData(d ?? null); setSelected(null); })
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (data?.majors ?? []).filter((m) => !q || m.major.toLowerCase().includes(q));
  }, [data, search]);

  const maxTotal = Math.max(1, ...(data?.majors ?? []).map((m) => m.totalEnrollments));
  const detail = data?.majors.find((m) => m.major === selected);

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">招生分析</p>
        <h1 className="campus-title">专业注册趋势</h1>
        <p className="campus-subtitle">按专业汇总各学期注册量、完成率与退课率</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">专业数</p>
          <p className="campus-kpi-value">{loading ? "—" : data?.majors.length ?? 0}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">总注册次数</p>
          <p className="campus-kpi-value">{loading ? "—" : data?.totalRows ?? 0}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">平均退课率</p>
          <p className="campus-kpi-value text-amber-600">
            {loading || !data?.majors.length ? "—" :
              `${Math.round(data.majors.reduce((s, m) => s + m.dropRate, 0) / data.majors.length * 100)}%`}
          </p>
        </div>
      </section>

      <div className="campus-toolbar">
        <select className="campus-select w-40" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">全部学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input className="campus-input max-w-xs" placeholder="搜索专业…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {selected ? (
          <button type="button" onClick={() => setSelected(null)} className="campus-btn-ghost text-xs">← 返回列表</button>
        ) : null}
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : !selected ? (
        <section className="campus-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <th className="px-4 py-3 text-left">专业</th>
                <th className="px-4 py-3 text-left">注册总量</th>
                <th className="px-4 py-3 text-right">退课率</th>
                <th className="px-4 py-3 text-right">覆盖学期</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">暂无数据</td></tr>
              ) : filtered.map((m) => (
                <tr
                  key={m.major}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelected(m.major)}
                >
                  <td className="px-4 py-3 font-semibold text-[hsl(221_83%_43%)] hover:underline">{m.major}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-[hsl(221_83%_43%)]" style={{ width: `${(m.totalEnrollments / maxTotal) * 100}%` }} />
                      </div>
                      <span className="font-bold text-slate-800">{m.totalEnrollments}</span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${m.dropRate >= 0.3 ? "text-red-600" : m.dropRate >= 0.15 ? "text-amber-600" : "text-emerald-600"}`}>
                    {Math.round(m.dropRate * 100)}%
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">{m.terms.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : detail ? (
        <section className="campus-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="font-bold text-slate-900 text-lg">{detail.major}</p>
            <p className="text-xs text-slate-400 mt-0.5">按学期注册明细</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-400">
                <th className="px-5 py-2 text-left">学期</th>
                <th className="px-5 py-2 text-right">总注册</th>
                <th className="px-5 py-2 text-right">在读</th>
                <th className="px-5 py-2 text-right">已完成</th>
                <th className="px-5 py-2 text-right">已退课</th>
              </tr>
            </thead>
            <tbody>
              {detail.terms.map((t) => (
                <tr key={t.termName} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-2.5 font-semibold text-slate-800">{t.termName}</td>
                  <td className="px-5 py-2.5 text-right font-mono font-bold text-slate-800">{t.total}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-blue-600">{t.enrolled}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-emerald-600">{t.completed}</td>
                  <td className={`px-5 py-2.5 text-right font-mono ${t.dropped > 0 ? "text-red-500" : "text-slate-300"}`}>{t.dropped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
