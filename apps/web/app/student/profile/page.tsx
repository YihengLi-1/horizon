"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import ProfileCompletenessCard from "@/components/profile-completeness-card";
import { useToast } from "@/components/Toast";
import { apiFetch } from "@/lib/api";

type ProfileResponse = {
  legalName: string;
  dob?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  programMajor?: string | null;
  enrollmentStatus?: string | null;
  academicStatus?: string | null;
  user: {
    email: string;
    studentId: string;
  };
};

type FormState = {
  legalName: string;
  programMajor: string;
  dob: string;
  address: string;
  emergencyContact: string;
};

type ProfileCompletenessResponse = {
  score: number;
  missing: string[];
  fields: Array<{
    name: string;
    label: string;
    filled: boolean;
  }>;
};

type TranscriptRow = {
  finalGrade?: string | null;
  section?: {
    credits?: number;
  };
};

type TranscriptTerm = {
  termId: string;
  termName: string;
  semesterGpa: number | null;
  cumulativeGpa: number | null;
  enrollments: TranscriptRow[];
};

type EnrollmentRow = {
  status: string;
  section?: {
    credits?: number;
  };
};

function Field({
  label,
  value,
  readOnly,
  type = "text",
  placeholder,
  onChange
}: {
  label: string;
  value: string;
  readOnly?: boolean;
  type?: string;
  placeholder?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      {readOnly ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">{value || "—"}</p>
      ) : (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          className="campus-input"
        />
      )}
    </div>
  );
}

