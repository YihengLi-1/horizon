"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type MeResponse = {
  legalName?: string;
  programMajor?: string | null;
  gpa?: number | null;
  enrollments?: Array<{
    id: string;
    status: string;
    finalGrade: string | null;
    section: {
      credits: number;
      course: {
        code: string;
        title: string;
      };
      term: {
        id: string;
        name: string;
      };
    };
  }>;
};

type CompletedCourse = {
  enrollmentId: string;
  code: string;
  title: string;
  credits: number;
  grade: string;
  termId: string;
  termName: string;
};

type TermGroup = {
  termId: string;
  termName: string;
  courses: CompletedCourse[];
  credits: number;
};

const DEGREE_CREDIT_TARGET = 120;

const GRADE_COLOR: Record<string, string> = {
  "A+": "text-green-800",
  A: "text-green-800",
  "A-": "text-green-700",
  "B+": "text-blue-700",
  B: "text-blue-700",
  "B-": "text-blue-600",
  "C+": "text-amber-800",
  C: "text-amber-800",
  "C-": "text-amber-700",
  "D+": "text-orange-700",
  D: "text-orange-700",
  "D-": "text-orange-600",
  F: "text-red-700",
};

export default function DegreeAuditPage() {
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    void apiFetch<MeResponse>("/students/me")
      .then((me) => setProfile(me))
      .catch((err) => {
        setProfile(null);
        setError(err instanceof Error ? err.message : "加载毕业审计失败");
      })
      .finally(() => setLoading(false));
  }, []);

  const audit = useMemo(() => {
    const completed = (profile?.enrollments ?? []).filter(
      (enrollment) => enrollment.status === "COMPLETED" && enrollment.finalGrade && enrollment.finalGrade !== "W"
    );

    const groups = new Map<string, TermGroup>();
    let completedCredits = 0;

    for (const enrollment of completed) {
      const course: CompletedCourse = {
        enrollmentId: enrollment.id,
        code: enrollment.section.course.code,
        title: enrollment.section.course.title,
        credits: enrollment.section.credits,
        grade: enrollment.finalGrade ?? "",
        termId: enrollment.section.term.id,
        termName: enrollment.section.term.name,
      };

      completedCredits += course.credits;

      const existing = groups.get(course.termId) ?? {
        termId: course.termId,
        termName: course.termName,
        courses: [],
        credits: 0,
      };
      existing.courses.push(course);
      existing.credits += course.credits;
      groups.set(course.termId, existing);
    }

    const termGroups = Array.from(groups.values())
      .map((group) => ({
        ...group,
        courses: [...group.courses].sort((a, b) => a.code.localeCompare(b.code)),
      }))
      .sort((a, b) => a.termName.localeCompare(b.termName));

    return {
      completedCredits,
      completedCourseCount: completed.length,
      remainingCredits: Math.max(0, DEGREE_CREDIT_TARGET - completedCredits),
      gpa: profile?.gpa ?? null,
      progressPct: Math.max(0, Math.min(100, (completedCredits / DEGREE_CREDIT_TARGET) * 100)),
      termGroups,
    };
  }, [profile]);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">毕业进度</p>
        <h1 className="campus-title">毕业审计</h1>
        <p className="campus-subtitle">
          {profile?.legalName ?? "学生"} · {profile?.programMajor ?? "未申报专业"} 的毕业完成情况概览
        </p>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
        <p className="font-semibold">⚠️ 仅供参考，非正式毕业认定</p>
        <p className="mt-1 opacity-80">
          当前页面仅按通用 120 学分目标汇总你的已完成课程与成绩，不区分专业核心、选修或院系个性化要求。
          具体毕业条件请以注册处和院系培养方案为准。
        </p>
      </div>

      {loading ? (
        <div className="campus-card p-10 text-center text-sm text-slate-500">加载中…</div>
      ) : !profile ? (
        <div className="campus-card p-10 text-center text-sm text-slate-400">无法加载毕业审计数据</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="campus-kpi">
              <p className="campus-kpi-label">已完成总学分</p>
              <p className="campus-kpi-value">{audit.completedCredits}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">已完成课程数</p>
              <p className="campus-kpi-value">{audit.completedCourseCount}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">当前 GPA</p>
              <p className="campus-kpi-value">{audit.gpa !== null ? audit.gpa.toFixed(2) : "—"}</p>
            </div>
          </div>

          <section className="campus-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">总学分进度</h2>
                <p className="mt-1 text-sm text-slate-500">
                  已完成 {audit.completedCredits} / {DEGREE_CREDIT_TARGET} 学分，还差 {audit.remainingCredits} 学分
                </p>
              </div>
              <span className="campus-chip chip-blue">{Math.round(audit.progressPct)}%</span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[hsl(221_83%_43%)] transition-all" style={{ width: `${audit.progressPct}%` }} />
            </div>
          </section>

          {audit.termGroups.length === 0 ? (
            <div className="campus-card p-10 text-center text-sm text-slate-500">
              暂无已完成课程记录。
            </div>
          ) : (
            <div className="space-y-5">
              {audit.termGroups.map((group) => (
                <section key={group.termId} className="campus-card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">{group.termName}</h2>
                      <p className="mt-0.5 text-xs text-slate-500">{group.courses.length} 门课程 · {group.credits} 学分</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="campus-table">
                      <thead>
                        <tr>
                          <th>课程代码</th>
                          <th>课程名称</th>
                          <th>学分</th>
                          <th>成绩</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.courses.map((course) => (
                          <tr key={course.enrollmentId}>
                            <td className="font-mono font-semibold text-[hsl(221_83%_43%)]">{course.code}</td>
                            <td>{course.title}</td>
                            <td>{course.credits}</td>
                            <td>
                              <span className={`font-semibold ${GRADE_COLOR[course.grade] ?? "text-slate-700"}`}>
                                {course.grade}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
