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
        <div className="relative border-b border-slate-200 bg-gradient-to-r from-[#12305f] via-[#214f8f] to-[#8da2bf] px-5 py-6 md:px-7">
          <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_15%_12%,rgba(255,255,255,0.35),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(252,211,77,0.35),transparent_30%)]" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-full border border-white/30 bg-white/10 text-xl font-bold text-white">
                {initials}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-100">Student Profile</p>
                <h1 className="font-heading text-3xl font-bold text-white">{form.legalName || "Student"}</h1>
                <p className="text-sm text-blue-100/90">{profile?.user.email || "—"}</p>
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
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Registrar Notes</h3>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                <li>Major, student ID, and enrollment status are managed by registrar staff.</li>
                <li>For legal identity changes, submit documentation to Student Services.</li>
                <li>Emergency contact updates apply immediately.</li>
              </ul>
            </section>
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
          </aside>
        </div>
      )}
    </div>
  );
}
