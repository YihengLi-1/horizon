"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type AuditCourse = {
  enrollmentId: string;
  courseCode: string;
  courseTitle: string;
  credits: number;
  finalGrade: string | null;
  termId: string;
  termName: string;
};

type RequirementCard = {
  category: string;
  label: string;
  minCredits: number;
  earnedCredits: number;
  minCourses: number;
  earnedCourses: number;
  met: boolean;
  courses: AuditCourse[];
};

type DegreeAuditResponse = {
  program: {
    name: string;
    totalCredits: number;
    minGpa: number;
  } | null;
  overallCredits: {
    earned: number;
    required: number;
    met: boolean;
  };
  gpa: {
    current: number | null;
    required: number;
    met: boolean;
  };
  requirements: RequirementCard[];
  surplus: AuditCourse[];
  eligible: boolean;
};

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
  P: "text-emerald-700"
};

function RequirementProgress({ requirement }: { requirement: RequirementCard }) {
  const creditPct = requirement.minCredits > 0
    ? Math.min(100, Math.round((requirement.earnedCredits / requirement.minCredits) * 100))
    : 100;

  return (
    <section className="campus-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="campus-eyebrow">{requirement.category}</p>
          <h2 className="text-base font-semibold text-slate-900">{requirement.label}</h2>
          <p className="mt-1 text-sm text-slate-500">
            已修 {requirement.earnedCredits} / {requirement.minCredits} 学分 ·
            课程数 {requirement.earnedCourses} / {requirement.minCourses}
          </p>
        </div>
        <span className={`campus-chip ${requirement.met ? "chip-green" : "chip-amber"}`}>
          {requirement.met ? "已达成" : "未达成"}
        </span>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[hsl(221_83%_43%)] transition-all" style={{ width: `${creditPct}%` }} />
      </div>

      {requirement.courses.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
          暂无匹配到该要求的已修课程。
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="campus-table">
            <thead>
              <tr>
                <th>课程代码</th>
                <th>课程名称</th>
                <th>学期</th>
                <th>学分</th>
                <th>成绩</th>
              </tr>
            </thead>
            <tbody>
              {requirement.courses.map((course) => (
                <tr key={course.enrollmentId}>
                  <td className="font-mono font-semibold text-[hsl(221_83%_43%)]">{course.courseCode}</td>
                  <td>{course.courseTitle}</td>
                  <td>{course.termName}</td>
                  <td>{course.credits}</td>
                  <td className={GRADE_COLOR[course.finalGrade ?? ""] ?? "text-slate-700"}>
                    {course.finalGrade ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function DegreeAuditPage() {
  const [audit, setAudit] = useState<DegreeAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    void apiFetch<DegreeAuditResponse>("/students/me/degree-audit")
      .then((data) => setAudit(data))
      .catch((err) => {
        setAudit(null);
        setError(err instanceof Error ? err.message : "毕业审计加载失败");
      })
      .finally(() => setLoading(false));
  }, []);

  const surplusByTerm = useMemo(() => {
    const groups = new Map<string, { termName: string; courses: AuditCourse[] }>();
    for (const course of audit?.surplus ?? []) {
      const group = groups.get(course.termId) ?? { termName: course.termName, courses: [] };
      group.courses.push(course);
      groups.set(course.termId, group);
    }
    return Array.from(groups.entries()).map(([termId, group]) => ({
      termId,
      termName: group.termName,
      courses: group.courses
    }));
  }, [audit]);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">毕业进度</p>
        <h1 className="campus-title">毕业审计</h1>
        <p className="campus-subtitle">基于已申报专业与已完成课程，汇总当前学位完成情况。</p>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">⚠️ 仅供参考</p>
          <p className="mt-1 opacity-80">最终毕业资格仍以注册处和院系正式审核结果为准。</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="campus-card p-10 text-center text-sm text-slate-500">加载中…</div>
      ) : !audit ? (
        <div className="campus-card p-10 text-center text-sm text-slate-500">无法加载毕业审计数据。</div>
      ) : !audit.program ? (
        <div className="campus-card p-10 text-center text-sm text-slate-600">
          尚未申报专业，请联系注册处。
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="campus-kpi">
              <p className="campus-kpi-label">总学分</p>
              <p className="campus-kpi-value">
                {audit.overallCredits.earned} / {audit.overallCredits.required}
              </p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">当前 GPA</p>
              <p className="campus-kpi-value">
                {audit.gpa.current !== null ? audit.gpa.current.toFixed(2) : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500">要求至少 {audit.gpa.required.toFixed(1)}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">整体状态</p>
              <p className="campus-kpi-value">{audit.eligible ? "已达标" : "未达标"}</p>
              <p className="mt-1 text-xs text-slate-500">{audit.program.name}</p>
            </div>
          </div>

          <section className="campus-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">总学分进度</h2>
                <p className="mt-1 text-sm text-slate-500">
                  已完成 {audit.overallCredits.earned} / {audit.overallCredits.required} 学分
                </p>
              </div>
              <span className={`campus-chip ${audit.overallCredits.met ? "chip-green" : "chip-amber"}`}>
                {audit.overallCredits.met ? "学分达标" : "继续修读"}
              </span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[hsl(221_83%_43%)] transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((audit.overallCredits.earned / Math.max(audit.overallCredits.required, 1)) * 100)
                  )}%`
                }}
              />
            </div>
          </section>

          <div className="space-y-4">
            {audit.requirements.map((requirement) => (
              <RequirementProgress key={`${requirement.category}-${requirement.label}`} requirement={requirement} />
            ))}
          </div>

          <section className="campus-card p-5">
            <h2 className="text-base font-semibold text-slate-900">未分类已修课程</h2>
            <p className="mt-1 text-sm text-slate-500">以下课程当前未命中任何专业要求，可视为剩余自由学分。</p>
            {surplusByTerm.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                暂无未分类课程。
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {surplusByTerm.map((group) => (
                  <div key={group.termId} className="rounded-xl border border-slate-200">
                    <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
                      {group.termName}
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
                              <td className="font-mono font-semibold text-[hsl(221_83%_43%)]">{course.courseCode}</td>
                              <td>{course.courseTitle}</td>
                              <td>{course.credits}</td>
                              <td className={GRADE_COLOR[course.finalGrade ?? ""] ?? "text-slate-700"}>
                                {course.finalGrade ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
