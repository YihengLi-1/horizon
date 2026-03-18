"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Review = {
  comment: string;
  rating: number;
  createdAt: string;
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-400 text-xs">
      {"★".repeat(Math.round(rating))}{"☆".repeat(5 - Math.round(rating))}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "今天";
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  if (days < 365) return `${Math.floor(days / 30)}个月前`;
  return `${Math.floor(days / 365)}年前`;
}

export default function SectionReviews({ sectionId }: { sectionId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!sectionId) return;
    apiFetch<Review[]>(`/academics/sections/${sectionId}/reviews`)
      .then((data) => setReviews(data ?? []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [sectionId]);

  if (loading || reviews.length === 0) return null;

  const visible = expanded ? reviews : reviews.slice(0, 2);

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">
          学生评价（{reviews.length}条）
        </p>
        {reviews.length > 2 ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800"
          >
            {expanded ? "收起" : `查看全部 ${reviews.length} 条`}
          </button>
        ) : null}
      </div>
      <div className="space-y-2">
        {visible.map((review, idx) => (
          <div key={idx} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <Stars rating={review.rating} />
              <span className="text-[10px] text-slate-400">{timeAgo(review.createdAt)}</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{review.comment}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
