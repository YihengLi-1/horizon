"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

type AdvisingPayload = {
  student: {
    id: string;
    email: string;
    studentId?: string | null;
    studentProfile?: {
      legalName?: string;
      programMajor?: string | null;
      academicStatus?: string | null;
      enrollmentStatus?: string | null;
    } | null;
    enrollments: Array<{
      id: string;
      status: string;
      finalGrade?: string | null;
      section: {
        sectionCode: string;
        course: { code: string; title: string };
        term: { name: string };
      };
    }>;
  };
  notes: Array<{
    id: string;
    body: string;
    createdAt: string;
  }>;
};

export default function AdvisorNotesClient({ studentId }: { studentId: string }) {
  const [payload, setPayload] = useState<AdvisingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<AdvisingPayload>(`/advising/advisees/${studentId}`);
      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "学生概况加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [studentId]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/advising/advisees/${studentId}/notes`, {
        method: "POST",
        body: JSON.stringify({ body })
      });
      setBody("");
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "备注保存失败");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">指导顾问</p>
        <h1 className="campus-title">
          {payload?.student.studentProfile?.legalName ?? "学生概况"}
        </h1>
        <p className="campus-subtitle">
          {payload
            ? `${payload.student.studentId ?? "无学号"} · ${payload.student.studentProfile?.programMajor ?? "未申报"}`
            : "加载学生信息中"}
        </p>
      </section>

      {loading ? <section className="campus-card p-8 text-center text-sm text-slate-400">加载学生信息…</section> : null}
      {!loading && error ? <section className="campus-card p-6 text-sm text-red-600">{error}</section> : null}

      {!loading && payload ? (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <div className="campus-kpi">
              <p className="campus-kpi-label">学生账号</p>
              <p className="mt-1 font-semibold text-slate-900">{payload.student.email}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">学业状态</p>
              <p className="mt-1 font-semibold text-slate-900">
                {({"GOOD_STANDING":"学业正常","ACADEMIC_PROBATION":"学业警告","ACADEMIC_SUSPENSION":"学业停学","Active":"活跃","Inactive":"未活跃","Suspended":"已停学"} as Record<string,string>)[payload.student.studentProfile?.academicStatus ?? ""] ?? payload.student.studentProfile?.academicStatus ?? "未知"}
              </p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">注册记录</p>
              <p className="mt-1 font-semibold text-slate-900">{payload.student.enrollments.length}</p>
            </div>
          </section>

          <section className="campus-card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">当前学业记录</h2>
              <p className="mt-1 text-xs text-slate-500">当前及已完课程注册记录，仅对指定顾问可见。</p>
            </div>
            <div className="space-y-2">
              {payload.student.enrollments.length === 0 ? (
                <p className="text-sm text-slate-400">暂无注册记录。</p>
              ) : (
                payload.student.enrollments.map((enrollment) => (
                  <div key={enrollment.id} className="rounded-lg border border-slate-200 px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-900">
                        {enrollment.section.course.code} §{enrollment.section.sectionCode}
                      </p>
                      <span className="campus-chip text-xs">{({"ENROLLED":"在读","COMPLETED":"已完成","DROPPED":"已退课","WAITLISTED":"候补","PENDING_APPROVAL":"待审批"} as Record<string,string>)[enrollment.status] ?? enrollment.status}</span>
                    </div>
                    <p className="mt-1 text-slate-600">{enrollment.section.course.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {enrollment.section.term.name}
                      {enrollment.finalGrade ? ` · 最终成绩 ${enrollment.finalGrade}` : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="campus-card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">顾问备注</h2>
              <p className="mt-1 text-xs text-slate-500">针对您负责学生的私密指导备注。</p>
            </div>
            <form onSubmit={onSubmit} className="space-y-3">
              <textarea
                className="campus-input min-h-28"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="记录指导备注、跟进事项或学业关注点。"
              />
              <button type="submit" disabled={saving || !body.trim()} className="campus-btn-primary text-sm">
                {saving ? "保存中…" : "添加顾问备注"}
              </button>
            </form>
            <div className="space-y-3">
              {payload.notes.length === 0 ? (
                <p className="text-sm text-slate-400">暂无顾问备注。</p>
              ) : (
                payload.notes.map((note) => (
                  <article key={note.id} className="rounded-lg border border-slate-200 px-3 py-3">
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{note.body}</p>
                    <p className="mt-2 text-xs text-slate-400">{new Date(note.createdAt).toLocaleString("zh-CN")}</p>
                  </article>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
