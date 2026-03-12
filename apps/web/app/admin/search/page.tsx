"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type StudentResult = {
  id: string;
  email: string;
  studentProfile?: { legalName?: string; programMajor?: string } | null;
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
  capacity: number;
  course: { code: string; title: string };
  term: { name: string };
  _count: { enrollments: number };
};

type SearchResults = {
  students: StudentResult[];
  courses: CourseResult[];
  sections: SectionResult[];
};

type SearchType = "all" | "student" | "course" | "section";

const TYPE_OPTIONS: { value: SearchType; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "student", label: "学生" },
  { value: "course", label: "课程" },
  { value: "section", label: "教学班" }
];

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function AdminSearchPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState<SearchType>("all");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQ = useDebounce(q, 300);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!debouncedQ.trim()) {
      setResults(null);
      return;
    }
    let alive = true;
    setLoading(true);
    void apiFetch<SearchResults>(`/admin/search?q=${encodeURIComponent(debouncedQ)}&type=${type}`)
      .then((data) => { if (alive) setResults(data); })
      .catch(() => { if (alive) setResults({ students: [], courses: [], sections: [] }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [debouncedQ, type]);

  const totalResults = results ? results.students.length + results.courses.length + results.sections.length : 0;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Global Search</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">统一搜索</h1>
        <p className="mt-1 text-sm text-slate-500">跨学生、课程、教学班的全局搜索</p>
      </section>

      <div className="campus-card p-4 space-y-3">
        <div className="flex gap-3">
          <input
            ref={inputRef}
            className="campus-input flex-1 text-base"
            placeholder="搜索学生姓名/邮箱、课程代码/名称、教师名、教学班代码…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="campus-select"
            value={type}
            onChange={(e) => setType(e.target.value as SearchType)}
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        {loading && <p className="text-xs text-slate-400">搜索中…</p>}
        {!loading && q && results && (
          <p className="text-xs text-slate-500">找到 {totalResults} 条结果</p>
        )}
      </div>

      {results && !loading && (
        <div className="space-y-5">
          {/* Students */}
          {results.students.length > 0 && (
            <section className="campus-card p-4 space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-700">👤</span>
                学生 <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-500">{results.students.length}</span>
              </h2>
              <div className="divide-y divide-slate-100">
                {results.students.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{s.studentProfile?.legalName ?? s.email}</p>
                      <p className="text-xs text-slate-400">{s.email}</p>
                      {s.studentProfile?.programMajor && (
                        <p className="text-xs text-slate-400">{s.studentProfile.programMajor}</p>
                      )}
                    </div>
                    <Link
                      href={`/admin/students?highlight=${s.id}`}
                      className="shrink-0 rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      查看 →
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Courses */}
          {results.courses.length > 0 && (
            <section className="campus-card p-4 space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-700">📖</span>
                课程 <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-500">{results.courses.length}</span>
              </h2>
              <div className="divide-y divide-slate-100">
                {results.courses.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{c.code}</span>
                        <span className="text-sm font-semibold text-slate-800">{c.title}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{c.credits} 学分</p>
                    </div>
                    <Link
                      href="/admin/courses"
                      className="shrink-0 rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      课程管理 →
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Sections */}
          {results.sections.length > 0 && (
            <section className="campus-card p-4 space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-xs text-amber-700">🗓</span>
                教学班 <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-500">{results.sections.length}</span>
              </h2>
              <div className="divide-y divide-slate-100">
                {results.sections.map((sec) => (
                  <div key={sec.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">{sec.course.code}</span>
                        <span className="text-sm font-semibold text-slate-800">§{sec.sectionCode}</span>
                        <span className="campus-chip border-slate-200 bg-slate-50 text-slate-500 text-xs">{sec.term.name}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{sec.instructorName} · {sec._count.enrollments}/{sec.capacity} 已选</p>
                    </div>
                    <Link
                      href="/admin/sections"
                      className="shrink-0 rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      教学班管理 →
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {totalResults === 0 && (
            <div className="campus-card px-6 py-14 text-center">
              <p className="text-3xl">🔍</p>
              <p className="mt-2 text-sm font-medium text-slate-600">未找到匹配结果</p>
              <p className="mt-1 text-xs text-slate-400">请尝试不同的关键词或筛选类型</p>
            </div>
          )}
        </div>
      )}

      {!results && !loading && (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-3xl">🔍</p>
          <p className="mt-2 text-sm font-medium text-slate-600">输入关键词开始搜索</p>
          <p className="mt-1 text-xs text-slate-400">支持学生姓名、邮箱、课程代码、教师名称、教学班代码</p>
        </div>
      )}
    </div>
  );
}
