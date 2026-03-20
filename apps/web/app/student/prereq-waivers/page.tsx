"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };
type SectionOption = {
  id: string;
  sectionCode: string;
  course: { code: string; title: string };
};
type WaiverRequest = {
  id: string;
  type: "PREREQ_OVERRIDE";
  status: "SUBMITTED" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  reason: string;
  submittedAt: string;
  decisionNote?: string | null;
  section?: {
    id: string;
    sectionCode: string;
    course: { code: string; title: string };
  } | null;
};

function statusClass(status: WaiverRequest["status"]) {
  if (status === "APPROVED") return "campus-chip chip-emerald";
  if (status === "REJECTED") return "campus-chip chip-red";
  if (status === "WITHDRAWN") return "campus-chip border-slate-200 bg-slate-50 text-slate-500";
  return "campus-chip chip-amber";
}

export default function StudentPrereqWaiversPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [requests, setRequests] = useState<WaiverRequest[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const approvedCount = useMemo(() => requests.filter((item) => item.status === "APPROVED").length, [requests]);

  async function loadRequests(activeTermId?: string) {
    setLoading(true);
    setError("");
    try {
      const suffix = activeTermId ? `?termId=${activeTermId}` : "";
      const data = await apiFetch<WaiverRequest[]>(`/students/prereq-waivers${suffix}`);
      setRequests(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载先修课豁免失败");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms")
      .catch((err) => { setError(err instanceof Error ? err.message : "学期列表加载失败"); return [] as Term[]; })
      .then(async (termData) => {
      setTerms(termData ?? []);
      const firstTermId = termData?.[0]?.id ?? "";
      setTermId(firstTermId);
      if (firstTermId) {
        const sectionData = await apiFetch<SectionOption[]>(`/academics/sections?termId=${firstTermId}`)
          .catch((err) => { setError(err instanceof Error ? err.message : "班级列表加载失败"); return [] as SectionOption[]; });
        setSections(sectionData ?? []);
      }
      await loadRequests(firstTermId);
      });
  }, []);

  useEffect(() => {
    if (!termId) return;
    void apiFetch<SectionOption[]>(`/academics/sections?termId=${termId}`)
      .then((data) => setSections(data ?? []))
      .catch((err) => { setSections([]); setError(err instanceof Error ? err.message : "班级列表加载失败"); });
    void loadRequests(termId);
  }, [termId]);

  async function submitRequest() {
    if (!sectionId || !reason.trim()) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      await apiFetch("/students/prereq-waiver-request", {
        method: "POST",
        body: JSON.stringify({ sectionId, reason: reason.trim() })
      });
      setNotice("先修课豁免申请已提交。已通过的豁免将在下次选课时自动生效。");
      setReason("");
      setSectionId("");
      await loadRequests(termId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交申请失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">先修豁免</p>
        <h1 className="campus-title">先修课豁免</h1>
        <p className="campus-subtitle">提交先修课豁免申请，并追踪审批结果。</p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="campus-kpi"><p className="campus-kpi-label">申请总数</p><p className="campus-kpi-value">{requests.length}</p></div>
        <div className="campus-kpi"><p className="campus-kpi-label">待审批</p><p className="campus-kpi-value">{requests.filter((item) => item.status === "SUBMITTED").length}</p></div>
        <div className="campus-kpi"><p className="campus-kpi-label">已通过</p><p className="campus-kpi-value">{approvedCount}</p></div>
      </div>

      <section className="campus-card p-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">学期</span>
            <select className="campus-select" value={termId} onChange={(event) => setTermId(event.target.value)}>
              {terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">申请教学班</span>
            <select className="campus-select" value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
              <option value="">选择教学班</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.course.code} · {section.course.title} · §{section.sectionCode}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="space-y-2 block">
          <span className="text-sm font-medium text-slate-700">申请理由</span>
          <textarea className="campus-input min-h-28 py-3" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明你为什么具备修读这门课程的能力。" />
        </label>
        <div className="flex justify-end">
          <button type="button" disabled={submitting || !sectionId || !reason.trim()} onClick={() => void submitRequest()} className="rounded-lg bg-[hsl(221_83%_43%)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(221_83%_38%)] disabled:opacity-50">
            {submitting ? "提交中…" : "提交申请"}
          </button>
        </div>
      </section>

      {notice ? <div className="campus-card border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
      {error ? <div className="campus-card border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="campus-card overflow-x-auto">
        <table className="campus-table min-w-[760px]">
          <thead>
            <tr>
              <th>课程</th>
              <th>理由</th>
              <th>状态</th>
              <th>提交时间</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">加载中…</td></tr>
            ) : requests.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">暂无申请记录</td></tr>
            ) : (
              requests.map((request) => (
                <tr key={request.id}>
                  <td>
                    <div className="font-semibold text-slate-900">{request.section?.course.code} §{request.section?.sectionCode}</div>
                    <div className="text-xs text-slate-500">{request.section?.course.title}</div>
                  </td>
                  <td className="max-w-[280px] text-sm text-slate-600">{request.reason}</td>
                  <td>
                    <span className={statusClass(request.status)}>
                      {request.status === "SUBMITTED" ? "待审批" : request.status === "APPROVED" ? "已通过" : request.status === "WITHDRAWN" ? "已撤回" : "已拒绝"}
                    </span>
                    {request.status === "APPROVED" ? <p className="mt-1 text-xs text-emerald-700">该豁免将在下次选课时自动生效</p> : null}
                  </td>
                  <td className="text-sm text-slate-600">{new Date(request.submittedAt).toLocaleString()}</td>
                  <td className="text-sm text-slate-600">{request.decisionNote ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
