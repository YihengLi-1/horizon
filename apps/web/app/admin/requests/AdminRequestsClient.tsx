"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";

type RequestStep = {
  id: string;
  stepOrder: number;
  stepKey: string;
  label: string;
  requiredApproverRole: "FACULTY" | "ADMIN" | "ADVISOR" | "STUDENT";
  ownerUserId?: string | null;
  initialOwnerUserId?: string | null;
  status: "WAITING" | "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
  decisionNote?: string | null;
  decidedAt?: string | null;
  owner?: {
    email: string;
    facultyProfile?: { displayName?: string | null } | null;
    advisorProfile?: { displayName?: string | null } | null;
  } | null;
  initialOwner?: {
    email: string;
    facultyProfile?: { displayName?: string | null } | null;
    advisorProfile?: { displayName?: string | null } | null;
  } | null;
  decidedBy?: {
    email: string;
    facultyProfile?: { displayName?: string | null } | null;
    advisorProfile?: { displayName?: string | null } | null;
  } | null;
};

type AdminRequest = {
  id: string;
  type: "PREREQ_OVERRIDE";
  status: "SUBMITTED";
  reason: string;
  submittedAt: string;
  currentStepOrder?: number | null;
  student: {
    id: string;
    email: string;
    studentId?: string | null;
    studentProfile?: {
      legalName?: string | null;
      programMajor?: string | null;
    } | null;
  };
  term?: {
    id: string;
    name: string;
  } | null;
  section?: {
    id: string;
    sectionCode: string;
    course: {
      code: string;
      title: string;
    };
  } | null;
  steps: RequestStep[];
};

