"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/confirm-dialog";

type StudentDetail = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  studentId: string | null;
  studentProfile: {
    legalName?: string | null;
    programMajor?: string | null;
    academicStatus?: string | null;
    enrollmentStatus?: string | null;
    dob?: string | null;
    address?: string | null;
    emergencyContact?: string | null;
  } | null;
  enrollments: Array<{
    id: string;
    status: string;
    finalGrade: string | null;
    section: {
      sectionCode: string;
      credits: number;
      course: { code: string; title: string };
      term: { name: string };
    };
  }>;
};

type StudentNote = {
  id: string;
  content: string;
  flag: string | null;
  createdAt: string;
  admin: { email: string };
};

const GRADE_POINTS: Record<string, number> = {
  "A+": 4.0, A: 4.0, "A-": 3.7,
  "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7,
  "D+": 1.3, D: 1.0, "D-": 0.7, F: 0.0,
};

function calcGpa(enrollments: StudentDetail["enrollments"]) {
  const completed = enrollments.filter((e) => e.status === "COMPLETED" && e.finalGrade && GRADE_POINTS[e.finalGrade] !== undefined);
  if (completed.length === 0) return null;
  let pts = 0, credits = 0;
  for (const e of completed) {
    const gp = GRADE_POINTS[e.finalGrade!];
    pts += gp * e.section.credits;
    credits += e.section.credits;
  }
  return credits > 0 ? (pts / credits).toFixed(2) : null;
}

const STATUS_LABEL: Record<string, string> = {
  ENROLLED: "已注册", COMPLETED: "已完成", DROPPED: "已退课",
  WAITLISTED: "候补", PENDING_APPROVAL: "待审批",
};

const ACADEMIC_STATUS_LABEL: Record<string, string> = {
  GOOD_STANDING: "学业良好", ACADEMIC_PROBATION: "学业观察", ACADEMIC_SUSPENSION: "学业暂停",
  Active: "在读", Inactive: "未活跃", Suspended: "已停学", Probation: "察看期",
};

const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "在籍", INACTIVE: "未在籍", GRADUATED: "已毕业",
  WITHDRAWN: "已退学", SUSPENDED: "停学",
  Active: "在籍", Inactive: "未在籍", Graduated: "已毕业",
  Withdrawn: "已退学", Imported: "已导入",
};

const FLAG_LABEL: Record<string, string> = {
  URGENT: "紧急", FOLLOW_UP: "跟进", POSITIVE: "正面",
};

