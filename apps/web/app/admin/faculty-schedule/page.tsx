"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type MeetingTime = { weekday: number; startMinutes: number; endMinutes: number };
type SectionEntry = {
  sectionId: string;
  sectionCode: string;
  courseCode: string;
  courseTitle: string;
  capacity: number;
  enrolled: number;
  waitlisted: number;
  meetingTimes: MeetingTime[];
};

type InstructorRow = {
  instructorId: string;
  instructorName: string;
  email: string;
  totalSections: number;
  totalEnrolled: number;
  totalCapacity: number;
  sections: SectionEntry[];
};

type Term = { id: string; name: string };

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function fmt(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export default function FacultySchedulePage() {
  const [instructors, setInstructors] = useState<InstructorRow[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    void apiFetch<InstructorRow[]>(`/admin/faculty-schedule?${params}`)
      .then((d) => setInstructors(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return instructors.filter(
      (r) => !q || r.instructorName.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
    );
  }, [instructors, search]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalInstructors = filtered.length;
  const totalSections = filtered.reduce((s, r) => s + r.totalSections, 0);
  const avgSections = totalInstructors > 0 ? (totalSections / totalInstructors).toFixed(1) : "—";

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">教学管理</p>
        <h1 className="campus-title">教师排课总览</h1>
        <p className="campus-subtitle">按教师汇总所有教学班、课时与注册人数</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">授课教师数</p>
          <p className="campus-kpi-value">{loading ? "—" : totalInstructors}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">教学班总数</p>
          <p className="campus-kpi-value">{loading ? "—" : totalSections}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">人均教学班数</p>
          <p className="campus-kpi-value text-[hsl(221_83%_43%)]">{loading ? "—" : avgSections}</p>
        </div>
      </section>

      <div className="campus-toolbar">
        <select className="campus-select w-40" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">全部学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input
          className="campus-input max-w-xs"
          placeholder="搜索教师姓名或邮箱…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setExpanded(new Set(filtered.map((r) => r.instructorId)))}
          className="campus-btn-ghost text-xs"
        >
          全部展开
        </button>
        <button
          type="button"
          onClick={() => setExpanded(new Set())}
          className="campus-btn-ghost text-xs"
        >
          全部收起
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="campus-card p-10 text-center text-slate-400">暂无排课数据</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((inst) => {
            const open = expanded.has(inst.instructorId);
            const util = inst.totalCapacity > 0 ? Math.round((inst.totalEnrolled / inst.totalCapacity) * 100) : 0;
            return (
              <div key={inst.instructorId} className="campus-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(inst.instructorId)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900">{inst.instructorName}</p>
                    <p className="text-xs text-slate-500">{inst.email}</p>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-800">{inst.totalSections} 班</p>
                      <p className="text-xs text-slate-500">{inst.totalEnrolled}/{inst.totalCapacity} 人</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${util >= 90 ? "bg-red-100 text-red-700" : util >= 70 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {util}%
                    </span>
                    <span className="text-slate-400 text-sm">{open ? "▲" : "▼"}</span>
                  </div>
                </button>

                {open ? (
                  <div className="border-t border-slate-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs font-semibold text-slate-400">
                          <th className="px-5 py-2 text-left">课程</th>
                          <th className="px-5 py-2 text-left">教学班</th>
                          <th className="px-5 py-2 text-left">上课时间</th>
                          <th className="px-5 py-2 text-right">容量</th>
                          <th className="px-5 py-2 text-right">注册</th>
                          <th className="px-5 py-2 text-right">候补</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inst.sections.map((sec) => (
                          <tr key={sec.sectionId} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-5 py-2.5">
                              <p className="font-semibold text-slate-800">{sec.courseCode}</p>
                              <p className="text-xs text-slate-500 truncate max-w-[160px]">{sec.courseTitle}</p>
                            </td>
                            <td className="px-5 py-2.5 font-mono text-xs text-slate-600">{sec.sectionCode}</td>
                            <td className="px-5 py-2.5 text-xs text-slate-600">
                              {sec.meetingTimes.length === 0 ? "—" : sec.meetingTimes.map((m) => `${WEEKDAY[m.weekday]} ${fmt(m.startMinutes)}–${fmt(m.endMinutes)}`).join(", ")}
                            </td>
                            <td className="px-5 py-2.5 text-right font-mono text-slate-500">{sec.capacity}</td>
                            <td className="px-5 py-2.5 text-right font-mono font-semibold text-slate-800">{sec.enrolled}</td>
                            <td className={`px-5 py-2.5 text-right font-mono ${sec.waitlisted > 0 ? "text-amber-600 font-bold" : "text-slate-400"}`}>
                              {sec.waitlisted || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
