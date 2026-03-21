"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type TermHistory = {
  termName: string;
  credits: number;
  courses: number;
  termGpa: number | null;
};

type Standing = {
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

const STANDING_META: Record<Standing["standing"], { label: string; color: string; desc: string }> = {
  DEAN_LIST: {
    label: "院长名单",
    color: "text-emerald-700",
    desc: "累积 GPA ≥ 3.5，成绩优异，保持学习状态。",
  },
  GOOD_STANDING: {
    label: "学业正常",
    color: "text-slate-700",
    desc: "累积 GPA ≥ 2.0，学业状态良好。",
  },
  ACADEMIC_PROBATION: {
    label: "学业警告",
    color: "text-amber-700",
    desc: "累积 GPA 在 1.5–2.0 之间，需提升学业表现。建议尽快联系学业顾问。",
  },
  ACADEMIC_SUSPENSION: {
    label: "学业暂停",
    color: "text-red-700",
    desc: "累积 GPA 低于 1.5，请立即联系学业顾问处理。",
  },
  UNKNOWN: {
    label: "未知",
    color: "text-slate-400",
    desc: "暂无足够成绩数据来评估学业状态。",
  },
};

function GpaBar({ gpa }: { gpa: number }) {
  const pct = Math.min(100, Math.round((gpa / 4.0) * 100));
  const color =
    gpa >= 3.5 ? "bg-emerald-500" : gpa >= 2.0 ? "bg-blue-500" : gpa >= 1.5 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function StudentStandingPage() {
  const [data, setData] = useState<Standing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<Standing>("/students/standing")
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const meta = data ? STANDING_META[data.standing] : null;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">学籍状态</p>
        <h1 className="campus-title">学业状态</h1>
        <p className="campus-subtitle">累积 GPA、已修学分及历学期成绩概览。</p>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">加载中…</div>
      ) : !data ? null : (
        <>
          {/* Standing banner */}
          {(data.standing === "ACADEMIC_PROBATION" || data.standing === "ACADEMIC_SUSPENSION") && (
            <div className={`rounded-xl border px-5 py-4 text-sm ${
              data.standing === "ACADEMIC_SUSPENSION"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}>
              <p className="font-semibold">{meta!.label}</p>
              <p className="mt-1 opacity-80">{meta!.desc}</p>
              <Link href="/student/advisor" className="mt-2 inline-block text-sm font-semibold underline">
                联系学业顾问 →
              </Link>
            </div>
          )}

          {/* KPI row */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">学业状态</p>
              <p className={`campus-kpi-value ${meta?.color ?? "text-slate-500"}`}>
                {meta?.label ?? "—"}
              </p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">累积 GPA</p>
              <p className="campus-kpi-value">
                {data.cumulativeGpa !== null ? data.cumulativeGpa.toFixed(2) : "—"}
              </p>
              {data.cumulativeGpa !== null && <GpaBar gpa={data.cumulativeGpa} />}
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">已修学分</p>
              <p className="campus-kpi-value">{data.totalCredits}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">专业</p>
              <p className="campus-kpi-value text-base">{data.major ?? "—"}</p>
            </div>
          </div>

          {/* Term history */}
          {data.termHistory.length > 0 ? (
            <section className="campus-card p-5 space-y-4">
              <h2 className="font-heading text-base font-semibold text-slate-900">历学期成绩</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                      <th className="pb-2 font-medium">学期</th>
                      <th className="pb-2 font-medium text-right">课程数</th>
                      <th className="pb-2 font-medium text-right">学分</th>
                      <th className="pb-2 font-medium text-right">学期 GPA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.termHistory.map((t) => (
                      <tr key={t.termName} className="text-slate-700">
                        <td className="py-2.5 font-medium">{t.termName}</td>
                        <td className="py-2.5 text-right">{t.courses}</td>
                        <td className="py-2.5 text-right">{t.credits}</td>
                        <td className="py-2.5 text-right">
                          {t.termGpa !== null ? (
                            <span
                              className={
                                t.termGpa >= 3.5
                                  ? "text-emerald-600 font-semibold"
                                  : t.termGpa >= 2.0
                                  ? "text-slate-700"
                                  : "text-red-600 font-semibold"
                              }
                            >
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
            </section>
          ) : (
            <div className="campus-card px-6 py-10 text-center text-sm text-slate-500">
              暂无历史学期成绩
            </div>
          )}

          {/* Quick links */}
          <div className="flex flex-wrap gap-3">
            <Link href="/student/transcript" className="campus-btn-ghost text-sm">
              查看成绩单 →
            </Link>
            <Link href="/student/degree-audit" className="campus-btn-ghost text-sm">
              查看毕业进度 →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
