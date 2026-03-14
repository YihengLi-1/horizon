"use client";

/**
 * Student Enrollment Timeline
 * Fetches the student's full enrollment history and renders it as an
 * interactive chronological timeline grouped by term.
 */

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type EnrollmentItem = {
  enrollmentId: string;
  sectionId: string;
  sectionCode: string;
  courseCode: string;
  courseTitle: string;
  credits: number;
  status: string;
  finalGrade: string | null;
  enrolledAt: string;
};

type TermGroup = {
  termId: string;
  termName: string;
  enrollments: EnrollmentItem[];
};

type StudentProfileResponse = {
  enrollments?: Array<{
    id: string;
    createdAt?: string;
    status: string;
    finalGrade: string | null;
    section: {
      id?: string;
      credits: number;
      sectionCode: string;
      course: {
        code: string;
        title: string;
      };
      term?: {
        id: string;
        name: string;
      };
    };
  }>;
};

const STATUS_STYLES: Record<string, string> = {
  ENROLLED: "bg-emerald-100 text-emerald-800",
  COMPLETED: "bg-indigo-100 text-indigo-800",
  DROPPED: "bg-red-100 text-red-700",
  WAITLISTED: "bg-amber-100 text-amber-800",
};

const GRADE_GPA: Record<string, number> = {
  "A+": 4.0, "A": 4.0, "A-": 3.7,
  "B+": 3.3, "B": 3.0, "B-": 2.7,
  "C+": 2.3, "C": 2.0, "C-": 1.7,
  "D+": 1.3, "D": 1.0, "D-": 0.7,
  "F": 0, "W": 0,
};

export default function EnrollmentTimelinePage() {
  const [groups, setGroups] = useState<TermGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string>("ALL");
  const [expandedTerms, setExpandedTerms] = useState<Set<string>>(new Set());

  useEffect(() => {
    void apiFetch<StudentProfileResponse>("/students/me")
      .then((profile) => {
        const byTerm = new Map<string, TermGroup>();

        for (const enrollment of profile.enrollments ?? []) {
          const termId = enrollment.section.term?.id ?? "unknown-term";
          const termName = enrollment.section.term?.name ?? "Unknown term";
          const bucket = byTerm.get(termId) ?? {
            termId,
            termName,
            enrollments: []
          };

          bucket.enrollments.push({
            enrollmentId: enrollment.id,
            sectionId: enrollment.section.id ?? enrollment.id,
            sectionCode: enrollment.section.sectionCode,
            courseCode: enrollment.section.course.code,
            courseTitle: enrollment.section.course.title,
            credits: enrollment.section.credits,
            status: enrollment.status,
            finalGrade: enrollment.finalGrade,
            enrolledAt: enrollment.createdAt ?? ""
          });

          byTerm.set(termId, bucket);
        }

        const nextGroups = [...byTerm.values()].sort((a, b) => a.termName.localeCompare(b.termName));
        setGroups(nextGroups);
        setExpandedTerms(new Set(nextGroups.map((group) => group.termId)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    if (groups.length === 0) return null;
    const all = groups.flatMap((g) => g.enrollments);
    const completed = all.filter((e) => e.status === "COMPLETED");
    const totalCredits = completed.reduce((s, e) => s + e.credits, 0);
    const gradedItems = completed.filter((e) => e.finalGrade && e.finalGrade !== "W" && GRADE_GPA[e.finalGrade] !== undefined);
    const gpa = gradedItems.length
      ? gradedItems.reduce((s, e) => s + GRADE_GPA[e.finalGrade!] * e.credits, 0) /
        Math.max(1, gradedItems.reduce((s, e) => s + e.credits, 0))
      : 0;
    return {
      terms: groups.length,
      total: all.length,
      completed: completed.length,
      credits: totalCredits,
      gpa,
    };
  }, [groups]);

  function toggleTerm(id: string) {
    setExpandedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const filteredGroups = groups.map((g) => ({
    ...g,
    enrollments: filter === "ALL" ? g.enrollments : g.enrollments.filter((e) => e.status === filter),
  })).filter((g) => g.enrollments.length > 0);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">My Timeline</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">选课历程</h1>
        <p className="mt-1 text-sm text-slate-500">按学期查看所有选课记录与成绩进展</p>
      </section>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            { label: "学期数", value: stats.terms, color: "text-indigo-600" },
            { label: "总课程数", value: stats.total },
            { label: "已完成", value: stats.completed, color: "text-emerald-600" },
            { label: "已得学分", value: stats.credits, color: "text-emerald-600" },
            { label: "累计 GPA", value: stats.gpa.toFixed(2), color: stats.gpa >= 3.5 ? "text-emerald-600" : stats.gpa >= 2.0 ? "text-amber-600" : "text-red-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="campus-kpi">
              <p className="campus-kpi-label">{label}</p>
              <p className={`campus-kpi-value ${color ?? ""}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="campus-toolbar flex-wrap gap-2">
        {["ALL", "ENROLLED", "COMPLETED", "DROPPED", "WAITLISTED"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`campus-chip text-xs font-semibold ${filter === s ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}
          >
            {s === "ALL" ? "全部" : s === "ENROLLED" ? "在读" : s === "COMPLETED" ? "完成" : s === "DROPPED" ? "退课" : "候补"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : filteredGroups.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">暂无记录</div>
      ) : (
        <div className="relative space-y-4">
          {/* Vertical timeline line */}
          <div className="absolute left-[22px] top-6 bottom-0 w-0.5 bg-slate-200" />

          {filteredGroups.map((group) => {
            const isOpen = expandedTerms.has(group.termId);
            const termCompleted = group.enrollments.filter((e) => e.status === "COMPLETED").length;
            const termCredits = group.enrollments.filter((e) => e.status === "COMPLETED").reduce((s, e) => s + e.credits, 0);
            return (
              <div key={group.termId} className="relative pl-12">
                {/* Timeline dot */}
                <div className="absolute left-3 top-3.5 size-5 rounded-full bg-indigo-500 flex items-center justify-center shadow">
                  <div className="size-2 rounded-full bg-white" />
                </div>

                <div className="campus-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleTerm(group.termId)}
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-50 text-left"
                  >
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{group.termName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {group.enrollments.length} 门课 · 完成 {termCompleted} 门 · 获得 {termCredits} 学分
                      </p>
                    </div>
                    <span className="text-slate-400 text-sm ml-4">{isOpen ? "▲" : "▼"}</span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 divide-y divide-slate-50">
                      {group.enrollments.map((e) => (
                        <div key={e.enrollmentId} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-bold text-indigo-700">{e.courseCode}</span>
                              <span className="text-xs text-slate-700 truncate">{e.courseTitle}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              §{e.sectionCode} · {e.credits} 学分
                              {e.enrolledAt ? ` · ${e.enrolledAt.slice(0, 10)}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {e.finalGrade && (
                              <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                                {e.finalGrade}
                              </span>
                            )}
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[e.status] ?? "bg-slate-100 text-slate-600"}`}>
                              {e.status === "ENROLLED" ? "在读" : e.status === "COMPLETED" ? "完成" : e.status === "DROPPED" ? "退课" : "候补"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
