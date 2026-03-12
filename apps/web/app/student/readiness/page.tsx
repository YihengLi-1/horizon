"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type CoursePrereq = { prerequisiteCourse: { id: string; code: string } };
type Course = {
  id: string;
  code: string;
  title: string;
  credits: number;
  description?: string | null;
  prerequisiteLinks: CoursePrereq[];
  weeklyHours?: number | null;
};

type Section = {
  id: string;
  sectionCode: string;
  instructorName: string;
  capacity: number;
  _count?: { enrollments?: number };
  course: { id: string };
  term: { name: string };
};

function PrereqDot({ satisfied }: { satisfied: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${satisfied ? "bg-emerald-500" : "bg-red-400"}`} />
  );
}

export default function ReadinessPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [completedCodes, setCompletedCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ready" | "almost" | "all">("ready");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      apiFetch<Course[]>("/academics/courses"),
      apiFetch<string[]>("/students/completed-courses"),
      apiFetch<Section[]>("/academics/sections")
    ]).then(([coursesData, codes, sectionsData]) => {
      setCourses(coursesData);
      setCompletedCodes(codes);
      setSections(sectionsData);
    }).catch(() => {}).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const completedSet = new Set(completedCodes);

  type CourseWithStatus = Course & {
    satisfied: number;
    total: number;
    isReady: boolean;
    isAlmost: boolean;
    isCompleted: boolean;
    hasSections: boolean;
  };

  const coursesWithStatus: CourseWithStatus[] = courses.map((c) => {
    const total = c.prerequisiteLinks.length;
    const satisfied = c.prerequisiteLinks.filter((p) => completedSet.has(p.prerequisiteCourse.code)).length;
    const isCompleted = completedSet.has(c.code);
    const isReady = !isCompleted && (total === 0 || satisfied === total);
    const isAlmost = !isCompleted && !isReady && satisfied > 0 && satisfied >= Math.ceil(total * 0.5);
    const hasSections = sections.some((s) => s.course.id === c.id);
    return { ...c, satisfied, total, isReady, isAlmost, isCompleted, hasSections };
  });

  const filtered = coursesWithStatus
    .filter((c) => !c.isCompleted) // exclude already done
    .filter((c) => {
      if (filter === "ready") return c.isReady;
      if (filter === "almost") return c.isAlmost;
      return true; // all
    })
    .filter((c) => {
      if (!search) return true;
      return c.code.toLowerCase().includes(search.toLowerCase()) ||
             c.title.toLowerCase().includes(search.toLowerCase());
    })
    .sort((a, b) => {
      // Ready first, then almost, then by code
      if (a.isReady !== b.isReady) return a.isReady ? -1 : 1;
      if (a.isAlmost !== b.isAlmost) return a.isAlmost ? -1 : 1;
      return a.code.localeCompare(b.code);
    });

  const readyCount = coursesWithStatus.filter((c) => !c.isCompleted && c.isReady).length;
  const almostCount = coursesWithStatus.filter((c) => !c.isCompleted && c.isAlmost).length;
  const completedCount = completedCodes.length;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Course Readiness</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">可选课程检测</h1>
        <p className="mt-1 text-sm text-slate-500">根据您已完成的课程，显示您现在可以选修的课程</p>
      </section>

      {!loading && (
        <div className="grid grid-cols-3 gap-4">
          <div className="campus-kpi">
            <p className="campus-kpi-label">已完成课程</p>
            <p className="campus-kpi-value text-emerald-600">{completedCount}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">可立即选修</p>
            <p className="campus-kpi-value text-indigo-600">{readyCount}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">差 1-2 门先修</p>
            <p className="campus-kpi-value text-amber-600">{almostCount}</p>
          </div>
        </div>
      )}

      <div className="campus-toolbar flex-wrap gap-3">
        <input
          className="campus-input flex-1"
          placeholder="搜索课程代码或名称…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {(["ready", "almost", "all"] as const).map((f) => {
            const labels = { ready: "✓ 可选", almost: "△ 接近", all: "全部" };
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === f
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {labels[f]}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-2xl">⏳</p>
          <p className="mt-2 text-sm text-slate-600">分析中…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-3xl">{filter === "ready" ? "🎉" : "🔍"}</p>
          <p className="mt-2 text-sm font-medium text-slate-600">
            {filter === "ready" ? "暂无可立即选修的课程（或已全部完成）" : "无匹配课程"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const sectionCount = sections.filter((s) => s.course.id === c.id).length;
            return (
              <article
                key={c.id}
                className={`campus-card p-4 space-y-2 ${c.isReady ? "border-l-4 border-l-emerald-400" : c.isAlmost ? "border-l-4 border-l-amber-400" : "border-l-4 border-l-slate-200"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                        {c.code}
                      </span>
                      <span className="text-xs text-slate-400">{c.credits}cr</span>
                      {c.weeklyHours && (
                        <span className="text-xs text-amber-600">⏱ {c.weeklyHours}h/wk</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-800 leading-tight">{c.title}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold ${c.isReady ? "border-emerald-300 bg-emerald-100 text-emerald-700" : "border-amber-300 bg-amber-100 text-amber-700"}`}>
                    {c.isReady ? "✓ 可选" : `${c.satisfied}/${c.total} 先修`}
                  </span>
                </div>

                {c.prerequisiteLinks.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {c.prerequisiteLinks.map((p) => (
                      <span
                        key={p.prerequisiteCourse.id}
                        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
                          completedSet.has(p.prerequisiteCourse.code)
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-red-200 bg-red-50 text-red-600"
                        }`}
                      >
                        <PrereqDot satisfied={completedSet.has(p.prerequisiteCourse.code)} />
                        {p.prerequisiteCourse.code}
                      </span>
                    ))}
                  </div>
                )}

                {c.isReady && sectionCount > 0 && (
                  <div className="pt-1">
                    <Link
                      href={`/student/catalog?search=${encodeURIComponent(c.code)}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      {sectionCount} 个教学班 →
                    </Link>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
