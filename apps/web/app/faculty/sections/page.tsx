"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type MeetingTime = { weekday: number; startMinutes: number; endMinutes: number };

type Section = {
  id: string;
  sectionCode: string;
  capacity: number;
  modality: string;
  instructorName: string | null;
  credits: number;
  course: { code: string; title: string; credits: number };
  term: { id: string; name: string };
  meetingTimes: MeetingTime[];
  _count: { enrollments: number };
};

type Enrollment = {
  id: string;
  status: string;
  finalGrade: string | null;
  student: {
    id: string;
    email: string;
    studentId: string | null;
    studentProfile: { legalName: string | null; programMajor: string | null } | null;
  };
};

type RosterData = {
  section: Section;
  enrollments: Enrollment[];
};

const DAYS = ["日", "一", "二", "三", "四", "五", "六"];
const VALID_GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "W"];

function fmt(min: number) {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

const STATUS_STYLE: Record<string, string> = {
  ENROLLED: "text-blue-600 bg-blue-50 border-blue-200",
  COMPLETED: "text-emerald-700 bg-emerald-50 border-emerald-200",
  DROPPED: "text-red-600 bg-red-50 border-red-200",
  WAITLISTED: "text-amber-700 bg-amber-50 border-amber-200",
};
const STATUS_LABEL: Record<string, string> = {
  ENROLLED: "在读", COMPLETED: "已完课", DROPPED: "已退课", WAITLISTED: "候补",
};

function gradeColor(g: string | null): string {
  if (!g) return "text-slate-400";
  if (g.startsWith("A")) return "text-emerald-700 font-bold";
  if (g.startsWith("B")) return "text-blue-600 font-bold";
  if (g.startsWith("C")) return "text-amber-600 font-bold";
  if (g === "F" || g === "W") return "text-red-600 font-bold";
  return "text-slate-600 font-bold";
}

export default function FacultySectionsPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [editingGrade, setEditingGrade] = useState<Record<string, string>>({});
  const [savingGrade, setSavingGrade] = useState<string | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void apiFetch<Section[]>("/faculty/sections")
      .then((d) => setSections(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) { setRoster(null); return; }
    setRosterLoading(true);
    setGradeError(null);
    void apiFetch<RosterData>(`/faculty/sections/${selected}/roster`)
      .then((d) => setRoster(d ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setRosterLoading(false));
  }, [selected]);

  async function saveGrade(enrollmentId: string, sectionId: string) {
    const grade = editingGrade[enrollmentId]?.trim().toUpperCase();
    if (!grade) return;
    setSavingGrade(enrollmentId);
    setGradeError(null);
    try {
      await apiFetch(`/faculty/sections/${sectionId}/grades/${enrollmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalGrade: grade }),
      });
      const d = await apiFetch<RosterData>(`/faculty/sections/${sectionId}/roster`);
      setRoster(d ?? null);
      setEditingGrade((prev) => { const n = { ...prev }; delete n[enrollmentId]; return n; });
    } catch (err) {
      setGradeError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingGrade(null);
    }
  }

  const filteredSections = useMemo(() => {
    const q = search.toLowerCase();
    return sections.filter(
      (s) => !q || s.course.code.toLowerCase().includes(q) || s.course.title.toLowerCase().includes(q)
    );
  }, [sections, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, { termName: string; sections: Section[] }>();
    for (const s of filteredSections) {
      if (!map.has(s.term.id)) map.set(s.term.id, { termName: s.term.name, sections: [] });
      map.get(s.term.id)!.sections.push(s);
    }
    return Array.from(map.values());
  }, [filteredSections]);

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">教学管理</p>
        <h1 className="campus-hero-title">我的课程</h1>
        <p className="campus-hero-subtitle">查看所授教学班、学生名单，并录入最终成绩</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">教学班总数</p>
          <p className="campus-kpi-value">{loading ? "—" : sections.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">总学生数</p>
          <p className="campus-kpi-value">
            {loading ? "—" : sections.reduce((s, sec) => s + sec._count.enrollments, 0)}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">开课学期</p>
          <p className="campus-kpi-value">{loading ? "—" : new Set(sections.map((s) => s.term.id)).size}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {!selected ? (
        <>
          <div className="campus-toolbar">
            <input
              className="campus-input max-w-xs"
              placeholder="搜索课程代码或名称…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {loading ? (
            <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
          ) : sections.length === 0 ? (
            <div className="campus-card p-10 text-center text-slate-400">您尚未被分配任何教学班</div>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => (
                <div key={group.termName}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2 px-1">
                    {group.termName}
                  </p>
                  <div className="space-y-2">
                    {group.sections.map((s) => (
                      <div
                        key={s.id}
                        className="campus-card px-5 py-4 cursor-pointer hover:border-blue-300 transition"
                        onClick={() => setSelected(s.id)}
                      >
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-[hsl(221_83%_43%)]">{s.course.code}</p>
                              <p className="text-slate-700 font-medium">{s.course.title}</p>
                              <span className="text-xs text-slate-400 font-mono">{s.sectionCode}</span>
                            </div>
                            <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-500">
                              <span>{s.course.credits} 学分</span>
                              <span className="capitalize">{s.modality}</span>
                              {s.meetingTimes.map((mt, i) => (
                                <span key={i}>周{DAYS[mt.weekday]} {fmt(mt.startMinutes)}–{fmt(mt.endMinutes)}</span>
                              ))}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-bold text-slate-800">
                              {s._count.enrollments}
                              <span className="text-xs font-normal text-slate-400"> / {s.capacity}</span>
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">在读/容量</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : rosterLoading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载花名册中…</div>
      ) : roster ? (
        <>
          <div className="campus-card px-5 py-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="font-bold text-slate-900 text-lg">
                  {roster.section.course.code} — {roster.section.course.title}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {roster.section.term.name} · 班级 {roster.section.sectionCode} · {roster.section.course.credits} 学分
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="campus-btn-ghost text-xs">
                ← 返回列表
              </button>
            </div>
          </div>

          {gradeError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{gradeError}</div>
          ) : null}

          <section className="campus-card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="font-semibold text-slate-700 text-sm">学生名单（{roster.enrollments.length} 人）</p>
              <p className="text-xs text-slate-400">点击"录入/修改"提交最终成绩</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">学生</th>
                    <th className="px-4 py-3 text-left">专业</th>
                    <th className="px-4 py-3 text-left">状态</th>
                    <th className="px-4 py-3 text-center w-40">最终成绩</th>
                    <th className="px-4 py-3 text-center w-20">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.enrollments.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">暂无学生</td></tr>
                  ) : roster.enrollments.map((enr) => {
                    const isEditing = enr.id in editingGrade;
                    const canGrade = ["ENROLLED", "COMPLETED"].includes(enr.status);
                    return (
                      <tr key={enr.id} className={`border-b border-slate-100 hover:bg-slate-50 ${isEditing ? "bg-blue-50/30" : ""}`}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">
                            {enr.student.studentProfile?.legalName ?? enr.student.email}
                          </p>
                          <p className="text-xs text-slate-500">{enr.student.email}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {enr.student.studentProfile?.programMajor ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[enr.status] ?? "text-slate-600 bg-slate-50 border-slate-200"}`}>
                            {STATUS_LABEL[enr.status] ?? enr.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isEditing ? (
                            <select
                              className="campus-select w-24 text-xs"
                              value={editingGrade[enr.id]}
                              onChange={(e) => setEditingGrade((prev) => ({ ...prev, [enr.id]: e.target.value }))}
                            >
                              <option value="">选择…</option>
                              {VALID_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                            </select>
                          ) : (
                            <span className={`font-mono text-sm ${gradeColor(enr.finalGrade)}`}>
                              {enr.finalGrade ?? "—"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {canGrade ? (
                            isEditing ? (
                              <div className="flex justify-center gap-1">
                                <button
                                  type="button"
                                  disabled={savingGrade === enr.id || !editingGrade[enr.id]}
                                  onClick={() => saveGrade(enr.id, roster.section.id)}
                                  className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {savingGrade === enr.id ? "…" : "保存"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingGrade((prev) => {
                                    const n = { ...prev };
                                    delete n[enr.id];
                                    return n;
                                  })}
                                  className="text-[11px] text-slate-500 hover:text-slate-800"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingGrade((prev) => ({ ...prev, [enr.id]: enr.finalGrade ?? "" }))}
                                className="text-xs text-blue-600 hover:text-blue-800 underline"
                              >
                                {enr.finalGrade ? "修改" : "录入"}
                              </button>
                            )
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
