"use client";

/**
 * Student Academic Standing
 * Shows cumulative GPA, standing classification, and term-by-term history.
 * Student sees their own record; admin URL uses /admin/students/:id/standing.
 */

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type TermHistory = {
  termName: string;
  credits: number;
  courses: number;
  termGpa: number | null;
};

type StandingData = {
  userId: string;
  name: string;
  email: string;
  major: string | null;
  enrollmentStatus: string | null;
  cumulativeGpa: number | null;
  totalCredits: number;
  standing: "DEAN_LIST" | "GOOD_STANDING" | "ACADEMIC_PROBATION" | "ACADEMIC_SUSPENSION" | "UNKNOWN";
  termHistory: TermHistory[];
};

const STANDING_META: Record<string, { label: string; color: string; bg: string; border: string; desc: string }> = {
  DEAN_LIST: { label: "院长荣誉榜", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", desc: "累计 GPA ≥ 3.5，表现优异" },
  GOOD_STANDING: { label: "正常学籍", color: "text-indigo-700", bg: "bg-indigo-50", border: "border-indigo-200", desc: "累计 GPA ≥ 2.0，学业正常" },
  ACADEMIC_PROBATION: { label: "学业警告", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", desc: "累计 GPA 1.5–2.0，需提高成绩" },
  ACADEMIC_SUSPENSION: { label: "学业暂停", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", desc: "累计 GPA < 1.5，需联系顾问" },
  UNKNOWN: { label: "待定", color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200", desc: "暂无完整成绩记录" },
};

export default function StudentStandingPage() {
  const [data, setData] = useState<StandingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Students see their own via /students/standing (added to student service)
    // Falls back to /admin/students/me/standing if needed
    void apiFetch<StandingData>("/students/standing")
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const meta = data ? STANDING_META[data.standing] ?? STANDING_META.UNKNOWN : null;

  const chartMeta = useMemo(() => {
    if (!data?.termHistory.length) return null;
    const maxGpa = 4.0;
    return { points: data.termHistory, maxGpa };
  }, [data]);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Standing</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">学业状态</h1>
        <p className="mt-1 text-sm text-slate-500">累计 GPA、学籍状态及各学期成绩历史</p>
      </section>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : !data ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">暂无数据</div>
      ) : (
        <>
          {/* Standing banner */}
          {meta && (
            <div className={`campus-card border ${meta.border} ${meta.bg} px-6 py-5 flex items-center gap-4`}>
              <div className="shrink-0 size-12 rounded-full bg-white flex items-center justify-center text-2xl shadow-sm">
                {data.standing === "DEAN_LIST" ? "🏆" : data.standing === "GOOD_STANDING" ? "✅" : data.standing === "ACADEMIC_PROBATION" ? "⚠️" : data.standing === "ACADEMIC_SUSPENSION" ? "🚨" : "❓"}
              </div>
              <div>
                <p className={`font-bold text-lg ${meta.color}`}>{meta.label}</p>
                <p className={`text-sm ${meta.color} opacity-80`}>{meta.desc}</p>
              </div>
            </div>
          )}

          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "累计 GPA", value: data.cumulativeGpa?.toFixed(2) ?? "N/A", color: data.cumulativeGpa && data.cumulativeGpa >= 3.5 ? "text-emerald-600" : data.cumulativeGpa && data.cumulativeGpa >= 2.0 ? "text-indigo-600" : "text-red-600" },
              { label: "已完成学分", value: data.totalCredits, color: "text-indigo-600" },
              { label: "学习学期数", value: data.termHistory.length },
              { label: "专业", value: data.major ?? "未分配", color: "text-slate-700" },
            ].map(({ label, value, color }) => (
              <div key={label} className="campus-kpi">
                <p className="campus-kpi-label">{label}</p>
                <p className={`campus-kpi-value text-lg ${color ?? ""}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* GPA trend chart */}
          {chartMeta && chartMeta.points.length > 1 && (
            <div className="campus-card p-4">
              <h2 className="text-sm font-bold text-slate-900 mb-4">逐学期 GPA 趋势</h2>
              <svg viewBox="0 0 640 200" className="w-full">
                {/* Reference lines */}
                {[2.0, 3.0, 3.5, 4.0].map((gpa) => {
                  const y = 180 - (gpa / 4.0) * 155;
                  return (
                    <g key={gpa}>
                      <line x1="40" y1={y} x2="620" y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray={gpa === 2.0 ? "4,3" : "0"} />
                      <text x="35" y={y + 3} textAnchor="end" fontSize="8" fill="#94a3b8">{gpa.toFixed(1)}</text>
                    </g>
                  );
                })}
                <line x1="40" y1="180" x2="620" y2="180" stroke="#e2e8f0" strokeWidth="1.5" />
                <line x1="40" y1="25" x2="40" y2="180" stroke="#e2e8f0" strokeWidth="1.5" />

                {/* GPA line */}
                <polyline
                  fill="none" stroke="#4f46e5" strokeWidth="2.5"
                  points={chartMeta.points
                    .filter((p) => p.termGpa !== null)
                    .map((p, i, arr) => {
                      const x = 40 + (i / Math.max(arr.length - 1, 1)) * 580;
                      const y = 180 - ((p.termGpa ?? 0) / 4.0) * 155;
                      return `${x},${y}`;
                    })
                    .join(" ")}
                />

                {/* Points */}
                {chartMeta.points.map((p, i) => {
                  const x = 40 + (i / Math.max(chartMeta.points.length - 1, 1)) * 580;
                  const y = p.termGpa !== null ? 180 - (p.termGpa / 4.0) * 155 : null;
                  if (y === null) return null;
                  const color = p.termGpa! >= 3.5 ? "#10b981" : p.termGpa! >= 2.0 ? "#4f46e5" : "#ef4444";
                  return (
                    <g key={p.termName}>
                      <circle cx={x} cy={y} r="4" fill={color} />
                      <text x={x} y="196" textAnchor="middle" fontSize="8" fill="#94a3b8">
                        {p.termName.length > 8 ? p.termName.slice(-6) : p.termName}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}

          {/* Term history table */}
          {data.termHistory.length > 0 && (
            <div className="campus-card overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <h2 className="text-sm font-bold text-slate-900">各学期成绩明细</h2>
              </div>
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
                    {data.termHistory.map((t) => (
                      <tr key={t.termName} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2.5 pl-4 pr-3 font-medium text-slate-800">{t.termName}</td>
                        <td className="py-2.5 pr-3 text-right text-slate-500">{t.courses}</td>
                        <td className="py-2.5 pr-3 text-right text-indigo-600">{t.credits}</td>
                        <td className="py-2.5 pr-4 text-right">
                          {t.termGpa !== null ? (
                            <span className={t.termGpa >= 3.5 ? "text-emerald-600 font-bold" : t.termGpa >= 2.0 ? "text-indigo-600" : "text-red-600 font-bold"}>
                              {t.termGpa.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
