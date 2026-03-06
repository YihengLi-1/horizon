"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type SearchResult = {
  type: string;
  label: string;
  href: string;
};

function normalizeItems<T>(value: T[] | { items?: T[] } | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.items)) return value.items;
  return [];
}

export default function QuickSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      const [students, courses] = await Promise.all([
        apiFetch<any[] | { items?: any[] }>(`/admin/students?search=${encodeURIComponent(query)}&pageSize=5`).catch(() => []),
        apiFetch<any[] | { items?: any[] }>(`/admin/courses?search=${encodeURIComponent(query)}&limit=5`).catch(() => [])
      ]);

      const merged: SearchResult[] = [
        ...normalizeItems(students).map((student) => ({
          type: "Student",
          label: `${student.name ?? student.email ?? "Student"}`,
          href: "/admin/students"
        })),
        ...normalizeItems(courses).map((course) => ({
          type: "Course",
          label: `${course.code ?? "—"} — ${course.title ?? "Untitled"}`,
          href: "/admin/courses"
        }))
      ];

      setResults(merged.slice(0, 8));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative w-full max-w-sm">
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 200)}
        placeholder="Quick search students, courses..."
        className="campus-input w-full pr-8 text-sm"
      />
      {open && results.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
          {results.map((result, index) => (
            <Link
              key={`${result.type}-${index}`}
              href={result.href}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <span
                className={`campus-chip text-xs ${
                  result.type === "Student"
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {result.type}
              </span>
              <span className="text-sm text-slate-700 dark:text-slate-200">{result.label}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
