"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
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
  dob: string;
  address: string;
  emergencyContact: string;
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
      setErr("New passwords do not match.");
      return;
    }
    if (form.newPassword.length < 8) {
      setErr("New password must be at least 8 characters.");
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
      const message = ex instanceof Error ? ex.message : "Failed to change password";
      setErr(message);
      toast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="campus-card overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">Change Password</h3>
      </div>
      <form onSubmit={onSubmit} className="space-y-3 p-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Current password</label>
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
              aria-label={showCurrent ? "Hide password" : "Show password"}
            >
              {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">New password</label>
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
              aria-label={showNew ? "Hide password" : "Show password"}
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
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Confirm new password</label>
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
              aria-label={showConfirm ? "Hide password" : "Show password"}
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
            <><span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />Saving</>
          ) : "Update password"}
        </button>
      </form>
    </section>
  );
}

export default function StudentProfilePage() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState<FormState>({ legalName: "", dob: "", address: "", emergencyContact: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [completedCredits, setCompletedCredits] = useState(0);
  const [enrolledCredits, setEnrolledCredits] = useState(0);
  const [currentGpa, setCurrentGpa] = useState<number | null>(null);

  useEffect(() => {
    apiFetch<ProfileResponse>("/students/me")
      .then((data) => {
        setProfile(data);
        setForm({
          legalName: data.legalName || "",
          dob: data.dob ? new Date(data.dob).toISOString().slice(0, 10) : "",
          address: data.address || "",
          emergencyContact: data.emergencyContact || ""
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      apiFetch<TranscriptTerm[]>("/students/transcript").catch(() => [] as TranscriptTerm[]),
      apiFetch<EnrollmentRow[]>("/registration/enrollments").catch(() => [] as EnrollmentRow[])
    ]).then(([transcriptTerms, enrollments]) => {
      if (!alive) return;

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
    });

    return () => {
      alive = false;
    };
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setSaving(true);
    try {
      await apiFetch("/students/me", {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          dob: form.dob ? new Date(form.dob).toISOString() : null
        })
      });
      setMessage("Profile saved successfully.");
      if (profile) {
        setProfile({ ...profile, ...form, dob: form.dob || null });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
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
  const expectedGraduation = expectedTerms === 0 ? "Eligible now" : `${expectedTerms} term(s)`;

  return (
    <div className="campus-page">
      <section className="campus-card overflow-hidden p-0">
        <div className="relative border-b border-slate-200 bg-slate-50 px-5 py-6 md:px-7">
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-3xl font-bold text-white shadow-lg`}>
                {initials}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Student Profile</p>
                <h1 className="font-heading text-3xl font-bold text-slate-900">{form.legalName || "Student"}</h1>
                <p className="text-sm text-slate-600">{profile?.user.email || "—"}</p>
                <button className="mt-2 cursor-not-allowed text-xs font-medium text-blue-600 opacity-50 hover:underline" disabled>
                  Change Avatar (Coming Soon)
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(profile?.enrollmentStatus)}`}>
                {profile?.enrollmentStatus || "No enrollment status"}
              </span>
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(profile?.academicStatus)}`}>
                {profile?.academicStatus || "No academic status"}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-5 py-4 md:grid-cols-3 md:px-7">
          <Field label="Student ID" value={profile?.user.studentId ?? "—"} readOnly />
          <Field label="Major" value={profile?.programMajor ?? "—"} readOnly />
          <Field label="Email" value={profile?.user.email ?? "—"} readOnly />
        </div>
      </section>

      {loading ? (
        <section className="campus-card px-5 py-8 text-center text-sm text-slate-500">Loading profile...</section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form onSubmit={onSubmit} className="campus-card overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-4 md:px-6">
              <h2 className="text-lg font-semibold text-slate-900">Personal Information</h2>
              <p className="mt-0.5 text-sm text-slate-500">Update your legal name, date of birth, and contact information.</p>
            </div>
            <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 md:px-6">
              <div className="sm:col-span-2">
                <Field
                  label="Legal Name"
                  value={form.legalName}
                  placeholder="Full legal name"
                  onChange={(v) => setForm((prev) => ({ ...prev, legalName: v }))}
                />
              </div>
              <Field
                label="Date of Birth"
                type="date"
                value={form.dob}
                onChange={(v) => setForm((prev) => ({ ...prev, dob: v }))}
              />
              <Field
                label="Address"
                value={form.address}
                placeholder="123 Main St, City, State"
                onChange={(v) => setForm((prev) => ({ ...prev, address: v }))}
              />
              <div className="sm:col-span-2">
                <Field
                  label="Emergency Contact"
                  value={form.emergencyContact}
                  placeholder="Name · Phone · Relationship"
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
                  "Save Changes"
                )}
              </button>
            </div>
          </form>

          <aside className="space-y-4">
            <section className="campus-card p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Enrollment Summary</h3>
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
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Profile Checklist</h3>
              <div className="mt-2 space-y-2 text-sm">
                {[
                  { label: "Legal name", done: Boolean(form.legalName), required: true },
                  { label: "Date of birth", done: Boolean(form.dob), required: false },
                  { label: "Address", done: Boolean(form.address), required: false },
                  { label: "Emergency contact", done: Boolean(form.emergencyContact), required: false }
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
                    <span>{label} — {done ? "set" : required ? "required" : "recommended"}</span>
                  </div>
                ))}
              </div>
            </section>

            <ChangePasswordCard />

            <section className="campus-card p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Quick Links</h3>
              <div className="mt-2 space-y-1.5">
                {[
                  { href: "/student/dashboard", label: "Dashboard" },
                  { href: "/student/schedule", label: "Class Schedule" },
                  { href: "/student/grades", label: "Grades" },
                  { href: "/student/catalog", label: "Course Catalog" },
                  { href: "/student/cart", label: "Registration Cart" },
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
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Registrar Notes</h3>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                <li>Major, student ID, and enrollment status are managed by registrar staff.</li>
                <li>For legal identity changes, submit documentation to Student Services.</li>
                <li>Emergency contact updates apply immediately.</li>
              </ul>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
