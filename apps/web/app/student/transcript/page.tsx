"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type TranscriptEnrollment = {
  id: string;
  finalGrade: string | null;
  section: {
    credits: number;
    sectionCode: string;
    course: { code: string; title: string };
  };
};

type TranscriptTerm = {
  termId: string;
  termName: string;
  termStartDate: string;
  semesterGpa: number | null;
  cumulativeGpa: number | null;
  enrollments: TranscriptEnrollment[];
};

function gradeTone(grade: string | null) {
  if (!grade) return "text-slate-400";
  if (grade.startsWith("A")) return "text-emerald-600";
  if (grade.startsWith("B")) return "text-indigo-600";
  if (grade.startsWith("C")) return "text-amber-600";
  if (grade === "W") return "text-slate-400";
  return "text-red-600";
}

export default function TranscriptPage() {
  const [terms, setTerms] = useState<TranscriptTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generatedAt = new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date());

  useEffect(() => {
    void apiFetch<TranscriptTerm[]>("/students/transcript")
      .then((data) => setTerms(data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "成绩单加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    const totalCourses = terms.reduce((sum, term) => sum + term.enrollments.length, 0);
    const totalCredits = terms.reduce(
      (sum, term) => sum + term.enrollments.reduce((inner, enrollment) => inner + enrollment.section.credits, 0),
      0
    );
    return {
      totalTerms: terms.length,
      totalCourses,
      totalCredits,
      cumulativeGpa: terms[0]?.cumulativeGpa ?? null
    };
  }, [terms]);

  return (
    <div className="campus-page space-y-6">
      <div className="no-print flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        <Link href="/student/grades" className="flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium text-slate-500 no-underline transition hover:bg-white hover:text-slate-900">
          成绩
        </Link>
        <span className="flex-1 rounded-lg bg-white px-4 py-2 text-center text-sm font-semibold text-slate-900 shadow-sm">
          成绩单
        </span>
      </div>

      <div className="no-print flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          打印成绩单
        </button>
      </div>

      <div className="print-only hidden border-b border-slate-300 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xl font-bold text-slate-900">地平线大学</p>
            <p className="text-sm text-slate-600">正式成绩单</p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>生成时间：{generatedAt}</p>
          </div>
        </div>
      </div>

      <section className="campus-hero">
        <p className="campus-eyebrow">学业记录</p>
        <h1 className="campus-title">成绩单</h1>
        <p className="campus-subtitle">按学期汇总已出分课程、学分与 GPA 变化。</p>
      </section>

      {error ? <div className="campus-card border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">加载中…</div>
      ) : terms.length === 0 ? (
        <section className="campus-card">
          <div className="campus-empty">
            <div className="campus-empty-icon">📄</div>
            <p className="campus-empty-title">暂无成绩单记录</p>
            <p className="campus-empty-desc">当前还没有已出分课程。课程结课并发布成绩后，成绩单会自动出现在这里。</p>
            <Link
              href="/student/grades"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-[hsl(221_83%_43%)] px-4 text-sm font-semibold text-white no-underline transition hover:bg-[hsl(221_83%_38%)]"
            >
              返回成绩页
            </Link>
          </div>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">已完成学期</p>
              <p className="campus-kpi-value">{summary.totalTerms}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">已出分课程</p>
              <p className="campus-kpi-value">{summary.totalCourses}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">已获学分</p>
              <p className="campus-kpi-value text-emerald-600">{summary.totalCredits}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">累计 GPA</p>
              <p className="campus-kpi-value text-indigo-600">{summary.cumulativeGpa?.toFixed(2) ?? "—"}</p>
            </div>
          </div>

          <div className="space-y-5">
            {terms.map((term) => (
              <section key={term.termId} className="campus-card overflow-hidden" style={{ breakInside: "avoid" }}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{term.termName}</h2>
                    <p className="mt-1 text-xs text-slate-500">{term.enrollments.length} 门课程</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="campus-chip border-slate-200 bg-white text-slate-700">
                      学期 GPA {term.semesterGpa?.toFixed(2) ?? "—"}
                    </span>
                    <span className="campus-chip border-indigo-200 bg-indigo-50 text-indigo-700">
                      累计 GPA {term.cumulativeGpa?.toFixed(2) ?? "—"}
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="campus-table min-w-[720px]">
                    <thead>
                      <tr>
                        <th>课程代码</th>
                        <th>课程名称</th>
                        <th>班级</th>
                        <th>学分</th>
                        <th>成绩</th>
                      </tr>
                    </thead>
                    <tbody>
                      {term.enrollments.map((enrollment) => (
                        <tr key={enrollment.id}>
                          <td className="font-semibold text-slate-900">{enrollment.section.course.code}</td>
                          <td>{enrollment.section.course.title}</td>
                          <td>§{enrollment.section.sectionCode}</td>
                          <td>{enrollment.section.credits}</td>
                          <td className={`font-semibold ${gradeTone(enrollment.finalGrade)}`}>{enrollment.finalGrade ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      <div className="print-only hidden border-t border-slate-300 pt-3 text-xs text-slate-500">
        本文件由地平线学生信息系统生成，如有疑问请联系注册处。
      </div>
    </div>
  );
}
