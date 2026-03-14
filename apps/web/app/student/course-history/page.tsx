"use client";

/**
 * Student Course History
 * Full history of all enrollments grouped by term, with GPA and status breakdown.
 * Calls GET /students/course-history
 */

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type CourseItem = {
  enrollmentId: string; status: string; finalGrade: string | null; gradePoints: number | null;
  enrolledAt: string; sectionCode: string;
  courseId: string; courseCode: string; courseTitle: string; credits: number;
  termId: string; termName: string; instructorName: string;
};
type TermGroup = { termId: string; termName: string; enrollments: CourseItem[] };
type HistoryData = {
  terms: TermGroup[];
  summary: {
    totalCourses: number; completedCourses: number; droppedCourses: number;
    totalCredits: number; cumulativeGpa: number | null;
  };
};

const STATUS_COLORS: Record<string, string> = {
  ENROLLED: "text-indigo-600 bg-indigo-50",
  COMPLETED: "text-emerald-700 bg-emerald-50",
  DROPPED: "text-amber-700 bg-amber-50",
  WAITLISTED: "text-slate-500 bg-slate-100",
};

const GRADE_COLORS: Record<string, string> = {
  "A+": "text-emerald-700", "A": "text-emerald-700", "A-": "text-emerald-600",
  "B+": "text-indigo-700", "B": "text-indigo-700", "B-": "text-indigo-600",
  "C+": "text-amber-700", "C": "text-amber-700", "C-": "text-amber-600",
  "D+": "text-orange-700", "D": "text-orange-700", "D-": "text-orange-600",
  "F": "text-red-700", "W": "text-slate-400",
};

function downloadCsv(data: HistoryData) {
  const header = "Term,Course,SectionCode,Credits,Status,Grade,GradePoints,EnrolledAt,Instructor";
  const lines: string[] = [];
  for (const term of data.terms) {
    for (const e of term.enrollments) {
      lines.push(`"${e.termName}","${e.courseCode} ${e.courseTitle}",${e.sectionCode},${e.credits},${e.status},${e.finalGrade ?? ""},${e.gradePoints ?? ""},${e.enrolledAt},"${e.instructorName}"`);
    }
  }
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "course-history.csv";
  a.click(); URL.revokeObjectURL(url);
}

export default function CourseHistoryPage() {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedTerms, setExpandedTerms] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    void apiFetch<HistoryData>("/students/course-history")
      .then((d) => {
        setData(d);
        // Expand all terms by default
        setExpandedTerms(new Set(d.terms.map((t) => t.termId)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  function toggleTerm(termId: string) {
    setExpandedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(termId)) next.delete(termId); else next.add(termId);
      return next;
    });
  }

  const filteredTerms = useMemo(() => {
    if (!data) return [];
    return data.terms.map((t) => ({
      ...t,
      enrollments: t.enrollments.filter((e) => {
        const matchStatus = statusFilter === "ALL" || e.status === statusFilter;
        const matchSearch = !search ||
          e.courseCode.toLowerCase().includes(search.toLowerCase()) ||
          e.courseTitle.toLowerCase().includes(search.toLowerCase());
        return matchStatus && matchSearch;
      })
    })).filter((t) => t.enrollments.length > 0);
  }, [data, statusFilter, search]);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Records</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">课程修读历史</h1>
        <p className="mt-1 text-sm text-slate-500">按学期查看所有注册记录与成绩</p>
      </section>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : data ? (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div className="campus-kpi">
              <p className="campus-kpi-label">总课程数</p>
              <p className="campus-kpi-value">{data.summary.totalCourses}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">完成课程</p>
              <p className="campus-kpi-value text-emerald-600">{data.summary.completedCourses}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">退课数</p>
              <p className="campus-kpi-value text-amber-600">{data.summary.droppedCourses}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">总学分</p>
              <p className="campus-kpi-value text-indigo-600">{data.summary.totalCredits}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">累计 GPA</p>
              <p className={`campus-kpi-value ${data.summary.cumulativeGpa && data.summary.cumulativeGpa >= 3.5 ? "text-emerald-600" : "text-indigo-600"}`}>
                {data.summary.cumulativeGpa?.toFixed(2) ?? "—"}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="campus-toolbar gap-2 flex-wrap">
            <input
              className="campus-input flex-1 min-w-48"
              placeholder="搜索课程代码或名称…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {(["ALL", "ENROLLED", "COMPLETED", "DROPPED", "WAITLISTED"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`campus-chip ${statusFilter === s ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 bg-slate-50 text-slate-600"}`}
              >
                {s === "ALL" ? "全部" : s === "ENROLLED" ? "在读" : s === "COMPLETED" ? "完成" : s === "DROPPED" ? "退课" : "候补"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => downloadCsv(data)}
              className="campus-chip border-indigo-200 bg-indigo-50 text-indigo-700"
            >
              导出 CSV
            </button>
          </div>

          {/* Terms accordion */}
          <div className="space-y-3">
            {filteredTerms.length === 0 ? (
              <div className="campus-card px-6 py-10 text-center text-sm text-slate-400">无匹配记录</div>
            ) : (
              filteredTerms.map((term) => {
                const isExpanded = expandedTerms.has(term.termId);
                const termCredits = term.enrollments.filter((e) => e.status === "COMPLETED").reduce((s, e) => s + e.credits, 0);
                return (
                  <div key={term.termId} className="campus-card overflow-hidden">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
                      onClick={() => toggleTerm(term.termId)}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-slate-900">{term.termName}</span>
                        <span className="text-xs text-slate-400">{term.enrollments.length} 门课 · {termCredits} 学分</span>
                      </div>
                      <span className="text-slate-400 text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 text-slate-400">
                              <th className="pb-2 pl-4 pt-2 text-left font-semibold">课程</th>
                              <th className="pb-2 pr-3 text-center font-semibold">学分</th>
                              <th className="pb-2 pr-3 text-center font-semibold">状态</th>
                              <th className="pb-2 pr-3 text-center font-semibold">成绩</th>
                              <th className="pb-2 pr-3 text-left font-semibold hidden sm:table-cell">教师</th>
                              <th className="pb-2 pr-4 text-right font-semibold">注册日期</th>
                            </tr>
                          </thead>
                          <tbody>
                            {term.enrollments.map((e) => (
                              <tr key={e.enrollmentId} className="border-b border-slate-50 hover:bg-slate-50">
                                <td className="py-2.5 pl-4 pr-3">
                                  <span className="font-mono font-bold text-indigo-700">{e.courseCode}</span>
                                  <span className="text-slate-500 ml-1 hidden sm:inline">
                                    {e.courseTitle.length > 30 ? e.courseTitle.slice(0, 30) + "…" : e.courseTitle}
                                  </span>
                                </td>
                                <td className="py-2.5 pr-3 text-center text-slate-600">{e.credits}</td>
                                <td className="py-2.5 pr-3 text-center">
                                  <span className={`inline-block rounded px-1.5 py-0.5 font-medium text-xs ${STATUS_COLORS[e.status] ?? ""}`}>
                                    {e.status}
                                  </span>
                                </td>
                                <td className="py-2.5 pr-3 text-center">
                                  {e.finalGrade ? (
                                    <span className={`font-mono font-bold ${GRADE_COLORS[e.finalGrade] ?? "text-slate-700"}`}>
                                      {e.finalGrade}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 pr-3 text-slate-400 hidden sm:table-cell">{e.instructorName}</td>
                                <td className="py-2.5 pr-4 text-right text-slate-400">{e.enrolledAt}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
