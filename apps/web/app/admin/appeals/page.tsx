"use client";

import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

type GradeAppeal = {
  id: string;
  enrollmentId: string;
  contestedGrade: string;
  requestedGrade: string | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  student: {
    id: string;
    email: string;
    studentProfile: { legalName: string } | null;
  };
  enrollment: {
    id: string;
    section: {
      sectionCode: string;
      course: { code: string; title: string };
      term: { name: string };
    };
  };
  reviewedBy: { id: string; email: string } | null;
};

const STATUS_CHIP: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700"
};

const GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"];

export default function AdminAppealsPage() {
  const [appeals, setAppeals] = useState<GradeAppeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState({
    decision: "APPROVED" as "APPROVED" | "REJECTED",
    adminNote: "",
    newGrade: ""
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const data = await apiFetch<GradeAppeal[]>(`/admin/grade-appeals?status=${status}`);
      setAppeals(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(statusFilter);
  }, [load, statusFilter]);

  async function handleReview(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewingId) return;
    setSubmitting(true);
    try {
      await apiFetch(`/admin/grade-appeals/${reviewingId}/review`, {
        method: "PATCH",
        body: JSON.stringify({
          decision: reviewForm.decision,
          adminNote: reviewForm.adminNote,
          newGrade: reviewForm.decision === "APPROVED" ? reviewForm.newGrade || undefined : undefined
        })
      });
      setReviewingId(null);
      setReviewForm({ decision: "APPROVED", adminNote: "", newGrade: "" });
      await load(statusFilter);
    } finally {
      setSubmitting(false);
    }
  }

  const pending = appeals.filter((a) => a.status === "PENDING").length;
  const approved = appeals.filter((a) => a.status === "APPROVED").length;
  const rejected = appeals.filter((a) => a.status === "REJECTED").length;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">行政管理</p>
        <h1 className="campus-title">成绩申诉管理</h1>
        <p className="campus-subtitle">审核学生提交的成绩申诉，批准或拒绝并更新最终成绩。</p>
      </section>

      <div className="grid grid-cols-3 gap-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">待审核</p>
          <p className="campus-kpi-value text-amber-600">{pending}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已批准</p>
          <p className="campus-kpi-value text-emerald-600">{approved}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已拒绝</p>
          <p className="campus-kpi-value text-red-600">{rejected}</p>
        </div>
      </div>

      <div className="campus-toolbar">
        <div className="flex gap-2">
          {["PENDING", "APPROVED", "REJECTED"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${statusFilter === s ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              {s === "PENDING" ? "待审核" : s === "APPROVED" ? "已批准" : "已拒绝"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-2xl">⏳</p>
          <p className="mt-2 text-sm text-slate-500">加载中…</p>
        </div>
      ) : appeals.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-3xl">✅</p>
          <p className="mt-2 text-sm font-medium text-slate-600">无申诉记录</p>
        </div>
      ) : (
        <section className="space-y-4">
          {appeals.map((a) => (
            <article key={a.id} className="campus-card p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {a.enrollment.section.course.code}
                    </span>
                    <span className="text-xs text-slate-500">{a.enrollment.section.term.name}</span>
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CHIP[a.status]}`}>
                      {({"PENDING":"待审","APPROVED":"已批准","REJECTED":"已拒绝"} as Record<string,string>)[a.status] ?? a.status}
                    </span>
                  </div>
                  <p className="mt-1 font-semibold text-slate-900">{a.enrollment.section.course.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    学生: {a.student.studentProfile?.legalName ?? a.student.email}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    申诉成绩: <span className="font-bold text-red-600">{a.contestedGrade}</span>
                    {a.requestedGrade && (
                      <> → 期望: <span className="font-bold text-emerald-600">{a.requestedGrade}</span></>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    提交于 {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {a.status === "PENDING" && (
                  <button
                    onClick={() => {
                      setReviewingId(reviewingId === a.id ? null : a.id);
                      setReviewForm({ decision: "APPROVED", adminNote: "", newGrade: a.requestedGrade ?? "" });
                    }}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
                  >
                    审核
                  </button>
                )}
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-700">
                <p className="font-medium text-slate-500 text-xs mb-1">申诉理由</p>
                <p>{a.reason}</p>
              </div>

              {a.adminNote && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${a.status === "APPROVED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
                  <p className="font-medium text-xs mb-1">管理员回复</p>
                  <p>{a.adminNote}</p>
                  {a.reviewedBy && (
                    <p className="mt-1 text-xs opacity-70">by {a.reviewedBy.email}</p>
                  )}
                </div>
              )}

              {reviewingId === a.id && (
                <form onSubmit={handleReview} className="border-t border-slate-100 pt-4 space-y-3">
                  <h3 className="text-sm font-semibold text-slate-800">审核决定</h3>
                  <div className="flex gap-3">
                    {(["APPROVED", "REJECTED"] as const).map((d) => (
                      <label key={d} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="decision"
                          value={d}
                          checked={reviewForm.decision === d}
                          onChange={() => setReviewForm((f) => ({ ...f, decision: d }))}
                        />
                        <span className={`text-sm font-medium ${d === "APPROVED" ? "text-emerald-700" : "text-red-700"}`}>
                          {d === "APPROVED" ? "✔ 批准" : "✘ 拒绝"}
                        </span>
                      </label>
                    ))}
                  </div>

                  {reviewForm.decision === "APPROVED" && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        更新成绩 <span className="text-slate-400 font-normal">(可选，留空则保持原成绩)</span>
                      </label>
                      <select
                        className="campus-select w-40"
                        value={reviewForm.newGrade}
                        onChange={(e) => setReviewForm((f) => ({ ...f, newGrade: e.target.value }))}
                      >
                        <option value="">— 不修改 —</option>
                        {GRADES.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      管理员备注 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      required
                      className="campus-input w-full min-h-[80px] resize-y"
                      value={reviewForm.adminNote}
                      onChange={(e) => setReviewForm((f) => ({ ...f, adminNote: e.target.value }))}
                      placeholder="请说明审核结论…"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setReviewingId(null)}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${reviewForm.decision === "APPROVED" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
                    >
                      {submitting ? "提交中…" : reviewForm.decision === "APPROVED" ? "批准申诉" : "拒绝申诉"}
                    </button>
                  </div>
                </form>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
