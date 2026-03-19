"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };

type TermStats = {
  id: string;
  name: string;
  totalEnrolled: number;
  totalWaitlisted: number;
  totalDropped: number;
  totalCompleted: number;
  sectionCount: number;
  avgGpa: number | null;
  utilizationPct: number | null;
  topDepts: { dept: string; count: number }[];
};

type CompareResult = {
  termA: TermStats;
  termB: TermStats;
};

type MetricRow = {
  label: string;
  keyA: keyof Omit<TermStats, "id" | "name" | "topDepts">;
  format?: (v: number | null) => string;
  higherBetter?: boolean;
};

const METRICS: MetricRow[] = [
  { label: "教学班数", keyA: "sectionCount", higherBetter: true },
  { label: "在读学生", keyA: "totalEnrolled", higherBetter: true },
  { label: "候补学生", keyA: "totalWaitlisted", higherBetter: false },
  { label: "退课学生", keyA: "totalDropped", higherBetter: false },
  { label: "已完课", keyA: "totalCompleted", higherBetter: true },
  {
    label: "平均 GPA",
    keyA: "avgGpa",
    format: (v) => (v !== null ? v.toFixed(2) : "—"),
    higherBetter: true,
  },
  {
    label: "座位使用率",
    keyA: "utilizationPct",
    format: (v) => (v !== null ? `${v}%` : "—"),
    higherBetter: true,
  },
];

function diff(a: number | null, b: number | null): string {
  if (a === null || b === null) return "—";
  const d = a - b;
  if (d === 0) return "—";
  return d > 0 ? `+${d}` : `${d}`;
}

function diffStyle(a: number | null, b: number | null, higherBetter = true): string {
  if (a === null || b === null || a === b) return "text-slate-400";
  const better = higherBetter ? a > b : a < b;
  return better ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold";
}

export default function TermComparisonPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termAId, setTermAId] = useState("");
  const [termBId, setTermBId] = useState("");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? [])).catch(() => {});
  }, []);

  function compare() {
    if (!termAId || !termBId || termAId === termBId) return;
    setLoading(true);
    setError("");
    setResult(null);
    void apiFetch<CompareResult>(`/admin/term-comparison?termAId=${termAId}&termBId=${termBId}`)
      .then((d) => setResult(d))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学期分析</p>
        <h1 className="campus-title">学期横向对比</h1>
        <p className="campus-subtitle">选择两个学期，并排比较关键招生与学业指标</p>
      </section>

      {/* Term selector */}
      <div className="campus-card p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">学期 A</label>
            <select
              className="campus-select w-full"
              value={termAId}
              onChange={(e) => setTermAId(e.target.value)}
            >
              <option value="">请选择学期</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">学期 B</label>
            <select
              className="campus-select w-full"
              value={termBId}
              onChange={(e) => setTermBId(e.target.value)}
            >
              <option value="">请选择学期</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={compare}
            disabled={!termAId || !termBId || termAId === termBId || loading}
            className="campus-btn-ghost disabled:opacity-40 shrink-0"
          >
            {loading ? "对比中…" : "开始对比"}
          </button>
        </div>
        {termAId && termBId && termAId === termBId ? (
          <p className="mt-2 text-xs text-red-500">请选择两个不同的学期。</p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {result ? (
        <>
          {/* Metrics table */}
          <section className="campus-card overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-800">指标对比</h2>
              <p className="text-xs text-slate-500 mt-0.5">括号内数字为学期 A 相对学期 B 的变化量</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs font-semibold text-slate-500 border-b border-slate-200">
                    <th className="px-5 py-3 text-left">指标</th>
                    <th className="px-5 py-3 text-right text-blue-600">{result.termA.name}</th>
                    <th className="px-5 py-3 text-right text-violet-600">{result.termB.name}</th>
                    <th className="px-5 py-3 text-right">变化（A−B）</th>
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map((m) => {
                    const va = result.termA[m.keyA] as number | null;
                    const vb = result.termB[m.keyA] as number | null;
                    const fmt = m.format ?? ((v: number | null) => (v !== null ? String(v) : "—"));
                    return (
                      <tr key={m.label} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-5 py-3 font-medium text-slate-700">{m.label}</td>
                        <td className="px-5 py-3 text-right font-mono font-semibold text-blue-700">{fmt(va)}</td>
                        <td className="px-5 py-3 text-right font-mono font-semibold text-violet-700">{fmt(vb)}</td>
                        <td className={`px-5 py-3 text-right font-mono text-sm ${diffStyle(va, vb, m.higherBetter)}`}>
                          {m.keyA === "avgGpa" || m.keyA === "utilizationPct"
                            ? va !== null && vb !== null
                              ? (() => {
                                  const d = va - vb;
                                  return d === 0 ? "—" : (d > 0 ? `+${d.toFixed(2)}` : d.toFixed(2));
                                })()
                              : "—"
                            : diff(va, vb)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Top depts side by side */}
          <div className="grid gap-4 sm:grid-cols-2">
            {[result.termA, result.termB].map((term, i) => (
              <section key={term.id} className="campus-card p-5">
                <h3 className={`text-sm font-bold mb-3 ${i === 0 ? "text-blue-700" : "text-violet-700"}`}>
                  {term.name} — 热门院系
                </h3>
                {term.topDepts.length === 0 ? (
                  <p className="text-xs text-slate-400">暂无数据</p>
                ) : (
                  <ul className="space-y-2">
                    {term.topDepts.map((d) => (
                      <li key={d.dept} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-slate-700">{d.dept}</span>
                        <span className="font-bold text-slate-900">{d.count} 人</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      ) : !loading && !error ? (
        <div className="campus-card p-10 text-center text-slate-400">
          请选择两个学期后点击「开始对比」
        </div>
      ) : null}
    </div>
  );
}
