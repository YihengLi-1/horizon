"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

type Dim = { label: string; key: "rating" | "difficulty" | "workload"; color: string };

const dims: Dim[] = [
  { label: "总体", key: "rating", color: "text-indigo-500" },
  { label: "难度", key: "difficulty", color: "text-rose-500" },
  { label: "工作量", key: "workload", color: "text-amber-500" }
];

function StarRow({
  label,
  color,
  value,
  onChange,
  disabled
}: {
  label: string;
  color: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500 w-20 shrink-0">{label}</span>
      <span className="inline-flex gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            disabled={disabled}
            onClick={() => onChange(s)}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(0)}
            className={`text-sm leading-none disabled:opacity-40 transition ${s <= (hover || value) ? color : "text-slate-200"}`}
            aria-label={`${label} ${s} star`}
          >
            ★
          </button>
        ))}
      </span>
      <span className="text-xs text-slate-400 w-6 text-right">{value || "—"}</span>
    </div>
  );
}

export default function MultiDimRating({
  sectionId,
  initial
}: {
  sectionId: string;
  initial?: { rating?: number; difficulty?: number; workload?: number; wouldRecommend?: boolean };
}) {
  const [values, setValues] = useState({
    rating: initial?.rating ?? 0,
    difficulty: initial?.difficulty ?? 0,
    workload: initial?.workload ?? 0,
    wouldRecommend: initial?.wouldRecommend ?? null as boolean | null
  });
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit() {
    if (!values.rating) return;
    setSaving(true);
    try {
      await apiFetch("/students/rate-section", {
        method: "POST",
        body: JSON.stringify({
          sectionId,
          rating: values.rating,
          difficulty: values.difficulty || undefined,
          workload: values.workload || undefined,
          wouldRecommend: values.wouldRecommend ?? undefined,
          comment: comment || undefined
        })
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="text-xs text-emerald-600 flex items-center gap-1">
        <span>✓</span> 评分已保存
      </div>
    );
  }

  return (
    <div className="space-y-2 border border-slate-100 rounded-lg p-3 bg-slate-50">
      <p className="text-xs font-semibold text-slate-600 mb-2">课程评分</p>
      {dims.map((d) => (
        <StarRow
          key={d.key}
          label={d.label}
          color={d.color}
          value={values[d.key]}
          onChange={(v) => setValues((prev) => ({ ...prev, [d.key]: v }))}
          disabled={saving}
        />
      ))}

      <div className="flex items-center gap-2 pt-1">
        <span className="text-xs text-slate-500 w-20 shrink-0">Recommend?</span>
        <div className="flex gap-2">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              disabled={saving}
              onClick={() => setValues((prev) => ({ ...prev, wouldRecommend: v }))}
              className={`text-xs px-2 py-0.5 rounded-full border transition ${
                values.wouldRecommend === v
                  ? v
                    ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                    : "bg-rose-100 border-rose-300 text-rose-700"
                  : "bg-white border-slate-200 text-slate-500"
              }`}
            >
              {v ? "是" : "否"}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="评论（选填，最多500字）"
        maxLength={500}
        rows={2}
        className="campus-input text-xs w-full mt-1 resize-none"
        disabled={saving}
      />

      <button
        onClick={() => void submit()}
        disabled={saving || !values.rating}
        className="campus-btn-primary text-xs px-3 py-1.5 disabled:opacity-40"
      >
        {saving ? "提交中…" : "提交评分"}
      </button>
    </div>
  );
}
