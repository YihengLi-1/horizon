"use client";

import { useState } from "react";

export default function StarRating({
  sectionId,
  initial = 0,
  apiBase
}: {
  sectionId: string;
  initial?: number;
  apiBase: string;
}) {
  const [value, setValue] = useState(initial);
  const [hover, setHover] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(initial > 0);

  async function submit(rating: number) {
    setSaving(true);
    try {
      await fetch(`${apiBase}/students/rate-section`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, rating })
      });
      setValue(rating);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          disabled={saving}
          onClick={() => void submit(rating)}
          onMouseEnter={() => setHover(rating)}
          onMouseLeave={() => setHover(0)}
          className="text-base leading-none disabled:opacity-40"
          aria-label={`${rating} 星`}
        >
          {rating <= (hover || value) ? "⭐" : "☆"}
        </button>
      ))}
      {saved ? <span className="ml-1 text-xs text-emerald-500">✓</span> : null}
    </span>
  );
}
