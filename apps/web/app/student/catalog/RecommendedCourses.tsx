"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type RecommendedSection = {
  id: string;
  credits: number;
  course: {
    code: string;
    title: string;
  };
};

export default function RecommendedCourses() {
  const [items, setItems] = useState<RecommendedSection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    void apiFetch<RecommendedSection[]>("/students/recommended")
      .then((data) => {
        if (alive) {
          setItems((data ?? []).slice(0, 6));
        }
      })
      .catch(() => {
        if (alive) setItems([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recommended for You</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="campus-card h-28 animate-pulse p-3" />
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recommended for You</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((section) => {
          const dept = section.course.code.slice(0, 2).toUpperCase();
          return (
            <div key={section.id} className="campus-card flex items-start gap-3 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 font-mono text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                {dept}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-400">{section.course.code}</p>
                  <span className="campus-chip border-slate-200 bg-slate-50 text-[10px] text-slate-600">{section.credits} cr</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm font-medium leading-tight text-slate-800 dark:text-slate-100">
                  {section.course.title}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="campus-chip border-blue-200 bg-blue-50 text-[10px] text-blue-700">{dept}</span>
                  <Link
                    href={`/student/catalog?dept=${encodeURIComponent(dept)}`}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Explore →
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
