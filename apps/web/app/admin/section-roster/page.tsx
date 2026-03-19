"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type SectionSummary = {
  id: string;
  sectionCode: string;
  instructorName: string | null;
  capacity: number;
  course: { code: string; title: string };
  term: { name: string };
  enrollments: unknown[];
};

type RosterRow = {
  no: number;
  email: string;
  name: string;
  status: string;
  finalGrade: string;
  enrolledAt: string;
};

type RosterData = {
  sectionId: string;
  courseCode: string;
  courseTitle: string;
  credits: number;
  termName: string;
  instructorEmail: string;
  capacity: number;
  enrolled: number;
  completed: number;
  dropped: number;
  avgGpa: number | null;
  roster: RosterRow[];
};

const STATUS_LABELS: Record<string, string> = {
  ENROLLED: "在读",
  COMPLETED: "已完课",
  DROPPED: "已退课",
  WAITLISTED: "候补",
};

const STATUS_COLORS: Record<string, string> = {
  ENROLLED: "text-blue-600 bg-blue-50 border-blue-200",
  COMPLETED: "text-emerald-700 bg-emerald-50 border-emerald-200",
  DROPPED: "text-red-600 bg-red-50 border-red-200",
  WAITLISTED: "text-amber-700 bg-amber-50 border-amber-200",
};

const GRADE_COLOR: (g: string) => string = (g) => {
  if (g.startsWith("A")) return "text-emerald-700 font-bold";
  if (g.startsWith("B")) return "text-blue-600 font-bold";
  if (g.startsWith("C")) return "text-amber-600 font-bold";
  if (g === "F" || g === "W") return "text-red-600 font-bold";
  return "text-slate-400";
};

export default function SectionRosterPage() {
  const [sections, setSections] = useState<SectionSummary[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    void apiFetch<SectionSummary[]>("/admin/sections")
      .then((d) => setSections(d ?? []))
      .catch(() => {})
      .finally(() => setSectionsLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) { setRoster(null); return; }
    setRosterLoading(true);
    setError("");
    void apiFetch<RosterData>(`/admin/section-roster/${selectedId}`)
      .then((d) => setRoster(d ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : "加载花名册失败"))
      .finally(() => setRosterLoading(false));
  }, [selectedId]);

  const filteredSections = useMemo(() => {
    const q = search.toLowerCase();
    return sections.filter(
      (s) => !q || s.course.code.toLowerCase().includes(q) || s.course.title.toLowerCase().includes(q) || s.sectionCode.toLowerCase().includes(q)
    );
  }, [sections, search]);

  const filteredRoster = useMemo(() => {
    if (!roster) return [];
    return roster.roster.filter((r) => !statusFilter || r.status === statusFilter);
  }, [roster, statusFilter]);

  function exportCsv() {
    if (!roster) return;
    const headers = ["序号", "邮箱", "姓名", "状态", "成绩", "注册日期"];
    const rows = [
      headers.join(","),
      ...filteredRoster.map((r) => [
        r.no, `"${r.email}"`, `"${r.name}"`, STATUS_LABELS[r.status] ?? r.status, r.finalGrade, r.enrolledAt
      ].join(","))
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `roster-${roster.courseCode}-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">班级管理</p>
        <h1 className="campus-title">班级花名册</h1>
        <p className="campus-subtitle">查看各教学班注册学生名单及成绩，支持 CSV 导出</p>
      </section>

      {!selectedId ? (
        <>
          <div className="campus-toolbar">
            <input
              className="campus-input max-w-xs"
              placeholder="搜索课程代码、班级…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <section className="campus-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3 text-left">课程 / 班级</th>
                  <th className="px-4 py-3 text-left">学期</th>
                  <th className="px-4 py-3 text-left">教师</th>
                  <th className="px-4 py-3 text-right">注册/容量</th>
                </tr>
              </thead>
              <tbody>
                {sectionsLoading ? (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
                ) : filteredSections.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">暂无教学班</td></tr>
                ) : filteredSections.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedId(s.id)}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-[hsl(221_83%_43%)]">{s.course.code}</p>
                      <p className="text-xs text-slate-500">{s.course.title}</p>
                      <p className="text-xs text-slate-400 font-mono">{s.sectionCode}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{s.term.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{s.instructorName ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm">
                      <span className={s.enrollments.length >= s.capacity ? "text-red-600 font-bold" : "text-slate-700"}>
                        {s.enrollments.length}
                      </span>
                      <span className="text-slate-400">/{s.capacity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : rosterLoading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载花名册中…</div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : roster ? (
        <>
          {/* KPIs */}
          <section className="grid gap-3 sm:grid-cols-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">在读</p>
              <p className="campus-kpi-value text-blue-600">{roster.enrolled}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">已完课</p>
              <p className="campus-kpi-value text-emerald-600">{roster.completed}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">已退课</p>
              <p className="campus-kpi-value text-red-500">{roster.dropped}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">班级均 GPA</p>
              <p className="campus-kpi-value">
                {roster.avgGpa != null ? roster.avgGpa.toFixed(2) : "—"}
              </p>
            </div>
          </section>

          {/* Header info */}
          <div className="campus-card px-5 py-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="font-bold text-slate-900 text-lg">{roster.courseCode} — {roster.courseTitle}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {roster.credits} 学分 · {roster.termName} · 教师: {roster.instructorEmail}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} className="campus-btn-ghost text-xs">
                ← 返回列表
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <div className="campus-toolbar">
            <select className="campus-select w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">全部状态</option>
              <option value="ENROLLED">在读</option>
              <option value="COMPLETED">已完课</option>
              <option value="DROPPED">已退课</option>
              <option value="WAITLISTED">候补</option>
            </select>
            <button type="button" onClick={exportCsv} disabled={!filteredRoster.length} className="campus-btn-ghost shrink-0 disabled:opacity-40">
              CSV 导出
            </button>
          </div>

          {/* Roster table */}
          <section className="campus-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                    <th className="px-4 py-3 text-right w-12">#</th>
                    <th className="px-4 py-3 text-left">学生</th>
                    <th className="px-4 py-3 text-left">状态</th>
                    <th className="px-4 py-3 text-right">成绩</th>
                    <th className="px-4 py-3 text-right">注册日期</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoster.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">暂无学生</td></tr>
                  ) : filteredRoster.map((row) => (
                    <tr key={row.no} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-400">{row.no}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{row.name}</p>
                        <p className="text-xs text-slate-500">{row.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[row.status] ?? "text-slate-600 bg-slate-50 border-slate-200"}`}>
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-sm ${GRADE_COLOR(row.finalGrade)}`}>
                        {row.finalGrade}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-slate-500">{row.enrolledAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredRoster.length > 0 ? (
              <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
                共 {filteredRoster.length} 条记录
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
