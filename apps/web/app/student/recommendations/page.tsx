"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";

type Recommendation = {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  credits: number;
  termName: string;
  reason: string;
  popularityScore: number;
};

export default function RecommendationsPage() {
  const [items, setItems] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<Recommendation[]>("/students/recommendations")
      .then((d) => setItems(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const maxScore = items.length ? Math.max(...items.map((i) => i.popularityScore)) : 1;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">智能推荐</p>
        <h1 className="campus-title">课程推荐</h1>
        <p className="campus-subtitle">基于同专业同学的选课数据，为你推荐可能感兴趣的课程</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">推荐课程数</p>
          <p className="campus-kpi-value">{loading ? "—" : items.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">最高热度</p>
          <p className="campus-kpi-value text-indigo-600">{loading ? "—" : maxScore}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">推荐来源</p>
          <p className="campus-kpi-value text-sm">同专业同学</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : items.length === 0 ? (
        <div className="campus-card p-10 text-center">
          <p className="text-3xl mb-3">🔍</p>
          <p className="text-sm font-semibold text-slate-600">暂无推荐课程</p>
          <p className="mt-1 text-xs text-slate-400">完成更多课程学习后，推荐系统将逐步完善。</p>
        </div>
      ) : (
        <section className="space-y-3">
          {items.map((item, i) => {
            const barPct = Math.round((item.popularityScore / maxScore) * 100);
            return (
              <div key={item.courseId + i} className="campus-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        {item.courseCode}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">{item.courseTitle}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.reason}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1 w-24 rounded-full bg-slate-100">
                        <div className="h-1 rounded-full bg-indigo-400" style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-500">热度 {item.popularityScore}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-slate-400">{item.termName}</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-700">{item.credits} 学分</p>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <div className="flex justify-center">
        <Link
          href="/student/catalog"
          className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
        >
          前往课程目录选课 →
        </Link>
      </div>
    </div>
  );
}
