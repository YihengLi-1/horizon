"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type CoursePrereq = {
  prerequisiteCourse: { id: string; code: string; title: string };
};

type PrereqCheckerProps = {
  prereqs: CoursePrereq[];
};

let cachedCodes: string[] | null = null;
let cachePromise: Promise<string[]> | null = null;

/** Loads completed course codes once and caches globally within the page. */
async function fetchCompletedCodes(): Promise<string[]> {
  if (cachedCodes) return cachedCodes;
  if (cachePromise) return cachePromise;
  cachePromise = apiFetch<string[]>("/students/completed-courses").then((codes) => {
    cachedCodes = codes;
    return codes;
  });
  return cachePromise;
}

export default function PrereqChecker({ prereqs }: PrereqCheckerProps) {
  const [completedCodes, setCompletedCodes] = useState<string[] | null>(null);

  useEffect(() => {
    if (prereqs.length === 0) return;
    void fetchCompletedCodes().then(setCompletedCodes).catch(() => setCompletedCodes([]));
  }, [prereqs.length]);

  if (prereqs.length === 0) return null;

  const allSatisfied = completedCodes !== null && prereqs.every((p) => completedCodes.includes(p.prerequisiteCourse.code));

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold uppercase text-slate-500">先修要求</span>
        {completedCodes !== null && (
          <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-xs font-bold ${allSatisfied ? "border-emerald-300 bg-emerald-100 text-emerald-700" : "border-amber-300 bg-amber-100 text-amber-700"}`}>
            {allSatisfied ? "✓ 已满足" : "⚠ 未满足"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {prereqs.map((p) => {
          const done = completedCodes?.includes(p.prerequisiteCourse.code);
          return (
            <span
              key={p.prerequisiteCourse.id}
              title={p.prerequisiteCourse.title}
              className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                completedCodes === null
                  ? "border-slate-200 bg-slate-50 text-slate-500"
                  : done
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {completedCodes !== null && (done ? "✓" : "✗")} {p.prerequisiteCourse.code}
            </span>
          );
        })}
      </div>
    </div>
  );
}
