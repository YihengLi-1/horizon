"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Course = {
  id: string;
  code: string;
  title: string;
  credits: number;
  weeklyHours?: number | null;
};

const YEARS = [1, 2, 3, 4];
const SEASONS = ["Fall", "Spring", "Summer"] as const;
type Season = typeof SEASONS[number];

type SlotKey = `${number}-${Season}`;
type Plan = Record<SlotKey, Course[]>;

const STORAGE_KEY = "sis:4year-plan";

function loadPlan(): Plan {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Plan) : {} as Plan;
  } catch {
    return {} as Plan;
  }
}

function savePlan(plan: Plan) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
}

function slotKey(year: number, season: Season): SlotKey {
  return `${year}-${season}`;
}

function totalCredits(plan: Plan): number {
  return Object.values(plan).flatMap((c) => c).reduce((sum, c) => sum + (c.credits ?? 0), 0);
}

export default function FourYearPlannerPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [plan, setPlan] = useState<Plan>({} as Plan);
  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState<Course | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<SlotKey | null>(null);

  useEffect(() => {
    setPlan(loadPlan());
    apiFetch<Course[]>("/admin/courses")
      .then((data) => setCourses(data ?? []))
      .catch(() => setCourses([]));
  }, []);

  function addCourse(year: number, season: Season, course: Course) {
    setPlan((prev) => {
      const key = slotKey(year, season);
      const existing = prev[key] ?? [];
      if (existing.some((c) => c.id === course.id)) return prev;
      const next = { ...prev, [key]: [...existing, course] };
      savePlan(next);
      return next;
    });
  }

  function removeCourse(year: number, season: Season, courseId: string) {
    setPlan((prev) => {
      const key = slotKey(year, season);
      const next = { ...prev, [key]: (prev[key] ?? []).filter((c) => c.id !== courseId) };
      savePlan(next);
      return next;
    });
  }

  function clearAll() {
    const empty = {} as Plan;
    setPlan(empty);
    savePlan(empty);
  }

  const filtered = search
    ? courses.filter(
        (c) =>
          c.code.toLowerCase().includes(search.toLowerCase()) ||
          c.title.toLowerCase().includes(search.toLowerCase())
      )
    : courses;

  const planned = new Set(Object.values(plan).flatMap((c) => c.map((x) => x.id)));
  const credits = totalCredits(plan);

  return (
    <div className="campus-page">
      <div className="campus-hero mb-0">
        <div>
          <p className="campus-eyebrow">Student · Planner</p>
          <h1 className="campus-hero-title">4-Year Course Plan</h1>
          <p className="campus-hero-sub">
            Drag courses into semesters to map out your degree path. Saved locally in your browser.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="campus-kpi-value text-2xl">{credits}</span>
          <span className="text-sm text-slate-500">credits planned</span>
          <button
            onClick={clearAll}
            className="campus-chip border-red-200 bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer ml-2"
          >
            Clear all
          </button>
        </div>
      </div>

      <div className="flex gap-4 mt-4">
        {/* Course palette */}
        <aside className="w-56 shrink-0">
          <div className="campus-card p-3 sticky top-4">
            <p className="text-xs font-semibold uppercase text-slate-400 mb-2">Courses</p>
            <input
              className="campus-input text-sm mb-2"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-[70vh] overflow-y-auto space-y-1 pr-1">
              {filtered.slice(0, 80).map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => setDragging(c)}
                  onDragEnd={() => setDragging(null)}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs cursor-grab active:cursor-grabbing transition ${
                    planned.has(c.id)
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <p className="font-mono font-bold">{c.code}</p>
                  <p className="text-slate-500 truncate">{c.title}</p>
                  <p className="text-slate-400 mt-0.5">
                    {c.credits} cr{c.weeklyHours ? ` · ${c.weeklyHours}h/wk` : ""}
                  </p>
                </div>
              ))}
              {filtered.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No courses match</p>
              ) : null}
            </div>
          </div>
        </aside>

        {/* Grid */}
        <div className="flex-1 overflow-x-auto">
          <div className="grid grid-cols-3 gap-3 min-w-[600px]">
            {/* Header row */}
            {SEASONS.map((season) => (
              <div key={season} className="text-center text-xs font-semibold uppercase text-slate-400 pb-1">
                {season}
              </div>
            ))}

            {YEARS.map((year) =>
              SEASONS.map((season) => {
                const key = slotKey(year, season);
                const slotCourses = plan[key] ?? [];
                const slotCredits = slotCourses.reduce((s, c) => s + (c.credits ?? 0), 0);
                const isHovered = hoveredSlot === key;
                return (
                  <div
                    key={key}
                    className={`rounded-xl border-2 transition-colors p-2 min-h-[120px] ${
                      isHovered
                        ? "border-indigo-400 bg-indigo-50/60"
                        : "border-dashed border-slate-200 bg-white"
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setHoveredSlot(key);
                    }}
                    onDragLeave={() => setHoveredSlot(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setHoveredSlot(null);
                      if (dragging) addCourse(year, season, dragging);
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold uppercase text-slate-400">
                        Y{year}
                      </span>
                      {slotCredits > 0 ? (
                        <span className={`text-[10px] font-bold rounded-full px-1.5 ${slotCredits > 18 ? "bg-red-100 text-red-600" : slotCredits > 15 ? "bg-amber-100 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
                          {slotCredits} cr
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      {slotCourses.map((c) => (
                        <div
                          key={c.id}
                          className="group flex items-center justify-between rounded-md bg-indigo-50 border border-indigo-100 px-2 py-1"
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-[11px] font-bold text-indigo-700 truncate">{c.code}</p>
                            <p className="text-[10px] text-indigo-500 truncate">{c.credits} cr</p>
                          </div>
                          <button
                            onClick={() => removeCourse(year, season, c.id)}
                            className="ml-1 shrink-0 text-indigo-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition text-xs"
                            aria-label={`Remove ${c.code}`}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {slotCourses.length === 0 ? (
                        <p className="text-[10px] text-slate-300 text-center py-2">Drop here</p>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Year labels on left - overlay using absolute doesn't work cleanly in grid, so add year summary row */}
          <div className="mt-4 flex flex-wrap gap-2">
            {YEARS.map((year) => {
              const yearCredits = SEASONS.reduce((sum, season) => {
                const key = slotKey(year, season);
                return sum + (plan[key] ?? []).reduce((s, c) => s + (c.credits ?? 0), 0);
              }, 0);
              return (
                <span key={year} className="campus-chip border-slate-200 bg-white text-slate-600 text-xs">
                  Year {year}: <strong>{yearCredits}</strong> cr
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
