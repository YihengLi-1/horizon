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
  currentStepOrder?: number | null;
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
  steps: Array<{
    id: string;
    stepOrder: number;
    stepKey: string;
    label: string;
    status: "WAITING" | "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
    decisionNote?: string | null;
    decidedAt?: string | null;
  }>;
};

const STEP_STATUS_LABEL: Record<string, string> = {
  WAITING: "待处理",
  PENDING: "审核中",
  APPROVED: "已批准",
  REJECTED: "已拒绝",
  SKIPPED: "已跳过",
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
      setError(err instanceof Error ? err.message : "教师申请加载失败");
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
      toast(decision === "APPROVED" ? "已提交给教务处终审" : "申请已拒绝", "success");
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
        <p className="campus-eyebrow">学术治理</p>
        <h1 className="font-heading text-3xl font-bold text-slate-900">待审批先修豁免</h1>
        <p className="mt-2 text-sm text-slate-600">
          审批您所负责课程教学班的先修豁免申请，批准后将转交教务处终审。
        </p>
      </section>

      {error ? <section className="campus-card p-6 text-sm text-red-600">教师申请暂时不可用：{error}</section> : null}

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
          暂无待审批的先修豁免申请
        </section>
      ) : null}

      {!error && !loading && requests.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {requests.map((request) => {
            const facultyStep = request.steps.find((step) => step.stepKey === "faculty_review") ?? null;
            const finalStep = request.steps.find((step) => step.stepKey === "registrar_finalization") ?? null;

            return (
              <article key={request.id} className="campus-card p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-900">
                    {request.student.studentProfile?.legalName ?? request.student.email}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {request.student.studentId ?? "无学号"} · {request.student.studentProfile?.programMajor ?? "未申报"}
                  </p>
                </div>
                <span className="campus-chip border-blue-200 bg-blue-50 text-blue-700 text-xs">
                  {request.section?.course.code ?? "课程"} §{request.section?.sectionCode ?? "—"}
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">{request.section?.course.title ?? "未选课程"}</p>
                <p className="mt-1">申请原因：{request.reason}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {request.term?.name ?? "未选学期"} · 提交于 {new Date(request.submittedAt).toLocaleString("zh-CN")}
                </p>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                <p className="text-xs font-semibold text-blue-700">审批流程进度</p>
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-white px-3 py-2">
                    <span className="font-medium">1. 教师审核</span>
                    <span className={`campus-chip text-[11px] ${facultyStep?.status === "PENDING" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                      {STEP_STATUS_LABEL[facultyStep?.status ?? "PENDING"] ?? facultyStep?.status ?? "待处理"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-white px-3 py-2">
                    <span className="font-medium">2. 教务处终审</span>
                    <span className={`campus-chip text-[11px] ${finalStep?.status === "WAITING" ? "border-slate-200 bg-slate-50 text-slate-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                      {STEP_STATUS_LABEL[finalStep?.status ?? "WAITING"] ?? finalStep?.status ?? "待处理"}
                    </span>
                  </div>
                </div>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-slate-500">审批备注</span>
                <textarea
                  className="campus-input min-h-24"
                  value={decisionNotes[request.id] ?? ""}
                  onChange={(event) =>
                    setDecisionNotes((prev) => ({
                      ...prev,
                      [request.id]: event.target.value
                    }))
                  }
                  placeholder="说明批准或拒绝先修豁免的原因。"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void decide(request.id, "APPROVED")}
                  disabled={savingId === request.id}
                  className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingId === request.id ? "保存中…" : "转交教务处"}
                </button>
                <button
                  type="button"
                  onClick={() => void decide(request.id, "REJECTED")}
                  disabled={savingId === request.id}
                  className="inline-flex h-10 items-center rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  拒绝
                </button>
              </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
