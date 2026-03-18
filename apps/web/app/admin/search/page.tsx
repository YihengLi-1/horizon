"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type StudentResult = {
  id: string;
  email: string;
  studentProfile?: { legalName?: string; programMajor?: string | null } | null;
};

type CourseResult = {
  id: string;
  code: string;
  title: string;
  credits: number;
};

type SectionResult = {
  id: string;
  sectionCode: string;
  instructorName: string;
  course: { code: string; title: string };
  term: { name: string };
  _count: { enrollments: number };
};

type SearchResults = {
  students: StudentResult[];
  courses: CourseResult[];
  sections: SectionResult[];
};

type FilterType = "all" | "student" | "course" | "section";

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "student", label: "学生" },
  { value: "course", label: "课程" },
  { value: "section", label: "教学班" },
];

export default function AdminSearchPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string, type: FilterType) => {
    if (q.trim().length < 2) {
      setResults(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ q: q.trim(), type });
      const data = await apiFetch<SearchResults>(`/admin/search?${params}`);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索失败");
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void search(query, filter);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, filter, search]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const total = results
    ? results.students.length + results.courses.length + results.sections.length
    : 0;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">管理</p>
        <h1 className="campus-hero-title">全局搜索</h1>
        <p className="campus-hero-subtitle">跨学生、课程、教学班的统一搜索入口</p>
      </section>

      <section className="campus-card p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <input
              ref={inputRef}
              className="campus-input w-full pl-9"
              placeholder="输入姓名、邮箱、课程代码或教学班…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            {loading ? (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                <span className="inline-block size-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
              </span>
            ) : null}
          </div>
          <div className="flex gap-1">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={`inline-flex h-10 items-center rounded-lg border px-3 text-sm font-medium transition ${
                  filter === opt.value
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {query.length > 0 && query.length < 2 ? (
          <p className="text-xs text-slate-400">请输入至少 2 个字符以开始搜索</p>
        ) : null}
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {results && query.trim().length >= 2 ? (
        total === 0 ? (
          <section className="campus-card p-8 text-center text-sm text-slate-500">
            未找到匹配「{query}」的结果
          </section>
        ) : (
          <div className="space-y-4">
            {/* Students */}
            {results.students.length > 0 ? (
              <section className="campus-card overflow-hidden">
                <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">学生</p>
                  <span className="text-xs text-slate-400">{results.students.length} 条</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {results.students.map((s) => (
                    <Link
                      key={s.id}
                      href={`/admin/students/${s.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 no-underline"
                    >
                      <div className="size-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                        {(s.studentProfile?.legalName ?? s.email).slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {s.studentProfile?.legalName ?? s.email}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {s.email}{s.studentProfile?.programMajor ? ` · ${s.studentProfile.programMajor}` : ""}
                        </p>
                      </div>
                      <span className="ml-auto text-xs text-slate-400 shrink-0">→</span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Courses */}
            {results.courses.length > 0 ? (
              <section className="campus-card overflow-hidden">
                <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">课程</p>
                  <span className="text-xs text-slate-400">{results.courses.length} 条</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {results.courses.map((c) => (
                    <Link
                      key={c.id}
                      href={`/admin/courses`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 no-underline"
                    >
                      <div className="size-8 rounded-lg bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700 shrink-0">
                        {c.credits}cr
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          <span className="font-mono text-blue-700">{c.code}</span> {c.title}
                        </p>
                        <p className="text-xs text-slate-500">{c.credits} 学分</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Sections */}
            {results.sections.length > 0 ? (
              <section className="campus-card overflow-hidden">
                <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">教学班</p>
                  <span className="text-xs text-slate-400">{results.sections.length} 条</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {results.sections.map((sec) => (
                    <Link
                      key={sec.id}
                      href={`/admin/sections/${sec.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 no-underline"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          <span className="font-mono text-blue-700">{sec.course.code}</span>
                          <span className="text-slate-500"> §{sec.sectionCode}</span>
                        </p>
                        <p className="text-xs text-slate-600 truncate">{sec.course.title}</p>
                        <p className="text-xs text-slate-400">
                          {sec.term.name}
                          {sec.instructorName ? ` · ${sec.instructorName}` : ""}
                          {` · ${sec._count.enrollments} 人已注册`}
                        </p>
                      </div>
                      <span className="ml-auto text-xs text-slate-400 shrink-0">→</span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )
      ) : null}

      {!results && !loading && !error && query.trim().length >= 2 ? (
        <section className="campus-card p-8 text-center text-sm text-slate-500">
          正在搜索…
        </section>
      ) : null}

      {!query ? (
        <section className="campus-card p-8 text-center text-sm text-slate-400">
          <p className="text-2xl mb-2">🔍</p>
          <p>在上方输入关键词，可同时搜索学生、课程和教学班</p>
        </section>
      ) : null}
    </div>
  );
}
