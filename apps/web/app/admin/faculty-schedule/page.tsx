"use client";

/**
 * Admin Faculty Schedule Overview
 * Shows all sections grouped by instructor, with meeting times, enrollment,
 * and capacity. Useful for planning and workload balance reviews.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };

type InstructorSection = {
  sectionId: string; sectionCode: string; courseCode: string; courseTitle: string;
  capacity: number; enrolled: number; waitlisted: number;
  meetingTimes: { weekday: number; startMinutes: number; endMinutes: number }[];
};

type InstructorSchedule = {
  instructorId: string; instructorName: string; email: string;
  totalSections: number; totalCapacity: number; totalEnrolled: number;
  sections: InstructorSection[];
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function minutesToTime(min: number) {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function formatMeetingTimes(mts: InstructorSection["meetingTimes"]) {
  if (!mts || mts.length === 0) return "TBD";
  return mts.map((m) => `${DAYS[m.weekday]} ${minutesToTime(m.startMinutes)}–${minutesToTime(m.endMinutes)}`).join(", ");
}

export default function FacultySchedulePage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [data, setData] = useState<InstructorSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms")
      .then((d) => {
        const sorted = (d ?? []).sort((a, b) => b.name.localeCompare(a.name));
        setTerms(sorted);
        if (sorted[0]) setTermId(sorted[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "加载学期失败"));
  }, []);

  useEffect(() => {
    if (!termId && terms.length === 0) return;
    setLoading(true);
    setData([]);
    setError("");
    const suffix = termId ? `?termId=${termId}` : "";
    void apiFetch<InstructorSchedule[]>(`/admin/faculty-schedule${suffix}`)
      .then((d) => setData(d ?? []))
      .catch((err) => {
        setData([]);
        setError(err instanceof Error ? err.message : "加载教师课表失败");
      })
      .finally(() => setLoading(false));
  }, [termId, terms.length]);

  const filtered = data.filter((f) =>
    !search ||
    f.instructorName.toLowerCase().includes(search.toLowerCase()) ||
    f.email.toLowerCase().includes(search.toLowerCase())
  );

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function expandAll() { setExpanded(new Set(filtered.map((f) => f.instructorId))); }
  function collapseAll() { setExpanded(new Set()); }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Faculty Management</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">教师课表总览</h1>
        <p className="mt-1 text-sm text-slate-500">各教师当学期所有授课班级的时间表与容量概况</p>
      </section>

      {/* Controls */}
      <div className="campus-toolbar flex-wrap gap-2">
        <select className="campus-select" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">所有学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input className="campus-input flex-1 min-w-40" placeholder="搜索教师姓名或邮箱…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button type="button" onClick={expandAll} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          全部展开
        </button>
        <button type="button" onClick={collapseAll} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          全部收起
        </button>
      </div>

      {error ? (
        <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* KPI summary */}
      {!loading && data.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="campus-kpi">
            <p className="campus-kpi-label">授课教师</p>
            <p className="campus-kpi-value text-indigo-600">{data.length}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">教学班总数</p>
            <p className="campus-kpi-value">{data.reduce((s, f) => s + f.totalSections, 0)}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">总容量</p>
            <p className="campus-kpi-value">{data.reduce((s, f) => s + f.totalCapacity, 0)}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">总选课人数</p>
            <p className="campus-kpi-value text-emerald-600">{data.reduce((s, f) => s + f.totalEnrolled, 0)}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="campus-card px-6 py-12 text-center text-sm text-slate-500">⏳ 加载中…</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="campus-card px-6 py-12 text-center text-sm text-slate-400">暂无数据</div>
      )}

      {/* Instructor accordion */}
      <div className="space-y-3">
        {filtered.map((faculty) => {
          const isOpen = expanded.has(faculty.instructorId);
          const loadPct = faculty.totalCapacity > 0
            ? Math.round((faculty.totalEnrolled / faculty.totalCapacity) * 100) : 0;
          return (
            <div key={faculty.instructorId} className="campus-card overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpand(faculty.instructorId)}
                className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition text-left"
              >
                <div className="shrink-0 flex items-center justify-center size-10 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm">
                  {faculty.instructorName.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm truncate">{faculty.instructorName}</p>
                  <p className="text-xs text-slate-400 truncate">{faculty.email}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-center">
                    <p className="text-xs text-slate-400">班级</p>
                    <p className="font-bold text-slate-700 text-sm">{faculty.totalSections}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400">选课/容量</p>
                    <p className="font-bold text-sm">
                      <span className={loadPct >= 90 ? "text-red-600" : loadPct >= 70 ? "text-amber-600" : "text-emerald-600"}>
                        {faculty.totalEnrolled}
                      </span>
                      <span className="text-slate-400">/{faculty.totalCapacity}</span>
                    </p>
                  </div>
                  <span className="text-slate-400 text-sm">{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 px-4 pb-4">
                  <div className="overflow-x-auto mt-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="pb-2 text-left font-semibold">课程</th>
                          <th className="pb-2 text-left font-semibold">班级</th>
                          <th className="pb-2 text-left font-semibold">上课时间</th>
                          <th className="pb-2 text-right font-semibold">已选/容量</th>
                          <th className="pb-2 text-right font-semibold">候补</th>
                        </tr>
                      </thead>
                      <tbody>
                        {faculty.sections.map((sec) => {
                          const pct = sec.capacity > 0 ? Math.round((sec.enrolled / sec.capacity) * 100) : 0;
                          return (
                            <tr key={sec.sectionId} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="py-2 pr-3">
                                <span className="font-mono font-bold text-indigo-700">{sec.courseCode}</span>
                                <span className="text-slate-500 ml-1 hidden sm:inline">{sec.courseTitle.slice(0, 25)}{sec.courseTitle.length > 25 ? "…" : ""}</span>
                              </td>
                              <td className="py-2 pr-3 font-mono text-slate-600">{sec.sectionCode}</td>
                              <td className="py-2 pr-3 text-slate-500">{formatMeetingTimes(sec.meetingTimes)}</td>
                              <td className="py-2 pr-3 text-right">
                                <span className={pct >= 90 ? "text-red-600 font-bold" : pct >= 70 ? "text-amber-600" : "text-emerald-600"}>
                                  {sec.enrolled}
                                </span>
                                <span className="text-slate-400">/{sec.capacity}</span>
                              </td>
                              <td className="py-2 text-right text-slate-500">{sec.waitlisted}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
