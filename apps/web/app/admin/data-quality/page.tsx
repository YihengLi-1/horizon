"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type SectionBasic = {
  id: string;
  sectionCode: string;
  course: { code: string; title: string };
};

type CourseBasic = {
  id: string;
  code: string;
  title: string;
};

type DataQuality = {
  sectionsNoInstructor: SectionBasic[];
  sectionsNoMeetings: SectionBasic[];
  enrollmentsNoGrade: number;
  studentsNoProfile: number;
  coursesNoSections: CourseBasic[];
};

type IssueRow = {
  severity: "high" | "medium" | "low";
  category: string;
  description: string;
  count: number;
  detail?: string[];
};

function severityStyle(s: IssueRow["severity"]) {
  if (s === "high") return { dot: "bg-red-500", badge: "bg-red-50 border-red-200 text-red-700", label: "高" };
  if (s === "medium") return { dot: "bg-amber-500", badge: "bg-amber-50 border-amber-200 text-amber-700", label: "中" };
  return { dot: "bg-blue-400", badge: "bg-blue-50 border-blue-200 text-blue-700", label: "低" };
}

export default function DataQualityPage() {
  const [data, setData] = useState<DataQuality | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    void apiFetch<DataQuality>("/admin/data-quality")
      .then((d) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const issues: IssueRow[] = data
    ? [
        {
          severity: "high",
          category: "成绩缺失",
          description: "已完课但未录入最终成绩的注册记录",
          count: data.enrollmentsNoGrade,
        },
        {
          severity: "high",
          category: "学生档案缺失",
          description: "学生账号尚未创建个人档案",
          count: data.studentsNoProfile,
        },
        {
          severity: "medium",
          category: "教学班无教师",
          description: "教学班未分配任课教师",
          count: data.sectionsNoInstructor.length,
          detail: data.sectionsNoInstructor.map((s) => `${s.sectionCode} — ${s.course.code} ${s.course.title}`),
        },
        {
          severity: "medium",
          category: "教学班无上课时间",
          description: "教学班未设置上课时间",
          count: data.sectionsNoMeetings.length,
          detail: data.sectionsNoMeetings.map((s) => `${s.sectionCode} — ${s.course.code} ${s.course.title}`),
        },
        {
          severity: "low",
          category: "课程无开班",
          description: "课程未创建任何教学班",
          count: data.coursesNoSections.length,
          detail: data.coursesNoSections.map((c) => `${c.code} — ${c.title}`),
        },
      ]
    : [];

  const totalIssues = issues.reduce((s, i) => s + i.count, 0);
  const highCount = issues.filter((i) => i.severity === "high").reduce((s, i) => s + i.count, 0);
  const cleanIssues = issues.filter((i) => i.count === 0).length;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">数据治理</p>
        <h1 className="campus-title">数据质量检查</h1>
        <p className="campus-subtitle">自动扫描常见数据完整性问题，辅助管理员排查与修复</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">问题总数</p>
          <p className={`campus-kpi-value ${totalIssues > 0 ? "text-red-600" : "text-emerald-600"}`}>{loading ? "—" : totalIssues}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">高优先级</p>
          <p className={`campus-kpi-value ${highCount > 0 ? "text-red-600" : "text-emerald-600"}`}>{loading ? "—" : highCount}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已通过检查项</p>
          <p className="campus-kpi-value text-emerald-600">{loading ? "—" : `${cleanIssues} / ${issues.length}`}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">检查中…</div>
      ) : totalIssues === 0 ? (
        <div className="campus-card p-10 text-center">
          <p className="text-2xl">✅</p>
          <p className="mt-2 text-sm font-semibold text-emerald-700">数据质量良好，未发现问题。</p>
        </div>
      ) : (
        <section className="space-y-2">
          {issues.map((issue) => {
            const style = severityStyle(issue.severity);
            const open = expanded.has(issue.category);
            return (
              <div key={issue.category} className="campus-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => issue.detail ? toggle(issue.category) : undefined}
                  className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left ${issue.detail ? "hover:bg-slate-50" : "cursor-default"}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`size-2.5 shrink-0 rounded-full ${style.dot}`} />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{issue.category}</p>
                      <p className="text-xs text-slate-500">{issue.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${style.badge}`}>
                      {style.label}
                    </span>
                    <span className={`text-base font-bold font-mono ${issue.count > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {issue.count}
                    </span>
                    {issue.detail ? (
                      <span className="text-slate-400 text-sm">{open ? "▲" : "▼"}</span>
                    ) : (
                      <span className="size-4" />
                    )}
                  </div>
                </button>

                {open && issue.detail && issue.detail.length > 0 ? (
                  <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
                    <ul className="space-y-1">
                      {issue.detail.map((d, i) => (
                        <li key={i} className="text-xs text-slate-600 font-mono">{d}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      )}

      <p className="text-xs text-slate-400 text-right">每次访问页面自动重新扫描，最多显示每类前 20 条。</p>
    </div>
  );
}
