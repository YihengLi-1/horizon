"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type GradeRow = { grade: string; count: number };
type TimelinePoint = { day: number; date: string; enrolled: number; waitlisted: number };

type SectionAnalytics = {
  sectionId: string; sectionCode: string; courseCode: string; courseTitle: string;
  termName: string; capacity: number; enrolled: number; waitlisted: number;
  dropCount: number; avgGpa: number;
  gradeBreakdown: GradeRow[];
  enrollmentTimeline: TimelinePoint[];
};

type RatingSummary = {
  count: number;
  avgRating: number | null;
  avgDifficulty: number | null;
  avgWorkload: number | null;
  recommendPct: number | null;
} | null;

type Review = { comment: string; rating: number; createdAt: string };

function StarBar({ value, max = 5 }: { value: number | null; max?: number }) {
  if (value === null) return <span className="text-xs text-slate-400">—</span>;
  const pct = (value / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-24 rounded-full bg-slate-100 overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-700">{value.toFixed(1)}</span>
    </div>
  );
}

export default function SectionAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const sectionId = typeof params?.id === "string" ? params.id : "";
  const [data, setData] = useState<SectionAnalytics | null>(null);
  const [ratings, setRatings] = useState<RatingSummary>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sectionId) return;
    setLoading(true);
    setError("");
    void Promise.all([
      apiFetch<SectionAnalytics>(`/admin/sections/${sectionId}/analytics`),
      apiFetch<RatingSummary>(`/sections/${sectionId}/rating-summary`).catch(() => null),
      apiFetch<Review[]>(`/sections/${sectionId}/reviews`).catch(() => []),
    ]).then(([analytics, ratingSummary, reviewList]) => {
      setData(analytics);
      setRatings(ratingSummary ?? null);
      setReviews(reviewList ?? []);
    }).catch((err) => {
      setData(null);
      setError(err instanceof Error ? err.message : "加载教学班分析失败");
    }).finally(() => setLoading(false));
  }, [sectionId]);

  const timelineMeta = useMemo(() => {
    const points = data?.enrollmentTimeline ?? [];
    const max = Math.max(1, ...points.map((p) => Math.max(p.enrolled, p.waitlisted)));
    return { points, max };
  }, [data]);

  const gradeMeta = useMemo(() => {
    const rows = data?.gradeBreakdown ?? [];
    const max = Math.max(1, ...rows.map((r) => r.count));
    return { rows, max };
  }, [data]);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">班级分析</p>
        <h1 className="campus-title">
          {data ? `${data.courseCode} · §${data.sectionCode}` : "教学班分析"}
        </h1>
        <p className="campus-subtitle">
          {data ? `${data.courseTitle} · ${data.termName}` : "查看单个教学班的选课与成绩分析"}
        </p>
      </section>

      <div className="campus-toolbar">
        <Link href="/admin/sections" className="campus-chip border-slate-200 bg-slate-50 text-slate-700">
          ← 返回教学班列表
        </Link>
      </div>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : !data ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">暂无教学班分析数据</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "容量", value: data.capacity },
              { label: "已选", value: data.enrolled, color: "text-emerald-600" },
              { label: "候补", value: data.waitlisted, color: "text-amber-600" },
              { label: "平均 GPA", value: data.avgGpa.toFixed(2), color: "text-indigo-600" },
            ].map(({ label, value, color }) => (
              <div key={label} className="campus-kpi">
                <p className="campus-kpi-label">{label}</p>
                <p className={`campus-kpi-value ${color ?? ""}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* Enrollment timeline */}
            <div className="campus-card p-4 lg:col-span-3">
              <h2 className="mb-3 text-sm font-bold text-slate-900">报名时间线（实际 ENROLLED 人数）</h2>
              {timelineMeta.points.length === 0 ? (
                <p className="text-sm text-slate-400">暂无时间线数据</p>
              ) : (
                <svg viewBox="0 0 640 240" className="w-full">
                  <line x1="40" y1="200" x2="620" y2="200" stroke="#e2e8f0" strokeWidth="1.5" />
                  <line x1="40" y1="20" x2="40" y2="200" stroke="#e2e8f0" strokeWidth="1.5" />
                  <polyline
                    fill="none" stroke="#4f46e5" strokeWidth="2.5"
                    points={timelineMeta.points.map((p, i) => {
                      const x = 40 + (i / Math.max(1, timelineMeta.points.length - 1)) * 580;
                      const y = 200 - (p.enrolled / timelineMeta.max) * 165;
                      return `${x},${y}`;
                    }).join(" ")}
                  />
                  {timelineMeta.points
                    .filter((_, i) => i % Math.ceil(timelineMeta.points.length / 8) === 0)
                    .map((p) => {
                      const origIdx = timelineMeta.points.indexOf(p);
                      const x = 40 + (origIdx / Math.max(1, timelineMeta.points.length - 1)) * 580;
                      const y = 200 - (p.enrolled / timelineMeta.max) * 165;
                      return (
                        <g key={p.date}>
                          <circle cx={x} cy={y} r="3.5" fill="#4f46e5" />
                          <text x={x} y="220" textAnchor="middle" fontSize="9" fill="#94a3b8">{p.date.slice(5)}</text>
                        </g>
                      );
                    })}
                  <text x="20" y="20" fontSize="9" fill="#94a3b8">{timelineMeta.max}</text>
                  <text x="20" y="200" fontSize="9" fill="#94a3b8">0</text>
                </svg>
              )}
            </div>

            {/* Grade breakdown */}
            <div className="campus-card p-4 lg:col-span-2">
              <h2 className="mb-3 text-sm font-bold text-slate-900">成绩分布 · 退课/W {data.dropCount} 人</h2>
              {gradeMeta.rows.length === 0 ? (
                <p className="text-sm text-slate-400">暂无成绩记录</p>
              ) : (
                <div className="space-y-2">
                  {gradeMeta.rows.map((r) => (
                    <div key={r.grade}>
                      <div className="mb-0.5 flex justify-between text-xs">
                        <span className="font-mono font-bold text-slate-700">{r.grade}</span>
                        <span className="text-slate-500">{r.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${(r.count / gradeMeta.max) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-4 text-xs text-slate-500">均值 GPA：<strong>{data.avgGpa.toFixed(2)}</strong></p>
            </div>
          </div>

          {/* Ratings & Reviews */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="campus-card p-4">
              <h2 className="mb-4 text-sm font-bold text-slate-900">学生评分摘要</h2>
              {ratings === null ? (
                <p className="text-sm text-slate-400">暂无评分数据</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-end gap-3">
                    <span className="text-4xl font-bold text-slate-900">
                      {ratings.avgRating !== null ? ratings.avgRating.toFixed(1) : "—"}
                    </span>
                    <div className="pb-1">
                      <p className="text-xs text-slate-500">{ratings.count} 份评分</p>
                      {ratings.recommendPct !== null && (
                        <p className="text-xs font-semibold text-emerald-600">{ratings.recommendPct}% 愿意推荐</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1 text-xs text-slate-500">综合评分</p>
                      <StarBar value={ratings.avgRating} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-slate-500">难度系数</p>
                      <StarBar value={ratings.avgDifficulty} />
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-slate-500">课业负担</p>
                      <StarBar value={ratings.avgWorkload} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="campus-card p-4 lg:col-span-2">
              <h2 className="mb-3 text-sm font-bold text-slate-900">
                学生评论{reviews.length > 0 ? `（${reviews.length}条）` : ""}
              </h2>
              {reviews.length === 0 ? (
                <p className="text-sm text-slate-400">暂无文字评论</p>
              ) : (
                <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                  {reviews.map((rv, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <span key={s} className={s <= rv.rating ? "text-amber-400" : "text-slate-200"}>★</span>
                          ))}
                        </div>
                        <span className="text-xs text-slate-400">
                          {new Date(rv.createdAt).toLocaleDateString("zh-CN")}
                        </span>
                      </div>
                      <p className="text-sm leading-snug text-slate-700">{rv.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
