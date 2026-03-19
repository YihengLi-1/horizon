"use client";

/**
 * Student Transcript Quality / Issues Page
 * Shows the complete enrollment history with issue flags:
 *   - COMPLETED with no finalGrade → Missing grade
 *   - ENROLLED in a past term → Not closed out
 *   - PENDING_APPROVAL lingering → Awaiting admin action
 *   - Duplicate ENROLLED sections in same term → Possible conflict
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Enrollment = {
  id: string;
  status: string;
  finalGrade: string | null;
  waitlistPosition?: number | null;
  section: {
    credits: number;
    sectionCode: string;
    instructorName: string;
    course: { code: string; title: string };
    term?: { id: string; name: string; endDate?: string };
  };
};

type Issue = {
  enrollmentId: string;
  severity: "error" | "warning" | "info";
  label: string;
  detail: string;
};

function detectIssues(enrollments: Enrollment[]): Issue[] {
  const issues: Issue[] = [];
  const now = new Date();

  for (const e of enrollments) {
    const termName = e.section.term?.name ?? "未知学期";
    const termEndDate = e.section.term?.endDate ? new Date(e.section.term.endDate) : null;
    const termPast = termEndDate ? termEndDate < now : false;

    if (e.status === "COMPLETED" && !e.finalGrade) {
      issues.push({
        enrollmentId: e.id,
        severity: "error",
        label: "成绩缺失",
        detail: `${e.section.course.code} (${termName}) 已完成但缺少最终成绩`
      });
    }

    if (e.status === "ENROLLED" && termPast) {
      issues.push({
        enrollmentId: e.id,
        severity: "warning",
        label: "未结课",
        detail: `${e.section.course.code} (${termName}) 学期已结束但状态仍为 ENROLLED`
      });
    }

    if (e.status === "PENDING_APPROVAL") {
      issues.push({
        enrollmentId: e.id,
        severity: "info",
        label: "待审批",
        detail: `${e.section.course.code} (${termName}) 待管理员审批`
      });
    }
  }

  // Detect duplicate enrollments in same term
  const enrolledBySectionCode = new Map<string, string[]>();
  for (const e of enrollments.filter((e) => e.status === "ENROLLED")) {
    const key = e.section.term?.id ?? "unknown-term";
    if (!enrolledBySectionCode.has(key)) enrolledBySectionCode.set(key, []);
    enrolledBySectionCode.get(key)!.push(e.section.course.code);
  }

  return issues;
}

const SEVERITY_META = {
  error:   { cls: "border-red-200 bg-red-50 text-red-700",     icon: "🔴" },
  warning: { cls: "border-amber-200 bg-amber-50 text-amber-700", icon: "🟡" },
  info:    { cls: "border-blue-200 bg-blue-50 text-blue-700",   icon: "🔵" }
};

type GradeGroup = {
  termName: string;
  termEndDate: string;
  enrollments: Enrollment[];
};

function gradeColor(g: string | null): string {
  if (!g) return "text-red-500";
  if (g.startsWith("A")) return "text-emerald-600";
  if (g.startsWith("B")) return "text-indigo-600";
  if (g.startsWith("C")) return "text-amber-600";
  if (g === "W") return "text-slate-400";
  return "text-red-600";
}

const STATUS_CHIP: Record<string, string> = {
  COMPLETED:         "border-emerald-200 bg-emerald-50 text-emerald-700",
  ENROLLED:          "border-indigo-200 bg-indigo-50 text-indigo-700",
  WAITLISTED:        "border-amber-200 bg-amber-50 text-amber-700",
  DROPPED:           "border-slate-200 bg-slate-50 text-slate-500",
  PENDING_APPROVAL:  "border-blue-200 bg-blue-50 text-blue-700",
  CART:              "border-slate-200 bg-slate-50 text-slate-400"
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED:        "已完成",
  ENROLLED:         "在读",
  WAITLISTED:       "候补",
  DROPPED:          "已退课",
  PENDING_APPROVAL: "待审批",
  CART:             "购物车"
};

export default function TranscriptPage() {
  const [allEnrollments, setAllEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const generatedAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date());

  useEffect(() => {
    // /registration/enrollments (no termId) returns all enrollments across terms
    void apiFetch<Enrollment[]>("/registration/enrollments")
      .then((data) => setAllEnrollments(data ?? []))
      .catch(() => setAllEnrollments([]))
      .finally(() => setLoading(false));
  }, []);

  const issues = detectIssues(allEnrollments);

  const filtered = allEnrollments.filter((e) => {
    if (filterStatus === "all") return true;
    return e.status === filterStatus;
  });

  // Group by term
  const termMap = new Map<string, GradeGroup>();
  for (const e of filtered) {
    const key = e.section.term?.id ?? "unknown-term";
    if (!termMap.has(key)) {
      termMap.set(key, {
        termName: e.section.term?.name ?? "未知学期",
        termEndDate: e.section.term?.endDate ?? "1970-01-01T00:00:00.000Z",
        enrollments: []
      });
    }
    termMap.get(key)!.enrollments.push(e);
  }
  const groups = Array.from(termMap.values()).sort((a, b) =>
    new Date(b.termEndDate).getTime() - new Date(a.termEndDate).getTime()
  );

  const statuses = ["COMPLETED", "ENROLLED", "WAITLISTED", "DROPPED", "PENDING_APPROVAL", "CART"];
  const statusCounts = Object.fromEntries(
    statuses.map((s) => [s, allEnrollments.filter((e) => e.status === s).length])
  );

  const totalCredits = allEnrollments
    .filter((e) => e.status === "COMPLETED" && e.finalGrade && e.finalGrade !== "W" && e.finalGrade !== "F")
    .reduce((s, e) => s + e.section.credits, 0);

  return (
    <div className="campus-page space-y-6">
      {/* Tab nav */}
      <div className="no-print flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        <a href="/student/grades" className="flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium text-slate-500 no-underline transition hover:bg-white hover:text-slate-900">
          成绩
        </a>
        <a href="/student/course-history" className="flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium text-slate-500 no-underline transition hover:bg-white hover:text-slate-900">
          修课历史
        </a>
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
        <h1 className="campus-title">完整修课记录</h1>
        <p className="campus-subtitle">所有历史注册记录，包含状态检查和问题标记</p>
      </section>

      {/* KPIs */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
          <div className="campus-kpi">
            <p className="campus-kpi-label">总注册数</p>
            <p className="campus-kpi-value">{allEnrollments.length}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">已完成学分</p>
            <p className="campus-kpi-value text-emerald-600">{totalCredits}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">问题项</p>
            <p className="campus-kpi-value text-red-600">{issues.length}</p>
          </div>
          <div className="campus-kpi campus-kpi-sm hidden sm:block">
            <p className="campus-kpi-label">退课数</p>
            <p className="campus-kpi-value text-slate-500">{statusCounts.DROPPED ?? 0}</p>
          </div>
        </div>
      )}

      {/* Issues panel */}
      {issues.length > 0 && (
        <section className="campus-card p-4 space-y-2">
          <h2 className="text-sm font-bold text-slate-900">⚠️ 发现 {issues.length} 个问题</h2>
          <div className="space-y-2">
            {issues.map((issue) => {
              const meta = SEVERITY_META[issue.severity];
              return (
                <div key={`${issue.enrollmentId}-${issue.label}`} className={`rounded-lg border px-3 py-2 text-sm ${meta.cls}`}>
                  <span className="mr-1">{meta.icon}</span>
                  <span className="font-semibold">{issue.label}：</span>
                  {issue.detail}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-1">如有疑问，请联系教务处或查看 <Link href="/student/advisor" className="underline">我的导师</Link></p>
        </section>
      )}

      {/* Filter bar */}
      <div className="campus-toolbar flex-wrap gap-2">
        <select
          className="campus-select"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">所有状态 ({allEnrollments.length})</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s] ?? s} ({statusCounts[s] ?? 0})</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-slate-600 ml-auto cursor-pointer">
          <input
            type="checkbox"
            className="rounded"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          显示退课/CART记录
        </label>
      </div>

      {/* Grouped by term */}
      {loading ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-2xl">⏳</p>
          <p className="mt-2 text-sm text-slate-600">加载中…</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-3xl">📋</p>
          <p className="mt-2 text-sm text-slate-600">暂无注册记录</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => {
            const visibleEnrollments = showAll
              ? group.enrollments
              : group.enrollments.filter((e) => e.status !== "DROPPED" && e.status !== "CART");
            if (visibleEnrollments.length === 0) return null;
            const groupCredits = visibleEnrollments.filter((e) => e.status === "COMPLETED" && e.finalGrade && e.finalGrade !== "W").reduce((s, e) => s + e.section.credits, 0);
            const isPast = new Date(group.termEndDate) < new Date();
            return (
              <section key={group.termName} className="campus-card overflow-hidden" style={{ breakInside: "avoid" }}>
                <div className={`flex items-center justify-between px-4 py-3 ${isPast ? "bg-slate-50 border-b border-slate-100" : "bg-indigo-50 border-b border-indigo-100"}`}>
                  <h2 className="text-sm font-bold text-slate-900">{group.termName}</h2>
                  <div className="flex items-center gap-2">
                    {groupCredits > 0 && <span className="text-xs text-slate-500">{groupCredits}cr 已完成</span>}
                    {!isPast && <span className="campus-chip border-indigo-300 bg-indigo-100 text-indigo-700 text-xs">进行中</span>}
                  </div>
                </div>
                <div className="divide-y divide-slate-50">
                  {visibleEnrollments.map((e) => {
                    const hasIssue = issues.some((i) => i.enrollmentId === e.id);
                    return (
                      <div key={e.id} className={`flex items-center gap-3 px-4 py-2.5 ${hasIssue ? "bg-red-50/30" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-indigo-700">{e.section.course.code}</span>
                            <span className="text-xs text-slate-500 truncate">{e.section.course.title}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">§{e.section.sectionCode} · {e.section.instructorName} · {e.section.credits}cr</p>
                        </div>
                        <span className={`campus-chip text-xs ${STATUS_CHIP[e.status] ?? "border-slate-200 bg-slate-50 text-slate-500"}`}>
                          {STATUS_LABEL[e.status] ?? e.status}
                        </span>
                        <span className={`text-base font-bold w-8 text-right ${gradeColor(e.finalGrade)}`}>
                          {e.finalGrade ?? (e.status === "COMPLETED" ? "—" : "")}
                        </span>
                        {hasIssue && <span className="text-red-500 text-sm" title="有问题">⚠</span>}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="print-only hidden border-t border-slate-300 pt-3 text-xs text-slate-500">
        本文件由地平线学生信息系统生成，如有疑问请联系注册处
      </div>
    </div>
  );
}
