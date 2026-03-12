"use client";

/**
 * Student Peer Comparison Dashboard
 * Lets students see how their GPA, credit load, and completion rate
 * compare to anonymous cohort aggregates (same dept, same graduation year).
 * All data comes from the already-existing /students/gpa-stats endpoint
 * plus /students/me (own profile).
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type GpaStats = {
  myGpa: number | null;
  percentile: number | null;
  mean: number;
  median: number;
  distribution: { label: string; count: number }[];
};

type Me = {
  email: string;
  studentProfile?: { legalName?: string | null; department?: string | null; graduationYear?: number | null } | null;
  enrollments?: {
    status: string;
    finalGrade?: string | null;
    section: { course: { credits: number } };
  }[];
};

function Bar({ label, value, max, color = "bg-indigo-500" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-slate-600 truncate">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right tabular-nums text-slate-500">{value}</span>
    </div>
  );
}

function GaugePct({ percentile }: { percentile: number }) {
  const color = percentile >= 75 ? "text-emerald-600" : percentile >= 50 ? "text-indigo-600" : percentile >= 25 ? "text-amber-600" : "text-red-600";
  const bg = percentile >= 75 ? "bg-emerald-50 border-emerald-200" : percentile >= 50 ? "bg-indigo-50 border-indigo-200" : percentile >= 25 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
  return (
    <div className={`rounded-xl border p-4 text-center ${bg}`}>
      <p className="text-xs font-semibold text-slate-500 mb-1">GPA 百分位</p>
      <p className={`text-4xl font-black ${color}`}>{percentile}<span className="text-lg">th</span></p>
      <p className="text-xs text-slate-500 mt-1">超过了 {percentile}% 的同学</p>
    </div>
  );
}

export default function PeerComparePage() {
  const [stats, setStats] = useState<GpaStats | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch<GpaStats>("/students/gpa-stats").catch(() => null),
      apiFetch<Me>("/students/me").catch(() => null)
    ]).then(([s, m]) => {
      if (!alive) return;
      setStats(s);
      setMe(m);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const myGpa = stats?.myGpa ?? null;
  const completedCredits = (me?.enrollments ?? [])
    .filter((e) => e.status === "COMPLETED")
    .reduce((s, e) => s + (e.section.course.credits ?? 0), 0);
  const enrolledCount = (me?.enrollments ?? []).filter((e) => e.status === "ENROLLED").length;
  const completedCount = (me?.enrollments ?? []).filter((e) => e.status === "COMPLETED").length;
  const maxDistCount = Math.max(...(stats?.distribution.map((d) => d.count) ?? [1]), 1);

  if (loading) {
    return (
      <div className="campus-page">
        <div className="campus-card px-6 py-16 text-center text-sm text-slate-500">⏳ 加载中…</div>
      </div>
    );
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Analytics</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">同伴对比</h1>
        <p className="mt-1 text-sm text-slate-500">
          将你的学业表现与匿名全体学生数据进行横向比较
        </p>
      </section>

      {/* My quick stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">我的 GPA</p>
          <p className="campus-kpi-value text-indigo-600">{myGpa !== null ? myGpa.toFixed(2) : "N/A"}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">全体均值</p>
          <p className="campus-kpi-value">{stats ? stats.mean.toFixed(2) : "—"}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">全体中位数</p>
          <p className="campus-kpi-value">{stats ? stats.median.toFixed(2) : "—"}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已完成学分</p>
          <p className="campus-kpi-value text-emerald-600">{completedCredits}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Percentile gauge */}
        <div className="space-y-4">
          {stats && stats.percentile !== null ? (
            <GaugePct percentile={stats.percentile} />
          ) : (
            <div className="campus-card p-4 text-center text-sm text-slate-400">无 GPA 记录</div>
          )}

          {/* My vs cohort compare */}
          <div className="campus-card p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase text-slate-500">GPA 横向比较</h3>
            {[
              { label: "我的 GPA", value: myGpa ?? 0, color: "bg-indigo-500" },
              { label: "全体均值", value: stats?.mean ?? 0, color: "bg-slate-400" },
              { label: "全体中位", value: stats?.median ?? 0, color: "bg-emerald-400" }
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-slate-600">{label}</span>
                  <span className="font-bold text-slate-800">{value.toFixed(2)}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color} transition-all`}
                    style={{ width: `${Math.min(100, (value / 4) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* GPA Distribution */}
        <div className="campus-card p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase text-slate-500">GPA 全体分布</h3>
          {stats?.distribution.length ? (
            <div className="space-y-2">
              {stats.distribution.map((d) => {
                const isMyBin = myGpa !== null &&
                  d.label.includes("–") &&
                  (() => {
                    const [lo, hi] = d.label.split("–").map(Number);
                    return myGpa >= lo && myGpa <= hi;
                  })();
                return (
                  <Bar
                    key={d.label}
                    label={d.label}
                    value={d.count}
                    max={maxDistCount}
                    color={isMyBin ? "bg-indigo-500" : "bg-slate-300"}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">暂无分布数据</p>
          )}
          {myGpa !== null && (
            <p className="text-[10px] text-indigo-600 font-semibold">▍深色柱为你所在区间</p>
          )}
        </div>

        {/* My academic snapshot */}
        <div className="campus-card p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase text-slate-500">我的学业快照</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">姓名</span>
              <span className="font-semibold text-slate-900 text-right max-w-[150px] truncate">
                {me?.studentProfile?.legalName ?? me?.email ?? "—"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">院系</span>
              <span className="font-semibold text-slate-900">{me?.studentProfile?.department ?? "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">预计毕业年</span>
              <span className="font-semibold text-slate-900">{me?.studentProfile?.graduationYear ?? "—"}</span>
            </div>
            <hr className="border-slate-200" />
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">已完成课程</span>
              <span className="font-semibold text-emerald-700">{completedCount} 门</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">当前选课</span>
              <span className="font-semibold text-indigo-700">{enrolledCount} 门</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">已完成学分</span>
              <span className="font-bold text-slate-900">{completedCredits} 学分</span>
            </div>
          </div>

          {/* GPA label */}
          {myGpa !== null && (
            <div className={`mt-3 rounded-lg p-3 text-center ${
              myGpa >= 3.5 ? "bg-emerald-50 text-emerald-800" :
              myGpa >= 3.0 ? "bg-indigo-50 text-indigo-800" :
              myGpa >= 2.0 ? "bg-amber-50 text-amber-800" :
              "bg-red-50 text-red-800"
            }`}>
              <p className="text-xs font-semibold">
                {myGpa >= 3.5 ? "🏆 Dean's List 资格" :
                 myGpa >= 3.0 ? "✅ 良好学业状态" :
                 myGpa >= 2.0 ? "⚠️ 基本良好" :
                 "🚨 学业预警"}
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center">
        * 所有对比数据均经过匿名聚合处理，不涉及其他学生个人信息
      </p>
    </div>
  );
}
