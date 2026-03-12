"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type MyRating = {
  id: string;
  rating: number;
  difficulty: number | null;
  workload: number | null;
  wouldRecommend: boolean | null;
  comment: string | null;
  updatedAt: string;
  section: {
    sectionCode: string;
    instructorName: string;
    term: { name: string };
    course: { code: string; title: string };
  };
};

function Stars({ n, max = 5, color = "text-amber-400" }: { n: number; max?: number; color?: string }) {
  return (
    <span className={color}>
      {"★".repeat(Math.round(n))}{"☆".repeat(max - Math.round(n))}
    </span>
  );
}

function dim(label: string, value: number | null, max = 5, color = "text-amber-400") {
  if (value == null) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-slate-600">
      <span className="font-medium">{label}:</span>
      <Stars n={value} max={max} color={color} />
      <span className="text-slate-500">{value.toFixed(1)}</span>
    </span>
  );
}

function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function MyReviewsPage() {
  const [ratings, setRatings] = useState<MyRating[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<MyRating[]>("/students/ratings")
      .then((data) => setRatings(data ?? []))
      .catch(() => setRatings([]))
      .finally(() => setLoading(false));
  }, []);

  const avgRating =
    ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
      : null;

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <p className="campus-eyebrow">My Academic Feedback</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900">My Course Reviews</h1>
        <p className="mt-1 text-sm text-slate-600">
          All ratings and reviews you've submitted for completed courses.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reviews Written</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{ratings.length}</p>
        </div>
        <div className="campus-kpi border-amber-200 bg-amber-50/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Avg Rating Given</p>
          <p className="mt-1 text-2xl font-bold text-amber-900">
            {avgRating != null ? avgRating.toFixed(2) : "—"}
          </p>
        </div>
        <div className="campus-kpi border-emerald-200 bg-emerald-50/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Would Recommend</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">
            {ratings.length > 0
              ? `${Math.round((ratings.filter((r) => r.wouldRecommend).length / ratings.length) * 100)}%`
              : "—"}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-slate-400">Loading reviews…</div>
      ) : ratings.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-3xl">✍️</p>
          <p className="mt-3 text-sm font-semibold text-slate-700">No reviews yet</p>
          <p className="mt-1 text-xs text-slate-400">
            Rate a completed course in the Catalog to share your experience.
          </p>
          <a href="/student/catalog" className="mt-4 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Go to Catalog
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {ratings.map((r) => (
            <div key={r.id} className="campus-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {r.section.course.code} — {r.section.course.title}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {r.section.sectionCode} · {r.section.instructorName} · {r.section.term.name}
                  </p>
                </div>
                <span className="text-[10px] text-slate-400">{timeAgo(r.updatedAt)}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <span className="flex items-center gap-1 text-sm">
                  <span className="font-semibold text-slate-700">Overall:</span>
                  <Stars n={r.rating} />
                  <span className="ml-1 text-xs font-semibold text-slate-700">{r.rating}/5</span>
                </span>
                {dim("Difficulty", r.difficulty, 5, "text-rose-400")}
                {dim("Workload", r.workload, 5, "text-amber-500")}
                {r.wouldRecommend != null ? (
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${r.wouldRecommend ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                    {r.wouldRecommend ? "✓ Would Recommend" : "✗ Would Not Recommend"}
                  </span>
                ) : null}
              </div>

              {r.comment ? (
                <blockquote className="mt-3 rounded-lg border-l-4 border-indigo-200 bg-indigo-50/40 px-4 py-2 text-sm text-slate-700 italic">
                  "{r.comment}"
                </blockquote>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
