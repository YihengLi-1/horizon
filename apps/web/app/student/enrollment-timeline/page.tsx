"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type MeetingTime = { weekday: number; startMinutes: number; endMinutes: number };
type ReceiptItem = {
  enrollmentId: string;
  courseCode: string;
  title: string;
  credits: number;
  sectionCode: string;
  instructorName: string;
  meetingTimes: MeetingTime[];
};

type ReceiptData = {
  term: { id: string; name: string; startDate: string; endDate: string } | null;
  items: ReceiptItem[];
  totalCredits: number;
};

type CourseHistoryItem = {
  termName: string;
  termId: string;
  enrollments: Array<{
    enrollmentId: string;
    courseCode: string;
    title: string;
    credits: number;
    finalGrade: string | null;
    status: string;
    termName: string;
  }>;
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "已完成",
  ENROLLED: "在读",
  DROPPED: "已退课",
  WAITLISTED: "候补",
  PENDING_APPROVAL: "待审批",
};

const GRADE_COLORS: Record<string, string> = {
  "A+": "text-emerald-700", "A": "text-emerald-700", "A-": "text-emerald-600",
  "B+": "text-blue-700", "B": "text-blue-600", "B-": "text-blue-500",
  "C+": "text-amber-700", "C": "text-amber-600", "C-": "text-amber-500",
  "D+": "text-orange-600", "D": "text-orange-500", "D-": "text-orange-400",
  "F": "text-red-600", "W": "text-slate-400",
};

const GRADE_POINTS: Record<string, number> = {
  "A+": 4.0, "A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7,
  "C+": 2.3, "C": 2.0, "C-": 1.7, "D+": 1.3, "D": 1.0, "D-": 0.7, "F": 0.0,
};

export default function EnrollmentTimelinePage() {
  const [history, setHistory] = useState<CourseHistoryItem[]>([]);
  const [currentReceipt, setCurrentReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    Promise.all([
      apiFetch<CourseHistoryItem[]>("/students/course-history"),
      apiFetch<ReceiptData>("/students/enrollment-receipt"),
    ])
      .then(([hist, receipt]) => {
        setHistory(hist ?? []);
        setCurrentReceipt(receipt ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const filteredHistory = useMemo(() => {
    if (statusFilter === "all") return history;
    return history.map((t) => ({
      ...t,
      enrollments: t.enrollments.filter((e) => e.status === statusFilter),
    })).filter((t) => t.enrollments.length > 0);
  }, [history, statusFilter]);

  const totalCredits = useMemo(() => {
    return history.flatMap((t) => t.enrollments)
      .filter((e) => e.status === "COMPLETED")
      .reduce((s, e) => s + e.credits, 0);
  }, [history]);

  const cumulativeGpa = useMemo(() => {
    let wp = 0, cr = 0;
    for (const t of history) {
      for (const e of t.enrollments) {
        if (e.status !== "COMPLETED" || !e.finalGrade) continue;
        const pts = GRADE_POINTS[e.finalGrade];
        if (pts !== undefined) { wp += pts * e.credits; cr += e.credits; }
      }
    }
    return cr > 0 ? wp / cr : null;
  }, [history]);

  function toggle(termId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(termId)) next.delete(termId);
      else next.add(termId);
      return next;
    });
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业记录</p>
        <h1 className="campus-title">注册时间线</h1>
        <p className="campus-subtitle">按学期展示完整的课程注册历史与学业轨迹</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">历史学期数</p>
          <p className="campus-kpi-value">{loading ? "—" : history.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已完成学分</p>
          <p className="campus-kpi-value text-emerald-600">{loading ? "—" : totalCredits}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">累计 GPA</p>
          <p className={`campus-kpi-value ${(cumulativeGpa ?? 0) >= 3.5 ? "text-emerald-600" : (cumulativeGpa ?? 0) >= 2.0 ? "text-slate-800" : "text-red-600"}`}>
            {loading ? "—" : cumulativeGpa != null ? cumulativeGpa.toFixed(3) : "—"}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">当前学期</p>
          <p className="campus-kpi-value text-slate-600 text-sm">{loading ? "—" : currentReceipt?.term?.name ?? "—"}</p>
        </div>
      </section>

      <div className="campus-toolbar">
        <select className="campus-select w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">全部状态</option>
          <option value="COMPLETED">已完成</option>
          <option value="ENROLLED">在读</option>
          <option value="DROPPED">已退课</option>
          <option value="WAITLISTED">候补</option>
        </select>
        <button type="button" onClick={() => setExpanded(new Set(history.map((t) => t.termId)))} className="campus-btn-ghost text-xs">全部展开</button>
        <button type="button" onClick={() => setExpanded(new Set())} className="campus-btn-ghost text-xs">全部收起</button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : filteredHistory.length === 0 ? (
        <div className="campus-card p-10 text-center text-slate-400">暂无注册记录</div>
      ) : (
        <div className="space-y-3">
          {filteredHistory.map((term) => {
            const open = expanded.has(term.termId);
            const completed = term.enrollments.filter((e) => e.status === "COMPLETED");
            const termCredits = completed.reduce((s, e) => s + e.credits, 0);
            let termWp = 0, termCr = 0;
            for (const e of completed) {
              if (!e.finalGrade) continue;
              const pts = GRADE_POINTS[e.finalGrade];
              if (pts !== undefined) { termWp += pts * e.credits; termCr += e.credits; }
            }
            const termGpa = termCr > 0 ? termWp / termCr : null;
            return (
              <div key={term.termId} className="campus-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(term.termId)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900">{term.termName}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{term.enrollments.length} 门课程</p>
                  </div>
                  <div className="flex items-center gap-5 shrink-0 text-sm">
                    <div className="text-right">
                      <p className="font-bold text-slate-700">{termCredits} 学分</p>
                      {termGpa != null ? (
                        <p className={`text-xs font-semibold ${termGpa >= 3.5 ? "text-emerald-600" : termGpa >= 2.0 ? "text-slate-500" : "text-red-500"}`}>
                          GPA {termGpa.toFixed(2)}
                        </p>
                      ) : null}
                    </div>
                    <span className="text-slate-400">{open ? "▲" : "▼"}</span>
                  </div>
                </button>

                {open ? (
                  <div className="border-t border-slate-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs font-semibold text-slate-400">
                          <th className="px-5 py-2 text-left">课程</th>
                          <th className="px-5 py-2 text-right">学分</th>
                          <th className="px-5 py-2 text-center">成绩</th>
                          <th className="px-5 py-2 text-center">状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {term.enrollments.map((e) => (
                          <tr key={e.enrollmentId} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-5 py-2.5">
                              <p className="font-semibold text-slate-800">{e.courseCode}</p>
                              <p className="text-xs text-slate-500 truncate max-w-[180px]">{e.title}</p>
                            </td>
                            <td className="px-5 py-2.5 text-right font-mono text-slate-600">{e.credits}</td>
                            <td className="px-5 py-2.5 text-center">
                              {e.finalGrade ? (
                                <span className={`font-bold ${GRADE_COLORS[e.finalGrade] ?? "text-slate-700"}`}>{e.finalGrade}</span>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-5 py-2.5 text-center">
                              <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                                e.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" :
                                e.status === "ENROLLED" ? "bg-blue-100 text-blue-700" :
                                e.status === "DROPPED" ? "bg-slate-100 text-slate-500" :
                                "bg-amber-100 text-amber-700"
                              }`}>
                                {STATUS_LABELS[e.status] ?? e.status}
                              </span>
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
