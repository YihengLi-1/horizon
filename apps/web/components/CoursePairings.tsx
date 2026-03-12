"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type PairingResult = {
  course: { id: string; code: string; title: string };
  coCount: number;
};

export default function CoursePairings({ courseId }: { courseId: string }) {
  const [pairs, setPairs] = useState<PairingResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId) return;
    apiFetch<PairingResult[]>(`/academics/courses/${courseId}/pairings`)
      .then((data) => setPairs(data ?? []))
      .catch(() => setPairs([]))
      .finally(() => setLoading(false));
  }, [courseId]);

  if (loading || pairs.length === 0) return null;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="text-xs font-semibold text-slate-500 mb-2">Students also take</p>
      <div className="flex flex-wrap gap-1.5">
        {pairs.map((p) => (
          <span
            key={p.course.id}
            title={`${p.course.title} (${p.coCount} students co-enrolled)`}
            className="campus-chip bg-indigo-50 text-indigo-700 border-indigo-200 text-xs"
          >
            {p.course.code}
          </span>
        ))}
      </div>
    </div>
  );
}
