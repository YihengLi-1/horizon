"use client";

import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

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

type CompareResult = { termA: TermStats; termB: TermStats };

function Delta({ a, b, invert = false }: { a: number | null; b: number | null; invert?: boolean }) {
  if (a == null || b == null) return <span className="text-xs text-slate-400">—</span>;
  const diff = b - a;
  const pct = a !== 0 ? Math.round((diff / a) * 100) : 0;
  const isPositive = invert ? diff < 0 : diff > 0;
  if (diff === 0) return <span className="text-xs text-slate-400">±0</span>;
  return (
    <span className={`text-xs font-semibold ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
      {diff > 0 ? "+" : ""}{diff.toFixed ? diff.toFixed(0) : diff}
      {pct !== 0 && ` (${pct > 0 ? "+" : ""}${pct}%)`}
    </span>
  );
}

function StatRow({
  label,
  a,
  b,
  fmt = String,
  invert,
  unit = ""
}: {
  label: string;
  a: number | null;
  b: number | null;
  fmt?: (n: number) => string;
  invert?: boolean;
  unit?: string;
}) {
  return (
    <tr className="border-b border-slate-100">
      <td className="py-2 pr-4 text-sm font-medium text-slate-700">{label}</td>
      <td className="py-2 pr-4 text-sm text-slate-900 tabular-nums">{a != null ? `${fmt(a)}${unit}` : "—"}</td>
      <td className="py-2 pr-4 text-sm text-slate-900 tabular-nums">{b != null ? `${fmt(b)}${unit}` : "—"}</td>
      <td className="py-2 text-right">
        <Delta a={a} b={b} invert={invert} />
      </td>
    </tr>
  );
}

export default function TermComparePage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termAId, setTermAId] = useState("");
  const [termBId, setTermBId] = useState("");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Term[]>("/academics/terms").then(setTerms).catch(() => {});
  }, []);

  const compare = useCallback(async () => {
    if (!termAId || !termBId || termAId === termBId) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await apiFetch<CompareResult>(
        `/admin/term-comparison?termAId=${termAId}&termBId=${termBId}`
      );
      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [termAId, termBId]);

  const { termA, termB } = result ?? {};

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">分析对比</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">学期对比</h1>
        <p className="mt-1 text-sm text-slate-600 md:text-base">
          对比两个学期的选课、成绩与容量利用情况。
        </p>
      </section>

      <section className="campus-card p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">学期 A（基准）</label>
            <select
              className="campus-select w-full"
              value={termAId}
              onChange={(e) => { setTermAId(e.target.value); setResult(null); }}
            >
              <option value="">选择学期</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">学期 B（对比）</label>
            <select
              className="campus-select w-full"
              value={termBId}
              onChange={(e) => { setTermBId(e.target.value); setResult(null); }}
            >
              <option value="">选择学期</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={compare}
              disabled={!termAId || !termBId || termAId === termBId || loading}
              className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "对比中…" : "开始对比"}
            </button>
          </div>
        </div>
        {termAId === termBId && termAId && (
          <p className="mt-2 text-xs text-amber-600">请选择不同的两个学期</p>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </section>

      {result && termA && termB && (
        <>
          {/* KPI summary */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: "选课人数 A", value: termA.totalEnrolled, cls: "text-indigo-600" },
              { label: "选课人数 B", value: termB.totalEnrolled, cls: "text-indigo-600" },
              { label: "平均绩点 A", value: termA.avgGpa != null ? termA.avgGpa.toFixed(2) : "—", cls: "text-emerald-600" },
              { label: "平均绩点 B", value: termB.avgGpa != null ? termB.avgGpa.toFixed(2) : "—", cls: "text-emerald-600" }
            ].map((k) => (
              <div key={k.label} className="campus-kpi">
                <p className="campus-kpi-label">{k.label}</p>
                <p className={`campus-kpi-value ${k.cls}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Main comparison table */}
          <section className="campus-card p-5">
            <h2 className="text-base font-semibold text-slate-800 mb-4">指标对比</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="pb-2 pr-4 text-xs font-semibold uppercase text-slate-500">指标</th>
                    <th className="pb-2 pr-4 text-xs font-semibold uppercase text-indigo-600">{termA.name}</th>
                    <th className="pb-2 pr-4 text-xs font-semibold uppercase text-indigo-600">{termB.name}</th>
                    <th className="pb-2 text-right text-xs font-semibold uppercase text-slate-500">变化</th>
                  </tr>
                </thead>
                <tbody>
                  <StatRow label="教学班数量" a={termA.sectionCount} b={termB.sectionCount} />
                  <StatRow label="已选课人数" a={termA.totalEnrolled} b={termB.totalEnrolled} />
                  <StatRow label="候补人数" a={termA.totalWaitlisted} b={termB.totalWaitlisted} invert />
                  <StatRow label="退课人数" a={termA.totalDropped} b={termB.totalDropped} invert />
                  <StatRow label="已完成人数" a={termA.totalCompleted} b={termB.totalCompleted} />
                  <StatRow label="平均绩点" a={termA.avgGpa} b={termB.avgGpa} fmt={(n) => n.toFixed(2)} />
                  <StatRow label="容量利用率" a={termA.utilizationPct} b={termB.utilizationPct} unit="%" />
                </tbody>
              </table>
            </div>
          </section>

          {/* Top departments comparison */}
          {(termA.topDepts.length > 0 || termB.topDepts.length > 0) && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[{ term: termA, label: "学期 A 热门院系" }, { term: termB, label: "学期 B 热门院系" }].map(({ term, label }) => {
                const max = Math.max(...term.topDepts.map((d) => d.count), 1);
                return (
                  <section key={term.id} className="campus-card p-5">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">{label}</h3>
                    <div className="space-y-2">
                      {term.topDepts.map((d) => (
                        <div key={d.dept}>
                          <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                            <span className="font-mono font-semibold">{d.dept}</span>
                            <span>{d.count} 人</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-indigo-500"
                              style={{ width: `${Math.round((d.count / max) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