function statusClass(value: string | null | undefined) {
  if (!value) return "border-slate-300 bg-slate-100 text-slate-600";
  const lower = value.toLowerCase();
  if (lower.includes("good") || lower.includes("active") || lower.includes("full")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (lower.includes("probation") || lower.includes("hold")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-blue-200 bg-blue-50 text-blue-700";
}

const AVATAR_GRADIENTS = [
  "from-blue-400 to-blue-600",
  "from-emerald-400 to-emerald-600",
  "from-violet-400 to-violet-600",
  "from-amber-400 to-amber-600",
  "from-red-400 to-red-600",
  "from-pink-400 to-pink-600"
];

function getGradient(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) & 0xffffffff;
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function buildCompleteness(form: FormState): ProfileCompletenessResponse {
  const fields = [
    { name: "legalName", label: "姓名", filled: Boolean(form.legalName.trim()) },
    { name: "programMajor", label: "专业", filled: Boolean(form.programMajor.trim()) },
    { name: "dob", label: "出生日期", filled: Boolean(form.dob) },
    { name: "address", label: "地址", filled: Boolean(form.address.trim()) },
    { name: "emergencyContact", label: "紧急联系人", filled: Boolean(form.emergencyContact.trim()) }
  ];

  return {
    score: fields.reduce((sum, field) => sum + (field.filled ? 20 : 0), 0),
    missing: fields.filter((field) => !field.filled).map((field) => field.label),
    fields
  };
}

function ChangePasswordCard() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ oldPassword: "", newPassword: "", confirmNewPassword: "" });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (form.newPassword !== form.confirmNewPassword) {
      setErr("两次输入的密码不一致。");
      return;
    }
    if (form.newPassword.length < 8) {
      setErr("新密码至少需要8个字符。");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "PATCH",
        body: JSON.stringify({ oldPassword: form.oldPassword, newPassword: form.newPassword })
      });
      window.localStorage.removeItem("sis_session_exp");
      toast("密码已更新，请重新登录", "success");
      setForm({ oldPassword: "", newPassword: "", confirmNewPassword: "" });
      router.push("/login");
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : "密码修改失败";
      setErr(message);
      toast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="campus-card overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">修改密码</h3>
      </div>
      <form onSubmit={onSubmit} className="space-y-3 p-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">当前密码</label>
          <div className="relative">
            <input
              type={showCurrent ? "text" : "password"}
              value={form.oldPassword}
              required
              onChange={(e) => setForm((p) => ({ ...p, oldPassword: e.target.value }))}
              className="campus-input pr-10"
              autoComplete="current-password"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowCurrent((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={showCurrent ? "隐藏密码" : "显示密码"}
            >
              {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">新密码</label>
          <div className="relative">
            <input
              type={showNew ? "text" : "password"}
              value={form.newPassword}
              required
              minLength={8}
              onChange={(e) => setForm((p) => ({ ...p, newPassword: e.target.value }))}
              className="campus-input pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowNew((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={showNew ? "隐藏密码" : "显示密码"}
            >
              {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {form.newPassword.length > 0 ? (
            <div className="mt-1.5 flex gap-1">
              {[1, 2, 3, 4].map((level) => {
                const strength = [
                  form.newPassword.length >= 8,
                  /[A-Z]/.test(form.newPassword),
                  /[0-9]/.test(form.newPassword),
                  /[^A-Za-z0-9]/.test(form.newPassword)
                ].filter(Boolean).length;
                return (
                  <div
                    key={level}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      strength >= level
                        ? strength <= 1 ? "bg-red-400" : strength <= 2 ? "bg-amber-400" : strength <= 3 ? "bg-blue-400" : "bg-emerald-400"
                        : "bg-slate-200"
                    }`}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">确认新密码</label>
          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              value={form.confirmNewPassword}
              required
              onChange={(e) => setForm((p) => ({ ...p, confirmNewPassword: e.target.value }))}
              className="campus-input pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={showConfirm ? "隐藏密码" : "显示密码"}
            >
              {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        {err ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{err}</p>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-slate-800 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {saving ? (
            <><span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />保存中…</>
          ) : "更新密码"}
        </button>
      </form>
    </section>
  );
}

export default function StudentProfilePage() {
  const toast = useToast();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<FormState>({ legalName: "", programMajor: "", dob: "", address: "", emergencyContact: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completedCredits, setCompletedCredits] = useState(0);
  const [enrolledCredits, setEnrolledCredits] = useState(0);
  const [currentGpa, setCurrentGpa] = useState<number | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [goal, setGoal] = useState("");
  const [goalDraft, setGoalDraft] = useState("");
  const [currentTermId, setCurrentTermId] = useState("current");
  const [semesterNotes, setSemesterNotes] = useState("");
  const [allowRecommendations, setAllowRecommendations] = useState(true);
  const [receiveMailNotifications, setReceiveMailNotifications] = useState(true);

  useEffect(() => {
    apiFetch<ProfileResponse>("/students/me")
      .then((data) => {
        setProfile(data);
        setForm({
          legalName: data.legalName || "",
          programMajor: data.programMajor || "",
          dob: data.dob ? new Date(data.dob).toISOString().slice(0, 10) : "",
          address: data.address || "",
          emergencyContact: data.emergencyContact || ""
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "个人资料加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("sis_goal") || "";
      setGoal(saved);
      setGoalDraft(saved);
    } catch {
      setGoal("");
      setGoalDraft("");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([apiFetch<TranscriptTerm[]>("/students/transcript"), apiFetch<EnrollmentRow[]>("/registration/enrollments")])
      .then(([transcriptTerms, enrollments]) => {
        if (!alive) return;

        setSummaryError("");
        setCurrentTermId(transcriptTerms[0]?.termId ?? "current");

        const transcript = transcriptTerms.flatMap((term) => term.enrollments ?? []);

        const gradePoints: Record<string, number> = {
          "A+": 4,
          A: 4,
          "A-": 3.7,
          "B+": 3.3,
          B: 3,
          "B-": 2.7,
          "C+": 2.3,
          C: 2,
          "C-": 1.7,
          "D+": 1.3,
          D: 1,
          "D-": 0.7,
          F: 0
        };

        const completed = transcript.reduce((sum, row) => sum + (row.section?.credits ?? 0), 0);
        const enrolled = enrollments
          .filter((row) => row.status === "ENROLLED")
          .reduce((sum, row) => sum + (row.section?.credits ?? 0), 0);

        let weighted = 0;
        let credits = 0;
        for (const row of transcript) {
          const points = row.finalGrade ? gradePoints[row.finalGrade] : undefined;
          if (points === undefined) continue;
          weighted += points * (row.section?.credits ?? 0);
          credits += row.section?.credits ?? 0;
        }

        setCompletedCredits(completed);
        setEnrolledCredits(enrolled);
        setCurrentGpa(credits > 0 ? Math.round((weighted / credits) * 1000) / 1000 : null);
      })
      .catch((err) => {
        if (!alive) return;
        setSummaryError(err instanceof Error ? err.message : "注册摘要加载失败");
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      const recommendations = window.localStorage.getItem("sis_privacy_allow_recommendations");
      const mail = window.localStorage.getItem("sis_privacy_email_notifications");
      setAllowRecommendations(recommendations !== "false");
      setReceiveMailNotifications(mail !== "false");
    } catch {
      setAllowRecommendations(true);
      setReceiveMailNotifications(true);
    }
  }, []);

  useEffect(() => {
    try {
      const key = `sis_semester_notes_${currentTermId}`;
      setSemesterNotes(window.localStorage.getItem(key) ?? "");
    } catch {
      setSemesterNotes("");
    }
  }, [currentTermId]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setSaving(true);
    try {
      await apiFetch("/students/profile", {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          dob: form.dob ? new Date(form.dob).toISOString() : null
        })
      });
      toast.success("档案已保存");
      setMessage("档案已保存。");
      if (profile) {
        setProfile({ ...profile, ...form, dob: form.dob || null });
      }
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "更新失败";
      setError(nextError);
      toast.error(nextError);
    } finally {
      setSaving(false);
    }
  };

  const initials = useMemo(() => {
    return (
      form.legalName
        .split(" ")
        .filter(Boolean)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "?"
    );
  }, [form.legalName]);
  const gradient = useMemo(
    () => getGradient(form.legalName || profile?.user.email || "U"),
    [form.legalName, profile?.user.email]
  );
  const expectedTerms = Math.max(0, Math.ceil((120 - completedCredits) / 15));
  const expectedGraduation = expectedTerms === 0 ? "现已符合条件" : `还需 ${expectedTerms} 个学期`;
  const DEGREE_CREDITS = 120;
  const degreeProgress = Math.min(100, Math.round((completedCredits / DEGREE_CREDITS) * 100));
  const academicStanding =
    currentGpa === null || completedCredits === 0
      ? "在读"
      : currentGpa >= 3.5
        ? "优秀学生"
        : currentGpa >= 2.0
          ? "学业正常"
          : "学业警告";
  const standingColor =
    academicStanding === "优秀学生"
      ? "text-indigo-600 bg-indigo-50 border-indigo-200"
      : academicStanding === "学业正常"
        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
        : academicStanding === "学业警告"
          ? "text-red-600 bg-red-50 border-red-200"
          : "text-slate-600 bg-slate-50 border-slate-200";
  const completeness = useMemo(() => buildCompleteness(form), [form]);
  const saveGoal = () => {
    const next = goalDraft.trim();
    setGoal(next);
    try {
      window.localStorage.setItem("sis_goal", next);
    } catch {
      // Ignore storage errors and keep UI usable.
    }
  };
  const saveSemesterNotes = (next: string) => {
    setSemesterNotes(next);
    try {
      window.localStorage.setItem(`sis_semester_notes_${currentTermId}`, next);
    } catch {
      // ignore storage failures
    }
  };
  const updatePrivacy = (key: "recommendations" | "email", value: boolean) => {
    if (key === "recommendations") setAllowRecommendations(value);
    if (key === "email") setReceiveMailNotifications(value);
    try {
      window.localStorage.setItem(
        key === "recommendations" ? "sis_privacy_allow_recommendations" : "sis_privacy_email_notifications",
        String(value)
      );
    } catch {
      // ignore storage failures
    }
  };

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">学生档案</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-[2.65rem]">我的档案</h1>
            <p className="text-base text-slate-600">完善档案信息，确保教务通知、学业支持和注册流程都基于最新资料。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="campus-chip chip-blue">{profile?.user.studentId ?? "Student"}</span>
            <span className="campus-chip chip-purple">{form.programMajor || "未填写专业"}</span>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
            <span>当前完整度</span>
            <span className="font-semibold text-slate-900">{completeness.score}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all ${
                completeness.score > 80 ? "bg-emerald-500" : completeness.score >= 60 ? "bg-amber-500" : "bg-red-500"
              }`}
              style={{ width: `${completeness.score}%` }}
            />
          </div>
        </div>
      </section>

      <section className="campus-card overflow-hidden p-0">
        <div className="relative border-b border-slate-200 bg-slate-50 px-5 py-6 md:px-7">
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-3xl font-bold text-white shadow-lg`}>
                {initials}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">学生档案</p>
                <h1 className="font-heading text-3xl font-bold text-slate-900">{form.legalName || "学生"}</h1>
                <p className="text-sm text-slate-600">{profile?.user.email || "—"}</p>
                <button className="mt-2 cursor-not-allowed text-xs font-medium text-blue-600 opacity-50 hover:underline" disabled>
                  更换头像（即将上线）
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(profile?.enrollmentStatus)}`}>
                {profile?.enrollmentStatus || "未设置注册状态"}
              </span>
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(profile?.academicStatus)}`}>
                {profile?.academicStatus || "未设置学术状态"}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-5 py-4 md:grid-cols-3 md:px-7">
          <Field label="学号" value={profile?.user.studentId ?? "—"} readOnly />
          <Field label="专业" value={form.programMajor || "—"} readOnly />
          <Field label="邮箱" value={profile?.user.email ?? "—"} readOnly />
        </div>
      </section>

      {loading ? (
        <section className="campus-card px-5 py-8 text-center text-sm text-slate-500">加载中...</section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form onSubmit={onSubmit} className="campus-card overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4 md:px-6">
              <h2 className="text-lg font-semibold text-slate-900">个人信息</h2>
              <p className="mt-0.5 text-sm text-slate-500">更新姓名、专业、出生日期和联系信息，提升档案完整度。</p>
            </div>
            <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 md:px-6">
              <div className="sm:col-span-2">
                <Field
                  label="姓名"
                  value={form.legalName}
                  placeholder="法定姓名"
                  onChange={(v) => setForm((prev) => ({ ...prev, legalName: v }))}
                />
              </div>
              <Field
                label="专业"
                value={form.programMajor}
                placeholder="所在专业"
                onChange={(v) => setForm((prev) => ({ ...prev, programMajor: v }))}
              />
              <Field
                label="出生日期"
                type="date"
                value={form.dob}
                onChange={(v) => setForm((prev) => ({ ...prev, dob: v }))}
              />
              <Field
                label="联系地址"
                value={form.address}
                placeholder="省市区街道详细地址"
                onChange={(v) => setForm((prev) => ({ ...prev, address: v }))}
              />
              <div className="sm:col-span-2">
                <Field
                  label="紧急联系人"
                  value={form.emergencyContact}
                  placeholder="姓名 · 电话 · 与本人关系"
                  onChange={(v) => setForm((prev) => ({ ...prev, emergencyContact: v }))}
                />
              </div>
            </div>
            {message ? (
              <div className="mx-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 md:mx-6">{message}</div>
            ) : null}
            {error ? (
              <div className="mx-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800 md:mx-6">{error}</div>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-5 py-4 md:px-6">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-10 min-w-32 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Saving…
                  </>
                ) : (
                  "保存更改"
                )}
              </button>
            </div>
          </form>

          <aside className="space-y-4">
            <ProfileCompletenessCard
              score={completeness.score}
              missing={completeness.missing}
              fields={completeness.fields}
              title="档案完成度"
            />

            <section className="campus-card p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">学业汇总</h3>
              {summaryError ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  无法加载学业汇总。{summaryError}
                </div>
              ) : null}
              {/* Academic standing badge */}
              <div className="mt-3 flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${standingColor}`}>
                  {academicStanding === "优秀学生" ? "🏅 " : academicStanding === "学业警告" ? "⚠️ " : "✓ "}
                  {academicStanding}
                </span>
                {currentGpa !== null && (
                  <span className="text-xs text-slate-500">GPA {currentGpa.toFixed(2)}</span>
                )}
              </div>

              {/* Degree progress bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>毕业进度</span>
                  <span className="font-semibold text-slate-700">{completedCredits} / {DEGREE_CREDITS} cr ({degreeProgress}%)</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${degreeProgress >= 100 ? "bg-emerald-500" : degreeProgress >= 75 ? "bg-indigo-500" : degreeProgress >= 50 ? "bg-blue-400" : "bg-slate-300"}`}
                    style={{ width: `${degreeProgress}%` }}
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="campus-kpi">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">总已修学分</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{completedCredits}</p>
                </div>
                <div className="campus-kpi">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">总在读学分</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{enrolledCredits}</p>
                </div>
                <div className="campus-kpi">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">当前 GPA</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{currentGpa != null ? currentGpa.toFixed(2) : "—"}</p>
                </div>
                <div className="campus-kpi">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">预计毕业</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{expectedGraduation}</p>
                </div>
              </div>
            </section>

            <section className="campus-card p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">学习目标</h3>
              <p className="mt-1 text-xs text-slate-500">设置本学期的学业目标，随时可见。</p>
              <textarea
                value={goalDraft}
                onChange={(event) => setGoalDraft(event.target.value)}
                rows={3}
                className="campus-input mt-3 w-full"
                placeholder="例如：本学期维持 3.5 GPA"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">{goal ? `当前目标：${goal}` : "尚未设置目标。"}</p>
                <button
                  type="button"
                  onClick={saveGoal}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  保存目标
                </button>
              </div>
            </section>

            <section className="campus-card p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">学期总结</h3>
              <p className="mt-1 text-xs text-slate-500">本学期笔记，仅保存在本地浏览器中。</p>
              <textarea
                value={semesterNotes}
                onChange={(event) => saveSemesterNotes(event.target.value.slice(0, 500))}
                rows={4}
                className="campus-input mt-3 w-full"
                placeholder="记录本学期的反思、计划和关键事项"
              />
              <div className="mt-1 text-right text-[11px] text-slate-400">{semesterNotes.length}/500</div>
            </section>

            <section className="campus-card p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">隐私设置</h3>
              <div className="mt-3 space-y-3 text-sm">
                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <span>允许推荐课程</span>
                  <input
                    type="checkbox"
                    checked={allowRecommendations}
                    onChange={(event) => updatePrivacy("recommendations", event.target.checked)}
                    className="size-4 accent-slate-900"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <span>接收邮件通知</span>
                  <input
                    type="checkbox"
                    checked={receiveMailNotifications}
                    onChange={(event) => updatePrivacy("email", event.target.checked)}
                    className="size-4 accent-slate-900"
                  />
                </label>
                <p className="text-xs text-slate-500">当前仅保存在本地浏览器中，用于控制推荐与通知偏好。</p>
              </div>
            </section>

            <section className="campus-card p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">档案完整度检查</h3>
              <div className="mt-2 space-y-2 text-sm">
                {[
                  { label: "法定姓名", done: Boolean(form.legalName), required: true },
                  { label: "出生日期", done: Boolean(form.dob), required: false },
                  { label: "家庭住址", done: Boolean(form.address), required: false },
                  { label: "紧急联系人", done: Boolean(form.emergencyContact), required: false }
                ].map(({ label, done, required }) => (
                  <div
                    key={label}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                      done
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : required
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    <span className="text-base leading-none">{done ? "✓" : required ? "!" : "○"}</span>
                    <span>{label} — {done ? "已填写" : required ? "必填" : "建议填写"}</span>
                  </div>
                ))}
              </div>
            </section>

            <ChangePasswordCard />

            <section className="campus-card p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">快捷链接</h3>
              <div className="mt-2 space-y-1.5">
                {[
                  { href: "/student/dashboard", label: "概览" },
                  { href: "/student/schedule", label: "课程表" },
                  { href: "/student/grades", label: "成绩" },
                  { href: "/student/catalog", label: "课程目录" },
                  { href: "/student/cart", label: "选课购物车" },
                ].map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 no-underline transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    {label}
                    <span className="text-slate-400">→</span>
                  </Link>
                ))}
              </div>
            </section>

            <section className="campus-card p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">教务处说明</h3>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                <li>专业、学号和注册状态由教务处管理。</li>
                <li>如需变更法定身份信息，请向学生事务处提交相关证明材料。</li>
                <li>紧急联系人信息更新后立即生效。</li>
              </ul>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