type ReassignmentCandidate = {
  id: string;
  email: string;
  role: "FACULTY" | "ADMIN" | "ADVISOR" | "STUDENT";
  displayName: string;
  currentAssigned: boolean;
  initialAssigned: boolean;
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function getActorLabel(actor?: {
  email: string;
  facultyProfile?: { displayName?: string | null } | null;
  advisorProfile?: { displayName?: string | null } | null;
} | null) {
  return actor?.facultyProfile?.displayName ?? actor?.advisorProfile?.displayName ?? actor?.email ?? "Unassigned";
}

export default function AdminRequestsClient() {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [candidateOptions, setCandidateOptions] = useState<Record<string, ReassignmentCandidate[]>>({});
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const toast = useToast();

  const loadRequests = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<AdminRequest[]>("/governance/admin/requests");
      setRequests(data);
      const optionResults = await Promise.allSettled(
        data.map(async (request) => {
          const options = await apiFetch<ReassignmentCandidate[]>(
            `/governance/admin/requests/${request.id}/reassignment-options`
          );
          return { requestId: request.id, options };
        })
      );

      const nextOptions: Record<string, ReassignmentCandidate[]> = {};
      const nextSelections: Record<string, string> = {};
      for (const result of optionResults) {
        if (result.status !== "fulfilled") continue;
        nextOptions[result.value.requestId] = result.value.options;
        const current = result.value.options.find((option) => option.currentAssigned);
        if (current) {
          nextSelections[result.value.requestId] = current.id;
        }
      }
      setCandidateOptions(nextOptions);
      setSelectedOwnerIds(nextSelections);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin approval requests");
      setRequests([]);
      setCandidateOptions({});
      setSelectedOwnerIds({});
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
      toast("请输入至少 3 个字符的终审说明", "error");
      return;
    }

    try {
      setSavingId(requestId);
      await apiFetch(`/governance/admin/requests/${requestId}/decision`, {
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
      toast(decision === "APPROVED" ? "请求已完成终审批准" : "请求已终审拒绝", "success");
      await loadRequests();
    } catch (err) {
      if (err instanceof ApiError) {
        toast(err.message, "error");
      } else {
        toast("处理终审请求失败", "error");
      }
    } finally {
      setSavingId(null);
    }
  };

  const pendingCount = requests.length;
  const registrarOwnedCount = useMemo(
    () =>
      requests.reduce((count, request) => {
        const currentStep = request.steps.find((step) => step.stepOrder === request.currentStepOrder);
        return count + (currentStep?.requiredApproverRole === "ADMIN" ? 1 : 0);
      }, 0),
    [requests]
  );

  const reassign = async (requestId: string) => {
    const ownerUserId = selectedOwnerIds[requestId];
    if (!ownerUserId) {
      toast("请选择新的当前审批人", "error");
      return;
    }

    try {
      setSavingId(requestId);
      await apiFetch(`/governance/admin/requests/${requestId}/reassign`, {
        method: "POST",
        body: JSON.stringify({
          ownerUserId,
          note: "Administrative routing update"
        })
      });
      toast("当前审批步骤已改派", "success");
      await loadRequests();
    } catch (err) {
      if (err instanceof ApiError) {
        toast(err.message, "error");
      } else {
        toast("改派当前审批步骤失败", "error");
      }
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="campus-eyebrow">Workflow Routing</p>
            <h1 className="font-heading text-3xl font-bold text-slate-900">Approval Requests</h1>
            <p className="mt-2 text-sm text-slate-600">
              Review active prerequisite override workflows, reassign the current step when staffing changes, and finalize registrar-owned requests.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="campus-kpi border-slate-200 bg-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Workflows</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{pendingCount}</p>
            </div>
            <div className="campus-kpi border-blue-200 bg-blue-50">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Registrar-Owned Steps</p>
              <p className="mt-1 text-2xl font-semibold text-blue-900">{registrarOwnedCount}</p>
            </div>
          </div>
        </div>
      </section>

      {error ? <section className="campus-card p-6 text-sm text-red-600">Admin approval queue unavailable: {error}</section> : null}

      {!error && loading ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {[1, 2].map((item) => (
            <div key={item} className="campus-card p-5 animate-pulse">
              <div className="h-4 w-1/3 rounded bg-slate-200" />
              <div className="mt-3 h-24 rounded bg-slate-100" />
            </div>
          ))}
        </section>
      ) : null}

      {!error && !loading && requests.length === 0 ? (
        <section className="campus-card p-8 text-center text-sm text-slate-500">
          No active prerequisite override workflows need routing or registrar action.
        </section>
      ) : null}

      {!error && !loading && requests.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {requests.map((request) => {
            const facultyStep = request.steps.find((step) => step.stepKey === "faculty_review") ?? null;
            const finalStep = request.steps.find((step) => step.stepKey === "registrar_finalization") ?? null;
            const currentStep = request.steps.find((step) => step.stepOrder === request.currentStepOrder) ?? null;
            const facultyReviewer =
              facultyStep?.decidedBy?.facultyProfile?.displayName ||
              facultyStep?.decidedBy?.advisorProfile?.displayName ||
              facultyStep?.decidedBy?.email ||
              "Faculty reviewer";
            const currentOwner = getActorLabel(currentStep?.owner);
            const initialOwner = getActorLabel(currentStep?.initialOwner);
            const candidates = candidateOptions[request.id] ?? [];
            const canFinalize = currentStep?.requiredApproverRole === "ADMIN";

            return (
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
                  <p className="mt-1">Student justification: {request.reason}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {request.term?.name ?? "Selected term"} · Submitted {formatDateTime(request.submittedAt)}
                  </p>
                </div>

                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Workflow Progress</p>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-white px-3 py-2">
                      <span className="font-medium">1. Faculty Review</span>
                      <span className={`campus-chip text-[11px] ${facultyStep?.status === "APPROVED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                        {facultyStep?.status ?? "WAITING"}
                      </span>
                    </div>
                    {facultyStep?.decisionNote ? (
                      <p className="text-xs text-blue-800">
                        {facultyReviewer}: {facultyStep.decisionNote}
                      </p>
                    ) : null}
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-white px-3 py-2">
                      <span className="font-medium">2. Registrar Finalization</span>
                      <span className={`campus-chip text-[11px] ${finalStep?.status === "PENDING" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                        {finalStep?.status ?? "WAITING"}
                      </span>
                    </div>
                  </div>
                  {currentStep ? (
                    <div className="mt-3 rounded-lg border border-blue-100 bg-white px-3 py-3 text-xs text-slate-700">
                      <p className="font-semibold text-slate-900">Current owner</p>
                      <p className="mt-1">{currentOwner}</p>
                      {currentStep.ownerUserId !== currentStep.initialOwnerUserId ? (
                        <p className="mt-1 text-slate-500">Originally resolved to {initialOwner}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {currentStep ? (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reassign Active Step</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Only a reviewer with the required role can be assigned. Previous owners lose decision authority immediately.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="campus-select min-w-64"
                        value={selectedOwnerIds[request.id] ?? ""}
                        onChange={(event) =>
                          setSelectedOwnerIds((prev) => ({
                            ...prev,
                            [request.id]: event.target.value
                          }))
                        }
                      >
                        <option value="">Select reviewer</option>
                        {candidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.displayName}
                            {candidate.currentAssigned ? " (Current)" : ""}
                            {candidate.initialAssigned ? " (Initial)" : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void reassign(request.id)}
                        disabled={savingId === request.id || !selectedOwnerIds[request.id]}
                        className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingId === request.id ? "Saving…" : "Reassign current step"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {canFinalize ? (
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Finalization Note</span>
                    <textarea
                      className="campus-input min-h-24"
                      value={decisionNotes[request.id] ?? ""}
                      onChange={(event) =>
                        setDecisionNotes((prev) => ({
                          ...prev,
                          [request.id]: event.target.value
                        }))
                      }
                      placeholder="Record the registrar finalization rationale."
                    />
                  </label>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                    This request is not yet at registrar finalization. You can reroute the active step if the assigned reviewer changes.
                  </div>
                )}

                {canFinalize ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void decide(request.id, "APPROVED")}
                      disabled={savingId === request.id}
                      className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingId === request.id ? "Saving…" : "Finalize approval"}
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
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
