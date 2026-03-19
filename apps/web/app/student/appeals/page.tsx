"use client";

import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

type AppealEnrollment = {
  id: string;
  finalGrade: string | null;
  section: {
    sectionCode: string;
    course: { code: string; title: string };
    term: { name: string };
  };
};

type GradeAppeal = {
  id: string;
  enrollmentId: string;
  contestedGrade: string;
  requestedGrade: string | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminNote: string | null;
  createdAt: string;
  enrollment: AppealEnrollment;
};

type GradeEnrollment = {
  id: string;
  finalGrade: string | null;
  status: string;
  section: {
    sectionCode: string;
    course: { code: string; title: string };
    term: { name: string };
  };
};

const STATUS_CHIP: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700"
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "待审核",
  APPROVED: "已批准",
  REJECTED: "已拒绝"
};

export default function GradeAppealsPage() {
  const [appeals, setAppeals] = useState<GradeAppeal[]>([]);
  const [grades, setGrades] = useState<GradeEnrollment[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    enrollmentId: "",
    contestedGrade: "",
    requestedGrade: "",
    reason: ""
  });
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      const [appealsData, gradesData] = await Promise.all([
        apiFetch<GradeAppeal[]>("/students/appeals"),
        apiFetch<GradeEnrollment[]>("/registration/grades")
      ]);
      setAppeals(appealsData);
      // Only enrollments with a final grade can be appealed
      setGrades(gradesData.filter((g) => g.finalGrade && g.status === "COMPLETED"));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.enrollmentId || !form.contestedGrade || !form.reason.trim()) {
      setFormError("请填写所有必填项");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const result = await apiFetch<GradeAppeal | { error: string }>("/students/appeals", {
        method: "POST",
        body: JSON.stringify({
          enrollmentId: form.enrollmentId,
          contestedGrade: form.contestedGrade,
          requestedGrade: form.requestedGrade || undefined,
          reason: form.reason
        })
      });
      if ("error" in result) {
        setFormError(result.error);
        return;
      }
      setShowForm(false);
      setForm({ enrollmentId: "", contestedGrade: "", requestedGrade: "", reason: "" });
      await load();
    } catch (err) {
      setFormError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const pending = appeals.filter((a) => a.status === "PENDING").length;
  const approved = appeals.filter((a) => a.status === "APPROVED").length;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业申诉</p>
        <h1 className="campus-title">成绩申诉</h1>
        <p className="campus-subtitle">如对期末成绩有异议，请提交申诉，管理员将在 5 个工作日内审核。</p>
      </section>

      {!loading && appeals.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="campus-kpi">
            <p className="campus-kpi-label">申诉总数</p>
            <p className="campus-kpi-value">{appeals.length}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">待审核</p>
            <p className="campus-kpi-value text-amber-600">{pending}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">已批准</p>
            <p className="campus-kpi-value text-emerald-600">{approved}</p>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          {showForm ? "✕ 取消" : "+ 提交新申诉"}
        </button>
      </div>

      {showForm && (
        <section className="campus-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">新申诉表单</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                选择课程班级 <span className="text-red-500">*</span>
              </label>
              <select
                className="campus-select w-full"
                value={form.enrollmentId}
                onChange={(e) => {
                  const enrollment = grades.find((g) => g.id === e.target.value);
                  setForm((f) => ({
                    ...f,
                    enrollmentId: e.target.value,
                    contestedGrade: enrollment?.finalGrade ?? ""
                  }));
                }}
              >
                <option value="">— 请选择 —</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.section.course.code} {g.section.course.title} ({g.section.term.name}) — 当前成绩: {g.finalGrade}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  被申诉成绩 <span className="text-red-500">*</span>
                </label>
                <input
                  className="campus-input w-full"
                  value={form.contestedGrade}
                  onChange={(e) => setForm((f) => ({ ...f, contestedGrade: e.target.value }))}
                  placeholder="例如: C+"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  期望成绩 <span className="text-slate-400 font-normal">(可选)</span>
                </label>
                <input
                  className="campus-input w-full"
                  value={form.requestedGrade}
                  onChange={(e) => setForm((f) => ({ ...f, requestedGrade: e.target.value }))}
                  placeholder="例如: B"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                申诉理由 <span className="text-red-500">*</span>
              </label>
              <textarea
                className="campus-input w-full min-h-[100px] resize-y"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="请详细说明申诉原因，附上相关证据或说明…"
              />
            </div>

            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{formError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? "提交中…" : "提交申诉"}
              </button>
            </div>
          </form>
        </section>
      )}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-2xl">⏳</p>
          <p className="mt-2 text-sm font-medium text-slate-600">加载中…</p>
        </div>
      ) : appeals.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-3xl">📋</p>
          <p className="mt-2 text-sm font-medium text-slate-600">暂无申诉记录</p>
          <p className="mt-1 text-xs text-slate-400">如对成绩有异议，点击「提交新申诉」开始申诉流程。</p>
        </div>
      ) : (
        <section className="space-y-4">
          {appeals.map((a) => (
            <article key={a.id} className="campus-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {a.enrollment.section.course.code}
                    </span>
                    <span className="text-xs text-slate-500">{a.enrollment.section.term.name}</span>
                  </div>
                  <p className="mt-1 font-semibold text-slate-900">{a.enrollment.section.course.title}</p>
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
                <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CHIP[a.status]}`}>
                  {STATUS_LABEL[a.status]}
                </span>
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setExpandedId((current) => (current === a.id ? null : a.id))}
                  className="text-sm font-medium text-indigo-700 transition hover:text-indigo-900"
                >
                  {expandedId === a.id ? "收起详情" : "查看详情"}
                </button>
              </div>

              {expandedId === a.id ? (
                <div className="mt-3 space-y-3">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <p className="mb-1 text-xs font-medium text-slate-500">申诉理由</p>
                    <p>{a.reason}</p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                    <p className="mb-1 text-xs font-medium text-slate-500">班级详情</p>
                    <p>
                      {a.enrollment.section.course.code} · {a.enrollment.section.course.title} · §{a.enrollment.section.sectionCode}
                    </p>
                  </div>

                  <div
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      a.adminNote
                        ? a.status === "APPROVED"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-red-200 bg-red-50 text-red-800"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    <p className="mb-1 text-xs font-medium">管理员回复</p>
                    <p>{a.adminNote || "管理员暂未回复，申诉仍在处理中。"}</p>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
