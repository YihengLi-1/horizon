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
      setError(err instanceof Error ? err.message : "Failed to load advisee overview");
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
        setError(err instanceof Error ? err.message : "Failed to save advisor note");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Advisor</p>
        <h1 className="font-heading text-3xl font-bold text-slate-900">
          {payload?.student.studentProfile?.legalName ?? "Advisee Overview"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {payload
            ? `${payload.student.studentId ?? "No student ID"} · ${payload.student.studentProfile?.programMajor ?? "Undeclared"}`
            : "Loading advisee details."}
        </p>
      </section>

      {loading ? <section className="campus-card p-8 text-center text-sm text-slate-400">Loading advisee…</section> : null}
      {!loading && error ? <section className="campus-card p-6 text-sm text-red-600">{error}</section> : null}

      {!loading && payload ? (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <div className="campus-kpi">
              <p className="text-xs uppercase tracking-wide text-slate-500">Student</p>
              <p className="mt-1 font-semibold text-slate-900">{payload.student.email}</p>
            </div>
            <div className="campus-kpi">
              <p className="text-xs uppercase tracking-wide text-slate-500">Academic Status</p>
              <p className="mt-1 font-semibold text-slate-900">{payload.student.studentProfile?.academicStatus ?? "Unknown"}</p>
            </div>
            <div className="campus-kpi">
              <p className="text-xs uppercase tracking-wide text-slate-500">Active Records</p>
              <p className="mt-1 font-semibold text-slate-900">{payload.student.enrollments.length}</p>
            </div>
          </section>

          <section className="campus-card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Current Academic Records</h2>
              <p className="mt-1 text-xs text-slate-500">Current and completed enrollments visible to the assigned advisor.</p>
            </div>
            <div className="space-y-2">
              {payload.student.enrollments.length === 0 ? (
                <p className="text-sm text-slate-400">No enrollment records available.</p>
              ) : (
                payload.student.enrollments.map((enrollment) => (
                  <div key={enrollment.id} className="rounded-lg border border-slate-200 px-3 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-slate-900">
                        {enrollment.section.course.code} §{enrollment.section.sectionCode}
                      </p>
                      <span className="campus-chip text-xs">{enrollment.status}</span>
                    </div>
                    <p className="mt-1 text-slate-600">{enrollment.section.course.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {enrollment.section.term.name}
                      {enrollment.finalGrade ? ` · Final grade ${enrollment.finalGrade}` : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="campus-card p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Advisor Notes</h2>
              <p className="mt-1 text-xs text-slate-500">Private advising notes scoped to your assigned advisee.</p>
            </div>
            <form onSubmit={onSubmit} className="space-y-3">
              <textarea
                className="campus-input min-h-28"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Record an advising note, follow-up, or academic concern."
              />
              <button type="submit" disabled={saving || !body.trim()} className="campus-chip cursor-pointer text-xs">
                {saving ? "Saving…" : "Add advisor note"}
              </button>
            </form>
            <div className="space-y-3">
              {payload.notes.length === 0 ? (
                <p className="text-sm text-slate-400">No advisor notes yet.</p>
              ) : (
                payload.notes.map((note) => (
                  <article key={note.id} className="rounded-lg border border-slate-200 px-3 py-3">
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{note.body}</p>
                    <p className="mt-2 text-xs text-slate-400">{new Date(note.createdAt).toLocaleString()}</p>
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
