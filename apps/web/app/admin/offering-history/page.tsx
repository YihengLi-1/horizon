"use client";

/**
 * Admin Course Offering History
 * Shows each course's term-by-term offering history with enrollment utilization.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type TermOffering = {
  termId: string;
  termName: string;
  termEndDate: string;
  sectionId: string;
  sectionCode: string;
  instructorName: string;
  capacity: number;
  enrolled: number;
  utilizationPct: number;
  avgRating: number | null;
};

type CourseHistory = {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  credits: number;
  termCount: number;
  avgUtilization: number;
  offerings: TermOffering[];
};

function UtilBar({ pct }: { pct: number }) {
  const color =
    pct >= 90 ? "bg-red-500" :
    pct >= 70 ? "bg-amber-400" :
    "bg-emerald-500";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-600 shrink-0 w-8 text-right">{pct}%</span>
    </div>
  );
}

function StarRating({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-slate-300">—</span>;
  return (
    <span className="text-xs font-semibold text-amber-500">★ {value.toFixed(1)}</span>
  );
}

export default function CourseOfferingHistoryPage() {
  const [courses, setCourses]   = useState<CourseHistory[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy]     = useState<"code" | "terms" | "util">("code");

  useEffect(() => {
    void apiFetch<CourseHistory[]>("/admin/course-offering-history")
      .then((data) => setCourses(data ?? []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = courses.filter((c) => {
    const q = search.toLowerCase();
    return c.courseCode.toLowerCase().includes(q) || c.courseTitle.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "terms") return b.termCount - a.termCount;
    if (sortBy === "util") return b.avgUtilization - a.avgUtilization;
    return a.courseCode.localeCompare(b.courseCode);
  });

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(sorted.map((c) => c.courseId)));
  }
  function collapseAll() {
    setExpanded(new Set());
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Analytics</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">
          课程开设历史
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          查看每门课程历年开设情况、师资安排和选课利用率
        </p>
      </section>

      {/* KPIs */}
      {!loading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="campus-kpi">
            <p className="campus-kpi-label">课程总数</p>
            <p className="campus-kpi-value">{courses.length}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">教学班总数</p>
            <p className="campus-kpi-value text-indigo-600">
              {courses.reduce((a, c) => a + c.offerings.length, 0)}
            </p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">平均利用率</p>
            <p className="campus-kpi-value text-emerald-600">
              {courses.length > 0
                ? Math.round(courses.reduce((a, c) => a + c.avgUtilization, 0) / courses.length)
                : 0}%
            </p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">高需求课程 (≥90%)</p>
            <p className="campus-kpi-value text-red-600">
              {courses.filter((c) => c.avgUtilization >= 90).length}
            </p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="campus-toolbar flex-wrap gap-2">
        <input
          className="campus-input flex-1 min-w-48"
          placeholder="搜索课程代码或名称…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="campus-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "code" | "terms" | "util")}
        >
          <option value="code">按代码排序</option>
          <option value="terms">按开设学期数</option>
          <option value="util">按平均利用率</option>
        </select>
        <button
          type="button"
          onClick={expandAll}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          全部展开
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          全部收起
        </button>
        <span className="text-xs text-slate-400 self-center">{sorted.length} 门课程</span>
      </div>

      {loading ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-2xl">⏳</p>
          <p className="mt-2 text-sm text-slate-600">加载中…</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="campus-card px-6 py-10 text-center">
          <p className="text-sm text-slate-500">无符合条件的课程</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((course) => {
            const isOpen = expanded.has(course.courseId);
            return (
              <div key={course.courseId} className="campus-card overflow-hidden">
                {/* Header row */}
                <button
                  type="button"
                  onClick={() => toggleExpand(course.courseId)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left"
                >
                  <span className="font-mono text-sm font-bold text-indigo-700 shrink-0">
                    {course.courseCode}
                  </span>
                  <span className="text-sm text-slate-700 truncate flex-1">{course.courseTitle}</span>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="text-xs text-slate-400">{course.credits}cr</span>
                    <span className="text-xs text-slate-500">{course.termCount} 学期</span>
                    <span className="text-xs text-slate-500">{course.offerings.length} 教学班</span>
                    <UtilBar pct={course.avgUtilization} />
                  </div>
                  <span className="text-slate-400 text-sm">{isOpen ? "▲" : "▼"}</span>
                </button>

                {/* Expanded offerings */}
                {isOpen && (
                  <div className="border-t border-slate-100 divide-y divide-slate-50">
                    <div className="grid grid-cols-6 px-4 py-1 bg-slate-50 text-xs font-semibold text-slate-400 uppercase">
                      <span>学期</span>
                      <span>§代码</span>
                      <span>教师</span>
                      <span className="text-right">容量</span>
                      <span className="text-right">已选</span>
                      <span>利用率</span>
                    </div>
                    {course.offerings.map((o) => (
                      <div key={o.sectionId} className="grid grid-cols-6 items-center gap-2 px-4 py-2 text-sm">
                        <span className="text-slate-700 font-medium">{o.termName}</span>
                        <span className="font-mono text-xs text-indigo-600">{o.sectionCode}</span>
                        <span className="text-slate-600 truncate text-xs">{o.instructorName}</span>
                        <span className="text-right font-mono text-xs text-slate-500">{o.capacity}</span>
                        <span className="text-right font-mono text-xs text-slate-700">{o.enrolled}</span>
                        <div className="flex items-center gap-2">
                          <UtilBar pct={o.utilizationPct} />
                          <StarRating value={o.avgRating} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
