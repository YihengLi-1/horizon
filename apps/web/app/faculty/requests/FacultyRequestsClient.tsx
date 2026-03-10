"use client";

import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";

type FacultyRequest = {
  id: string;
  type: "PREREQ_OVERRIDE";
  status: "SUBMITTED";
  reason: string;
  submittedAt: string;
  student: {
    id: string;
    email: string;
    studentId?: string | null;
    studentProfile?: {
      legalName?: string;
      programMajor?: string | null;
      academicStatus?: string | null;
    } | null;
  };
  term?: {
    id: string;
    name: string;
    maxCredits: number;
  } | null;
  section?: {
    id: string;
    sectionCode: string;
    course: {
      code: string;
      title: string;
    };
  } | null;
};

export default function FacultyRequestsClient() {
  const [requests, setRequests] = useState<FacultyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const toast = useToast();

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<FacultyRequest[]>("/governance/faculty/requests");
      setRequests(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load faculty requests");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  const decide = async (requestId: string, decision: "APPROVED" | "REJECTED") => {
    const note = (decisionNotes[requestId] ?? "").trim();
    if (note.length < 3) {
      toast("请输入至少 3 个字符的审批说明", "error");
      return;
    }

    try {
      setSavingId(requestId);
      await apiFetch(`/governance/faculty/requests/${requestId}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          decisionNote: note
        })
      });
      setDecisionNotes((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      toast(decision === "APPROVED" ? "申请已批准" : "申请已拒绝", "success");
      await loadRequests();
    } catch (err) {
      if (err instanceof ApiError) {
        toast(err.message, "error");
      } else {
        toast("处理申请失败", "error");
      }
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Faculty Governance</p>
        <h1 className="font-heading text-3xl font-bold text-slate-900">Pending Prerequisite Overrides</h1>
        <p className="mt-2 text-sm text-slate-600">
          Review prerequisite override requests for sections you own. Approval allows the student to bypass prerequisite checks for that section only.
        </p>
      </section>

      {error ? <section className="campus-card p-6 text-sm text-red-600">Faculty requests are unavailable: {error}</section> : null}

      {!error && loading ? (
        <section className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((item) => (
            <div key={item} className="campus-card p-5 animate-pulse">
              <div className="h-4 w-1/3 rounded bg-slate-200" />
              <div className="mt-3 h-20 rounded bg-slate-100" />
            </div>
          ))}
        </section>
      ) : null}

      {!error && !loading && requests.length === 0 ? (
        <section className="campus-card p-8 text-center text-sm text-slate-500">
          No pending prerequisite override requests are assigned to you.
        </section>
      ) : null}

      {!error && !loading && requests.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {requests.map((request) => (
            <article key={request.id} className="campus-card p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-900">
                    {request.student.studentProfile?.legalName ?? request.student.email}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {request.student.studentId ?? "No student ID"} · {request.student.studentProfile?.programMajor ?? "Undeclared"}
                  </p>
                </div>
                <span className="campus-chip border-blue-200 bg-blue-50 text-blue-700 text-xs">
                  {request.section?.course.code ?? "Course"} §{request.section?.sectionCode ?? "—"}
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">{request.section?.course.title ?? "Selected section"}</p>
                <p className="mt-1">Reason: {request.reason}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {request.term?.name ?? "Selected term"} · Submitted {new Date(request.submittedAt).toLocaleString()}
                </p>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Decision Note</span>
                <textarea
                  className="campus-input min-h-24"
                  value={decisionNotes[request.id] ?? ""}
                  onChange={(event) =>
                    setDecisionNotes((prev) => ({
                      ...prev,
                      [request.id]: event.target.value
                    }))
                  }
                  placeholder="Explain why the override is approved or rejected."
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void decide(request.id, "APPROVED")}
                  disabled={savingId === request.id}
                  className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingId === request.id ? "Saving…" : "Approve"}
                </button>
                <button
                  type="button"
                  onClick={() => void decide(request.id, "REJECTED")}
                  disabled={savingId === request.id}
                  className="inline-flex h-10 items-center rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