export default function AdminStudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [notes, setNotes] = useState<StudentNote[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteFlag, setNoteFlag] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const toast = useToast();

  const loadStudent = async () => {
    setLoading(true);
    setError("");
    try {
      const [s, n, t] = await Promise.all([
        apiFetch<StudentDetail>(`/admin/students/${id}`),
        apiFetch<StudentNote[]>(`/admin/students/${id}/notes`),
        apiFetch<{ studentId: string; tags: string[] }>(`/admin/students/${id}/tags`),
      ]);
      setStudent(s);
      setNotes(n ?? []);
      setTags(t.tags ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "学生信息加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStudent();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!noteBody.trim()) return;
    setSavingNote(true);
    try {
      await apiFetch(`/admin/students/${id}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: noteBody.trim(), flag: noteFlag || undefined }),
      });
      setNoteBody("");
      setNoteFlag("");
      toast("备注已添加", "success");
      const updated = await apiFetch<StudentNote[]>(`/admin/students/${id}/notes`);
      setNotes(updated ?? []);
    } catch (err) {
      if (err instanceof ApiError) toast(err.message, "error");
      else toast("备注保存失败", "error");
    } finally {
      setSavingNote(false);
    }
  };

  const deleteNote = (noteId: string) => {
    setConfirmState({
      title: "删除备注",
      message: "确认删除该备注？此操作不可撤销。",
      onConfirm: async () => {
        setConfirmState(null);
        setDeletingNoteId(noteId);
        try {
          await apiFetch(`/admin/students/${id}/notes/${noteId}`, { method: "DELETE" });
          setNotes((prev) => prev.filter((n) => n.id !== noteId));
          toast("备注已删除", "success");
        } catch {
          toast("删除失败", "error");
        } finally {
          setDeletingNoteId(null);
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="campus-page space-y-6">
        <section className="campus-hero animate-pulse">
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="mt-2 h-8 w-64 rounded bg-slate-200" />
        </section>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="campus-page">
        <div className="campus-card p-8 text-center">
          <p className="text-sm font-semibold text-red-700">{error || "学生不存在"}</p>
          <Link href="/admin/students" className="mt-4 inline-block campus-btn-ghost text-xs">← 返回学生列表</Link>
        </div>
      </div>
    );
  }

  const profile = student.studentProfile;
  const gpa = calcGpa(student.enrollments);
  const completedCredits = student.enrollments
    .filter((e) => e.status === "COMPLETED")
    .reduce((sum, e) => sum + e.section.credits, 0);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">
          <Link href="/admin/students" className="hover:underline">学生管理</Link>
          {" / "}学生档案
        </p>
        <h1 className="campus-title">
          {profile?.legalName ?? student.email}
        </h1>
        <p className="campus-subtitle">{student.studentId ?? "无学号"} · {profile?.programMajor ?? "未申报专业"}</p>
      </section>

      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">累计 GPA</p>
          <p className="campus-kpi-value">{gpa ?? "—"}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已修学分</p>
          <p className="campus-kpi-value">{completedCredits}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">学业状态</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {profile?.academicStatus ? (ACADEMIC_STATUS_LABEL[profile.academicStatus] ?? profile.academicStatus) : "—"}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">注册状态</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {profile?.enrollmentStatus ? (ENROLLMENT_STATUS_LABEL[profile.enrollmentStatus] ?? profile.enrollmentStatus) : "—"}
          </p>
        </div>
      </section>

      {/* Tags */}
      {tags.length > 0 ? (
        <section className="campus-card p-4 flex flex-wrap gap-2 items-center">
          <span className="text-xs font-semibold text-slate-500">标签</span>
          {tags.map((tag) => (
            <span key={tag} className="campus-chip text-xs">{tag}</span>
          ))}
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Profile */}
        <section className="campus-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">个人信息</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {[
                ["邮箱", student.email],
                ["学号", student.studentId ?? "未分配"],
                ["专业", profile?.programMajor ?? "未申报"],
                ["出生日期", profile?.dob ? new Date(profile.dob).toLocaleDateString("zh-CN") : "—"],
                ["地址", profile?.address ?? "—"],
                ["紧急联系人", profile?.emergencyContact ?? "—"],
                ["注册时间", new Date(student.createdAt).toLocaleDateString("zh-CN")],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td className="py-2 text-xs text-slate-500 w-28">{label}</td>
                  <td className="py-2 text-slate-800">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Enrollments */}
        <section className="campus-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">选课记录（{student.enrollments.length} 条）</h2>
          {student.enrollments.length === 0 ? (
            <p className="text-sm text-slate-400">暂无选课记录。</p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-1">
              {student.enrollments.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">
                      {e.section.course.code} §{e.section.sectionCode}
                    </p>
                    <p className="text-slate-500 truncate">{e.section.term.name} · {e.section.credits} 学分</p>
                  </div>
                  <span className="campus-chip text-[11px]">{STATUS_LABEL[e.status] ?? e.status}</span>
                  {e.finalGrade ? (
                    <span className="font-mono text-slate-700">{e.finalGrade}</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Notes */}
      <section className="campus-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">管理员备注</h2>
        <form onSubmit={(e) => void addNote(e)} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <textarea
            className="campus-input min-h-16 sm:col-span-3"
            placeholder="添加管理员备注…"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
          />
          <select
            className="campus-select"
            value={noteFlag}
            onChange={(e) => setNoteFlag(e.target.value)}
          >
            <option value="">无标记</option>
            <option value="URGENT">紧急</option>
            <option value="FOLLOW_UP">跟进</option>
            <option value="POSITIVE">正面</option>
          </select>
          <button
            type="submit"
            disabled={savingNote || !noteBody.trim()}
            className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {savingNote ? "保存中…" : "添加"}
          </button>
        </form>
        {notes.length === 0 ? (
          <p className="text-sm text-slate-400">暂无备注。</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <article key={note.id} className="rounded-lg border border-slate-200 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{note.content}</p>
                    <p className="text-xs text-slate-400">
                      {note.admin.email} · {new Date(note.createdAt).toLocaleString("zh-CN")}
                      {note.flag ? (
                        <span className="ml-2 campus-chip text-[11px] border-amber-200 bg-amber-50 text-amber-700">{FLAG_LABEL[note.flag] ?? note.flag}</span>
                      ) : null}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteNote(note.id)}
                    disabled={deletingNoteId === note.id}
                    className="campus-chip cursor-pointer text-[11px] border-red-200 bg-red-50 text-red-700 shrink-0 disabled:opacity-60"
                  >
                    {deletingNoteId === note.id ? "删除中…" : "删除"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
