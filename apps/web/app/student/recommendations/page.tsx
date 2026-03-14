"use client";

/**
 * Student Course Recommendations
 * Shows courses popular among peers in the same major that the student hasn't taken.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

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
  const [data, setData] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<Recommendation[]>("/students/recommendations")
      .then((d) => setData(d ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const maxScore = Math.max(1, ...data.map((r) => r.popularityScore));

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Personalized</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">课程推荐</h1>
        <p className="mt-1 text-sm text-slate-500">基于同专业学生选课数据，为您推荐尚未选修的热门课程</p>
      </section>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : data.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">
          <p className="text-lg mb-2">暂无推荐</p>
          <p className="text-xs text-slate-300">您已选修了同专业学生的所有热门课程，或系统数据不足</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((rec, i) => (
            <div key={rec.courseId} className="campus-card p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
              {/* Rank badge */}
              <div className="shrink-0 size-10 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-indigo-700 text-sm">
                #{i + 1}
              </div>

              {/* Course info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-indigo-700 text-sm">{rec.courseCode}</span>
                  <span className="text-slate-800 font-medium text-sm truncate">{rec.courseTitle}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-xs text-slate-500">{rec.credits} 学分</span>
                  <span className="text-xs text-slate-400">{rec.termName}</span>
                  <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{rec.reason}</span>
                </div>

                {/* Popularity bar */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 rounded-full"
                      style={{ width: `${(rec.popularityScore / maxScore) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">{rec.popularityScore} 人选修</span>
                </div>
              </div>

              {/* Add to cart link */}
              <Link
                href="/student/catalog"
                className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
              >
                去选课 →
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="campus-card p-4 text-xs text-slate-500 space-y-1">
        <p className="font-semibold text-slate-700">推荐说明</p>
        <p>• 推荐基于与您同专业的学生历史选课数据</p>
        <p>• 已排除您已选修或已完成的课程</p>
        <p>• 数据随学期更新，建议结合课程目录和顾问建议做决定</p>
      </div>
    </div>
  );
}
