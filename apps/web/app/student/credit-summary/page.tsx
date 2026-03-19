"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type TermGpa = {
  termId: string;
  termName: string;
  credits: number;
  gpa: number | null;
};

type StandingData = {
  standing: string;
  gpa: number;
  totalCredits: number;
  enrolledCredits: number;
  termHistory: TermGpa[];
  graduationTarget: number;
};

const GRADUATION_TARGET = 120;

export default function CreditSummaryPage() {
  const [data, setData] = useState<StandingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<StandingData>("/students/standing")
      .then((d) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const target = data?.graduationTarget ?? GRADUATION_TARGET;
  const done = data?.totalCredits ?? 0;
  const inProgress = data?.enrolledCredits ?? 0;
  const remaining = Math.max(0, target - done - inProgress);
  const progressPct = Math.min(100, Math.round((done / target) * 100));
  const projectedPct = Math.min(100, Math.round(((done + inProgress) / target) * 100));

  const gpaSparkline = useMemo(() => {
    if (!data?.termHistory?.length) return [];
    return data.termHistory.filter((t) => t.gpa != null);
  }, [data]);

  const maxGpa = 4.0;
  const sparkW = 300;
  const sparkH = 60;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业进度</p>
        <h1 className="campus-title">学分总览</h1>
        <p className="campus-subtitle">毕业学分进度、各学期学分分布与 GPA 趋势</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">已完成学分</p>
          <p className="campus-kpi-value text-emerald-600">{loading ? "—" : done}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">在读学分</p>
          <p className="campus-kpi-value text-[hsl(221_83%_43%)]">{loading ? "—" : inProgress}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">毕业尚差</p>
          <p className={`campus-kpi-value ${remaining === 0 ? "text-emerald-600" : "text-amber-600"}`}>
            {loading ? "—" : remaining === 0 ? "✓ 已满足" : remaining}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">累计 GPA</p>
          <p className={`campus-kpi-value ${(data?.gpa ?? 0) >= 3.5 ? "text-emerald-600" : (data?.gpa ?? 0) >= 2.0 ? "text-slate-800" : "text-red-600"}`}>
            {loading ? "—" : data?.gpa?.toFixed(3) ?? "—"}
          </p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : !data ? (
        <div className="campus-card p-10 text-center text-slate-400">暂无学分数据</div>
      ) : (
        <>
          {/* Graduation progress */}
          <section className="campus-card p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-slate-800">毕业进度</p>
              <span className="text-sm font-bold text-slate-700">{done} / {target} 学分</span>
            </div>
            <div className="relative h-4 rounded-full bg-slate-100 overflow-hidden">
              {/* projected (in progress) */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[hsl(221_65%_73%)]"
                style={{ width: `${projectedPct}%` }}
              />
              {/* done */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[hsl(221_83%_43%)]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-xs text-slate-400">
              <span>0</span>
              <span className="text-[hsl(221_65%_73%)] font-medium">+ {inProgress} 在读</span>
              <span>{target}</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              已完成 <strong className="text-[hsl(221_83%_43%)]">{progressPct}%</strong>
              {inProgress > 0 ? `，含在读课程后为 ${projectedPct}%` : ""}
            </p>
          </section>

          {/* Per-term bars */}
          {data.termHistory?.length > 0 ? (
            <section className="campus-card p-5">
              <p className="font-semibold text-slate-800 mb-4">各学期学分</p>
              <div className="space-y-2">
                {data.termHistory.map((t) => {
                  const maxCr = Math.max(1, ...data.termHistory.map((x) => x.credits));
                  return (
                    <div key={t.termId} className="flex items-center gap-3 text-sm">
                      <span className="w-36 shrink-0 text-slate-600 truncate text-xs">{t.termName}</span>
                      <div className="flex-1 h-3 rounded-full bg-slate-100">
                        <div
                          className="h-3 rounded-full bg-[hsl(221_83%_43%)]"
                          style={{ width: `${(t.credits / maxCr) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono font-bold text-slate-800 text-xs">{t.credits}</span>
                      {t.gpa != null ? (
                        <span className={`w-14 text-right text-xs font-mono ${t.gpa >= 3.5 ? "text-emerald-600" : t.gpa >= 2.0 ? "text-slate-600" : "text-red-600"}`}>
                          {t.gpa.toFixed(2)}
                        </span>
                      ) : <span className="w-14 text-right text-xs text-slate-300">—</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* GPA sparkline */}
          {gpaSparkline.length >= 2 ? (
            <section className="campus-card p-5">
              <p className="font-semibold text-slate-800 mb-4">GPA 趋势</p>
              <svg viewBox={`0 0 ${sparkW} ${sparkH + 20}`} className="w-full max-h-32">
                <polyline
                  points={gpaSparkline.map((t, i) => {
                    const x = (i / (gpaSparkline.length - 1)) * (sparkW - 20) + 10;
                    const y = sparkH - ((t.gpa! / maxGpa) * sparkH) + 5;
                    return `${x},${y}`;
                  }).join(" ")}
                  fill="none"
                  stroke="hsl(221 83% 43%)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                {gpaSparkline.map((t, i) => {
                  const x = (i / (gpaSparkline.length - 1)) * (sparkW - 20) + 10;
                  const y = sparkH - ((t.gpa! / maxGpa) * sparkH) + 5;
                  return (
                    <g key={t.termId}>
                      <circle cx={x} cy={y} r={3} fill="hsl(221 83% 43%)" />
                      <text x={x} y={sparkH + 16} textAnchor="middle" style={{ fontSize: 8, fill: "#94a3b8" }}>
                        {t.termName.slice(0, 6)}
                      </text>
                      <text x={x} y={y - 6} textAnchor="middle" style={{ fontSize: 8, fill: "hsl(221 83% 43%)", fontWeight: 600 }}>
                        {t.gpa!.toFixed(2)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
