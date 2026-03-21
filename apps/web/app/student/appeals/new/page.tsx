"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";

type GradeItem = {
  id: string;
  finalGrade: string | null;
  section: {
    sectionCode: string;
    course: { code: string; title: string };
    term: { name: string };
  };
};

const GRADE_OPTIONS = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

export default function NewAppealPage() {
  const router = useRouter();
  const [grades, setGrades] = useState<GradeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [enrollmentId, setEnrollmentId] = useState("");
  const [contestedGrade, setContestedGrade] = useState("");
  const [requestedGrade, setRequestedGrade] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    void apiFetch<GradeItem[]>("/registration/grades")
      .then((data) => {
        const completed = (data ?? []).filter(
          (g) => g.finalGrade && g.finalGrade !== "W"
        );
        setGrades(completed);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "课程列表加载失败"))
      .finally(() => setLoading(false));
  }, []);

  // Auto-fill contested grade when enrollment is selected
  const handleEnrollmentChange = (id: string) => {
    setEnrollmentId(id);
    const found = grades.find((g) => g.id === id);
    if (found?.finalGrade) setContestedGrade(found.finalGrade);
    else setContestedGrade("");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!enrollmentId || !contestedGrade || !reason.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/students/appeals", {
        method: "POST",
        body: JSON.stringify({
          enrollmentId,
          contestedGrade,
          requestedGrade: requestedGrade || undefined,
          reason: reason.trim(),
        }),
      });
      router.push("/student/grades?appeal=submitted");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("申诉提交失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业记录</p>
        <h1 className="campus-title">提交成绩申诉</h1>
        <p className="campus-subtitle">
          如认为成绩存在录入错误，请填写以下信息。申诉须在学期结束后 30 天内提交，由教务处审核处理。
        </p>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : grades.length === 0 ? (
        <div className="campus-card p-10 text-center space-y-2">
          <p className="text-slate-600 font-semibold">暂无可申诉的课程</p>
          <p className="text-slate-400 text-sm">只有已完成并录入最终成绩的课程才能提交申诉。</p>
          <Link href="/student/grades" className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-50 mt-2">
            返回成绩页
          </Link>
        </div>
      ) : (
        <div className="campus-card p-6 max-w-xl space-y-5">
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">

            {/* Course select */}
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">申诉课程 *</span>
              <select
                className="campus-select w-full"
                value={enrollmentId}
                onChange={(e) => handleEnrollmentChange(e.target.value)}
                required
              >
                <option value="">请选择课程…</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.section.course.code} — {g.section.course.title}（{g.section.term.name}，当前成绩：{g.finalGrade}）
                  </option>
                ))}
              </select>
            </label>

            {/* Contested grade (auto-filled, read-only display) */}
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">当前成绩 *</span>
                <input
                  className="campus-input"
                  value={contestedGrade}
                  readOnly
                  placeholder="选择课程后自动填入"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">期望更正为（选填）</span>
                <select className="campus-select w-full" value={requestedGrade} onChange={(e) => setRequestedGrade(e.target.value)}>
                  <option value="">不指定</option>
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Reason */}
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">申诉理由 *（请具体说明）</span>
              <textarea
                className="campus-input min-h-32"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例：期末考试成绩已达 85 分，但录入成绩与实际不符，请教务处核实…"
                required
                minLength={20}
              />
              <p className="mt-1 text-[11px] text-slate-400">最少 20 字，越详细越有助于审核。</p>
            </label>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting || !enrollmentId || !contestedGrade || reason.trim().length < 20}
                className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "提交中…" : "提交申诉"}
              </button>
              <Link href="/student/grades" className="text-sm text-slate-500 hover:text-slate-700 no-underline">
                取消
              </Link>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
