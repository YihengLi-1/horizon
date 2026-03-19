"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type TermHistory = {
  termName: string;
  credits: number;
  courses: number;
  termGpa: number | null;
};

type StandingData = {
  userId: string;
  email: string;
  major: string | null;
  enrollmentStatus: string | null;
  cumulativeGpa: number | null;
  totalCredits: number;
  standing: "DEAN_LIST" | "GOOD_STANDING" | "ACADEMIC_PROBATION" | "ACADEMIC_SUSPENSION" | "UNKNOWN";
  termHistory: TermHistory[];
};

const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "在读",
  INACTIVE: "非在读",
  SUSPENDED: "停学",
};

const STANDING_CONFIG = {
  DEAN_LIST: {
    label: "院长名单",
    emoji: "🏆",
    color: "text-amber-700",
    border: "border-amber-300",
    bg: "bg-amber-50",
    desc: "累计 GPA ≥ 3.5，表现卓越",
  },
  GOOD_STANDING: {
    label: "学业正常",
    emoji: "✅",
    color: "text-emerald-700",
    border: "border-emerald-300",
    bg: "bg-emerald-50",
    desc: "累计 GPA ≥ 2.0，学业良好",
  },
  ACADEMIC_PROBATION: {
    label: "学业察看",
    emoji: "⚠️",
    color: "text-amber-700",
    border: "border-amber-300",
    bg: "bg-amber-50",
    desc: "累计 GPA 在 1.5–2.0 之间，需改善",
  },
  ACADEMIC_SUSPENSION: {
    label: "学业暂停",
    emoji: "🚫",
    color: "text-red-700",
    border: "border-red-300",
    bg: "bg-red-50",
    desc: "累计 GPA < 1.5，请联系学籍办",
  },
  UNKNOWN: {
    label: "暂无数据",
    emoji: "📚",
    color: "text-slate-600",
    border: "border-slate-200",
    bg: "bg-slate-50",
    desc: "尚无已评分课程记录",
  },
};

function gpaBarWidth(gpa: number | null): number {
  if (gpa === null) return 0;
  return Math.min(100, Math.round((gpa / 4.0) * 100));
}

function gpaBarColor(gpa: number | null): string {
  if (gpa === null) return "bg-slate-200";
  if (gpa >= 3.5) return "bg-amber-400";
  if (gpa >= 3.0) return "bg-emerald-500";
  if (gpa >= 2.0) return "bg-blue-500";
  if (gpa >= 1.5) return "bg-amber-500";
  return "bg-red-500";
}

export default function StandingPage() {
  const [data, setData] = useState<StandingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<StandingData>("/students/standing")
      .then((d) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const cfg = STANDING_CONFIG[data?.standing ?? "UNKNOWN"];
  const maxTermGpa = data?.termHistory.length
    ? Math.max(...data.termHistory.map((t) => t.termGpa ?? 0))
    : 0;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学籍状态</p>
        <h1 className="campus-title">学业状态</h1>
        <p className="campus-subtitle">
          {loading ? "加载中…" : data?.major ? `${data.major} · ${data.enrollmentStatus ? (ENROLLMENT_STATUS_LABEL[data.enrollmentStatus] ?? data.enrollmentStatus) : ""}` : "当前学业状况概览"}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">累计 GPA</p>
          <p className={`campus-kpi-value ${data?.cumulativeGpa !== undefined ? gpaBarColor(data.cumulativeGpa ?? null).replace("bg-", "text-") : ""}`}>
            {loading ? "—" : data?.cumulativeGpa !== null ? data?.cumulativeGpa?.toFixed(2) : "—"}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已修学分</p>
          <p className="campus-kpi-value">{loading ? "—" : data?.totalCredits ?? 0}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">修读学期</p>
          <p className="campus-kpi-value">{loading ? "—" : data?.termHistory.length ?? 0}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : data ? (
        <>
          {/* Standing badge */}
          <div className={`campus-card flex items-center gap-5 border p-5 ${cfg.border} ${cfg.bg}`}>
            <span className="text-4xl shrink-0">{cfg.emoji}</span>
            <div>
              <p className={`text-lg font-bold ${cfg.color}`}>{cfg.label}</p>
              <p className="mt-0.5 text-sm text-slate-600">{cfg.desc}</p>
            </div>
            {data.cumulativeGpa !== null ? (
              <div className="ml-auto shrink-0">
                <p className="text-xs text-slate-500 text-right">累计 GPA</p>
                <p className={`text-3xl font-bold ${gpaBarColor(data.cumulativeGpa).replace("bg-", "text-")}`}>
                  {data.cumulativeGpa.toFixed(2)}
                </p>
                <div className="mt-1 h-1.5 w-20 rounded-full bg-white/70">
                  <div
                    className={`h-1.5 rounded-full ${gpaBarColor(data.cumulativeGpa)}`}
                    style={{ width: `${gpaBarWidth(data.cumulativeGpa)}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Term history */}
          {data.termHistory.length > 0 ? (
            <section className="campus-card overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-3">
                <h2 className="text-sm font-semibold text-slate-800">各学期成绩记录</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold text-slate-500 border-b border-slate-200">
                      <th className="px-4 py-3 text-left">学期</th>
                      <th className="px-4 py-3 text-right">课程数</th>
                      <th className="px-4 py-3 text-right">学分</th>
                      <th className="px-4 py-3 text-right">本学期 GPA</th>
                      <th className="px-4 py-3">GPA 图</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.termHistory.map((term, i) => (
                      <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">{term.termName}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">{term.courses}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-700">{term.credits}</td>
                        <td className={`px-4 py-3 text-right font-bold ${gpaBarColor(term.termGpa).replace("bg-", "text-")}`}>
                          {term.termGpa !== null ? term.termGpa.toFixed(2) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 rounded-full bg-slate-100">
                              <div
                                className={`h-1.5 rounded-full ${gpaBarColor(term.termGpa)}`}
                                style={{ width: `${term.termGpa !== null ? Math.round((term.termGpa / Math.max(maxTermGpa, 1)) * 100) : 0}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <div className="campus-card p-10 text-center text-slate-400">
              尚无已完成学期的成绩记录。
            </div>
          )}

          {/* Standing guide */}
          <section className="campus-card p-4 text-xs text-slate-500 space-y-1">
            <p className="font-semibold text-slate-700 text-sm">学业状态标准</p>
            <p>🏆 院长名单：累计 GPA ≥ 3.5</p>
            <p>✅ 学业正常：累计 GPA ≥ 2.0</p>
            <p>⚠️ 学业察看：累计 GPA 在 1.5–2.0 之间</p>
            <p>🚫 学业暂停：累计 GPA &lt; 1.5，请联系注册处</p>
          </section>
        </>
      ) : null}
    </div>
  );
}
