"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type CourseRating = {
  id: string;
  rating: number;
  comment: string | null;
  difficulty: number | null;
  workload: number | null;
  wouldRecommend: boolean | null;
  updatedAt: string;
  section: {
    sectionCode: string;
    instructorName: string | null;
    term: { name: string };
    course: { code: string; title: string };
  };
};

function Stars({ n, max = 5 }: { n: number; max?: number }) {
  return (
    <span className="text-amber-400">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className={i < Math.round(n) ? "text-amber-400" : "text-slate-200"}>★</span>
      ))}
    </span>
  );
}

function ScoreDot({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  const color = value >= 4 ? "bg-emerald-400" : value >= 3 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-600">
      <span className={`size-2 rounded-full ${color}`} />
      {label}: {value}/5
    </div>
  );
}

export default function MyRatingsPage() {
  const [ratings, setRatings] = useState<CourseRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "SELECT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    void apiFetch<CourseRating[]>("/students/ratings")
      .then((d) => setRatings(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return ratings.filter(
      (r) => !q || r.section.course.code.toLowerCase().includes(q) || r.section.course.title.toLowerCase().includes(q)
    );
  }, [ratings, search]);

  const avgRating = ratings.length
    ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1)
    : null;
  const recommended = ratings.filter((r) => r.wouldRecommend === true).length;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">我的评价</p>
        <h1 className="campus-title">课程评价记录</h1>
        <p className="campus-subtitle">查看您提交过的所有课程与教师评分</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">已评价课程</p>
          <p className="campus-kpi-value">{loading ? "—" : ratings.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">平均评分</p>
          <p className="campus-kpi-value text-amber-500">{loading ? "—" : avgRating ? `★ ${avgRating}` : "—"}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">推荐课程数</p>
          <p className="campus-kpi-value text-emerald-600">{loading ? "—" : recommended}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="campus-toolbar">
        <input
          ref={searchRef}
          className="campus-input max-w-xs"
          placeholder="搜索课程代码或名称… (/)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="campus-card p-10 text-center text-slate-400">
          {ratings.length === 0 ? "您尚未提交任何课程评价" : "无匹配结果"}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="campus-card px-5 py-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-[hsl(221_83%_43%)]">{r.section.course.code}</p>
                    <p className="text-slate-700 text-sm">{r.section.course.title}</p>
                    <span className="text-xs text-slate-400">{r.section.term.name}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {r.section.instructorName ?? "教师未知"} · 班级 {r.section.sectionCode}
                  </p>
                  {r.comment ? (
                    <p className="mt-2 text-sm text-slate-700 italic">"{r.comment}"</p>
                  ) : null}
                  <div className="flex flex-wrap gap-3 mt-2">
                    <ScoreDot label="难度" value={r.difficulty} />
                    <ScoreDot label="工作量" value={r.workload} />
                    {r.wouldRecommend != null ? (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className={r.wouldRecommend ? "text-emerald-600" : "text-slate-400"}>
                          {r.wouldRecommend ? "✓ 推荐" : "✗ 不推荐"}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <Stars n={r.rating} />
                  <p className="text-xs text-slate-400 mt-1">{r.updatedAt?.slice(0, 10)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
