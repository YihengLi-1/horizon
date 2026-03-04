"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

function ChangePasswordCard() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    if (form.newPassword !== form.confirm) {
      setErr("New passwords do not match.");
      return;
    }
    if (form.newPassword.length < 8) {
      setErr("New password must be at least 8 characters.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/students/me/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      });
      setMsg("Password changed successfully.");
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to change password");
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
          <input
            type="password"
            value={form.currentPassword}
            required
            onChange={(e) => setForm((p) => ({ ...p, currentPassword: e.target.value }))}
            className="campus-input"
            autoComplete="current-password"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">New password</label>
          <input
            type="password"
            value={form.newPassword}
            required
            minLength={8}
            onChange={(e) => setForm((p) => ({ ...p, newPassword: e.target.value }))}
            className="campus-input"
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Confirm new password</label>
          <input
            type="password"
            value={form.confirm}
            required
            onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))}
            className="campus-input"
            autoComplete="new-password"
          />
        </div>
        {msg ? <p className="text-xs text-emerald-700">{msg}</p> : null}
        {err ? <p className="text-xs text-red-700">{err}</p> : null}
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

  return (
    <div className="campus-page">
      <section className="campus-card overflow-hidden p-0">
        <div className="relative border-b border-slate-200 bg-slate-50 px-5 py-6 md:px-7">
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-full border border-slate-300 bg-white text-xl font-bold text-slate-900">
                {initials}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Student Profile</p>
                <h1 className="font-heading text-3xl font-bold text-slate-900">{form.legalName || "Student"}</h1>
                <p className="text-sm text-slate-600">{profile?.user.email || "—"}</p>
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 md:px-6">
              <div>
                {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
                {error ? <p className="text-sm text-red-700">{error}</p> : null}
              </div>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-10 min-w-32 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Saving
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </form>

          <aside className="space-y-4">
            <section className="campus-card p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Profile Checklist</h3>
              <div className="mt-2 space-y-2 text-sm">
                <p className={`rounded-lg border px-3 py-2 ${form.legalName ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                  Legal name {form.legalName ? "completed" : "missing"}
                </p>
                <p className={`rounded-lg border px-3 py-2 ${form.address ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                  Address {form.address ? "completed" : "recommended"}
                </p>
                <p className={`rounded-lg border px-3 py-2 ${form.emergencyContact ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                  Emergency contact {form.emergencyContact ? "completed" : "recommended"}
                </p>
              </div>
            </section>

            <ChangePasswordCard />

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
