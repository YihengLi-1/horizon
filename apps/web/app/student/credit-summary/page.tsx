"use client";

/**
 * Student Credit Summary
 * Visual breakdown of credits earned per term, GPA trend, and graduation progress.
 * Fully client-side — reuses /students/standing data.
 */

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type TermHistory = { termName: string; credits: number; courses: number; termGpa: number | null };
type StandingData = {
  cumulativeGpa: number | null;
  totalCredits: number;
  standing: string;
  termHistory: TermHistory[];
};

const GRADUATION_CREDITS = 120;

export default function CreditSummaryPage() {
  const [standing, setStanding] = useState<StandingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<StandingData>("/students/standing")
      .then((d) => setStanding(d))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const progressPct = useMemo(() => {
    if (!standing) return 0;
    return Math.min(100, Math.round((standing.totalCredits / GRADUATION_CREDITS) * 100));
  }, [standing]);

  const maxCredits = useMemo(() => {
    if (!standing || standing.termHistory.length === 0) return 1;
    return Math.max(1, ...standing.termHistory.map((t) => t.credits));
  }, [standing]);

  // GPA sparkline points
  const gpaPoints = useMemo(() => {
    if (!standing) return "";
    const terms = standing.termHistory.filter((t) => t.termGpa !== null);
    if (terms.length < 2) return "";
    const w = 600, h = 120, pad = 20;
    const xs = terms.map((_, i) => pad + (i / (terms.length - 1)) * (w - pad * 2));
    const ys = terms.map((t) => h - pad - ((t.termGpa! / 4) * (h - pad * 2)));
    return xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  }, [standing]);

  const gpaTerms = standing?.termHistory.filter((t) => t.termGpa !== null) ?? [];

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Progress</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">学分汇总</h1>
        <p className="mt-1 text-sm text-slate-500">按学期查看已修学分与 GPA 趋势</p>
      </section>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : standing ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">已修学分</p>
              <p className="campus-kpi-value text-indigo-600">{standing.totalCredits}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">毕业所需</p>
              <p className="campus-kpi-value text-slate-600">{GRADUATION_CREDITS}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">累计 GPA</p>
              <p className={`campus-kpi-value ${standing.cumulativeGpa && standing.cumulativeGpa >= 3.5 ? "text-emerald-600" : standing.cumulativeGpa && standing.cumulativeGpa >= 2.0 ? "text-indigo-600" : "text-red-600"}`}>
                {standing.cumulativeGpa?.toFixed(2) ?? "—"}
              </p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">学籍状态</p>
              <p className="campus-kpi-value text-sm text-indigo-600">{standing.standing}</p>
            </div>
          </div>

          {/* Graduation progress bar */}
          <div className="campus-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">毕业进度</h2>
              <span className="text-xs font-semibold text-indigo-600">{standing.totalCredits} / {GRADUATION_CREDITS} 学分 ({progressPct}%)</span>
            </div>
            <div className="h-4 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">
              {progressPct >= 100
                ? "学分要求已达到"
                : `还需修读 ${GRADUATION_CREDITS - standing.totalCredits} 学分`}
            </p>
          </div>

          {/* Per-term credit bars */}
          {standing.termHistory.length > 0 && (
            <div className="campus-card p-4 space-y-3">
              <h2 className="text-sm font-bold text-slate-900">各学期学分</h2>
              <div className="space-y-2">
                {standing.termHistory.map((t) => (
                  <div key={t.termName} className="flex items-center gap-3">
                    <span className="text-xs text-slate-600 w-36 shrink-0 font-medium">{t.termName}</span>
                    <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded bg-indigo-400"
                        style={{ width: `${(t.credits / maxCredits) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-700 w-10 text-right font-semibold">{t.credits} cr</span>
                    <span className="text-xs text-slate-400 w-10 text-right">{t.courses} 门</span>
                    {t.termGpa !== null && (
                      <span className={`text-xs w-16 text-right font-mono ${t.termGpa >= 3.5 ? "text-emerald-600" : t.termGpa >= 2.0 ? "text-slate-600" : "text-red-500"}`}>
                        GPA {t.termGpa.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GPA trend sparkline */}
          {gpaTerms.length >= 2 && (
            <div className="campus-card p-4 space-y-2">
              <h2 className="text-sm font-bold text-slate-900">GPA 趋势</h2>
              <svg viewBox="0 0 600 120" className="w-full">
                {/* grid lines */}
                {[0, 1, 2, 3, 4].map((v) => {
                  const y = 120 - 20 - (v / 4) * 80;
                  return (
                    <g key={v}>
                      <line x1="20" y1={y} x2="580" y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 2" />
                      <text x="14" y={y + 3} textAnchor="end" fontSize="8" fill="#94a3b8">{v}</text>
                    </g>
                  );
                })}
                {/* sparkline */}
                {gpaPoints && (
                  <polyline points={gpaPoints} fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinejoin="round" />
                )}
                {/* dots */}
                {gpaTerms.map((t, i) => {
                  const x = 20 + (i / (gpaTerms.length - 1)) * 560;
                  const y = 100 - ((t.termGpa! / 4) * 80);
                  return (
                    <g key={t.termName}>
                      <circle cx={x} cy={y} r="3.5" fill="#4f46e5" />
                      <text x={x} y="118" textAnchor="middle" fontSize="7" fill="#94a3b8">
                        {t.termName.slice(-6)}
                      </text>
                      <text x={x} y={y - 6} textAnchor="middle" fontSize="7.5" fill="#475569" fontWeight="bold">
                        {t.termGpa!.toFixed(2)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}

          {/* Summary table */}
          {standing.termHistory.length > 0 && (
            <div className="campus-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="pb-2 pl-4 text-left font-semibold">学期</th>
                      <th className="pb-2 pr-3 text-right font-semibold">课程数</th>
                      <th className="pb-2 pr-3 text-right font-semibold">学分</th>
                      <th className="pb-2 pr-4 text-right font-semibold">学期 GPA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standing.termHistory.map((t) => (
                      <tr key={t.termName} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2.5 pl-4 pr-3 font-medium text-slate-800">{t.termName}</td>
                        <td className="py-2.5 pr-3 text-right text-slate-600">{t.courses}</td>
                        <td className="py-2.5 pr-3 text-right font-bold text-indigo-600">{t.credits}</td>
                        <td className="py-2.5 pr-4 text-right">
                          {t.termGpa !== null ? (
                            <span className={t.termGpa >= 3.5 ? "text-emerald-600 font-bold" : t.termGpa >= 2.0 ? "text-slate-700" : "text-red-600 font-bold"}>
                              {t.termGpa.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold text-slate-800">
                      <td className="py-2.5 pl-4 pr-3">合计</td>
                      <td className="py-2.5 pr-3 text-right">
                        {standing.termHistory.reduce((s, t) => s + t.courses, 0)}
                      </td>
                      <td className="py-2.5 pr-3 text-right text-indigo-700">{standing.totalCredits}</td>
                      <td className="py-2.5 pr-4 text-right text-indigo-700">
                        {standing.cumulativeGpa?.toFixed(2) ?? "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
