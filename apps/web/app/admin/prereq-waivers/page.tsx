"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ConfirmDialog } from "@/components/confirm-dialog";

type RequestItem = {
  id: string;
  status: "SUBMITTED" | "APPROVED" | "REJECTED";
  reason: string;
  submittedAt: string;
  decisionNote?: string | null;
  student?: {
    email: string;
    studentId?: string | null;
    studentProfile?: { legalName?: string | null } | null;
  } | null;
  section?: {
    id: string;
    sectionCode: string;
    course: { code: string; title: string };
  } | null;
};

type ResponsePayload = {
  pending: RequestItem[];
  history: RequestItem[];
};

export default function AdminPrereqWaiversPage() {
  const [data, setData] = useState<ResponsePayload>({ pending: [], history: [] });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<ResponsePayload>("/admin/prereq-waivers");
      setData(result ?? { pending: [], history: [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载先修豁免审批失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function decide(requestId: string, status: "APPROVED" | "REJECTED") {
    setSavingId(requestId);
    setNotice("");
    setError("");
    try {
      await apiFetch(`/admin/prereq-waivers/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status, adminNote: notes[requestId] ?? "" })
      });
      setNotice(status === "APPROVED" ? "豁免申请已批准" : "豁免申请已拒绝");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "审批失败");
    } finally {
      setSavingId("");
    }
  }

  function confirmDecide(item: RequestItem, status: "APPROVED" | "REJECTED") {
    const name = item.student?.studentProfile?.legalName ?? item.student?.email ?? item.id;
    const courseLabel = item.section ? `${item.section.course.code} §${item.section.sectionCode}` : "该课程";
    setConfirmState({
      title: status === "APPROVED" ? "批准先修豁免" : "拒绝先修豁免",
      message: status === "APPROVED"
        ? `确认批准 ${name} 对 ${courseLabel} 的先修课豁免申请？`
        : `确认拒绝 ${name} 的先修课豁免申请？`,
      onConfirm: () => { setConfirmState(null); void decide(item.id, status); },
    });
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">审批中心</p>
        <h1 className="campus-title">先修豁免审批</h1>
        <p className="campus-subtitle">管理员终审先修课豁免请求，并把结果同步给学生。</p>
      </section>

      {notice ? <div className="campus-card border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
      {error ? <div className="campus-card border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="campus-card overflow-x-auto">
        <div className="border-b border-slate-100 px-4 py-3"><h2 className="text-base font-semibold text-slate-900">待审批</h2></div>
        <table className="campus-table min-w-[920px]">
          <thead><tr><th>学生</th><th>课程</th><th>申请理由</th><th>提交时间</th><th>管理员备注</th><th>操作</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">加载中…</td></tr>
            ) : data.pending.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">当前没有待审批的先修豁免</td></tr>
            ) : (
              data.pending.map((item) => (
                <tr key={item.id}>
                  <td><div className="font-semibold text-slate-900">{item.student?.studentProfile?.legalName ?? item.student?.email}</div><div className="text-xs text-slate-500">{item.student?.email} · {item.student?.studentId ?? "—"}</div></td>
                  <td><div className="font-semibold text-slate-900">{item.section?.course.code} §{item.section?.sectionCode}</div><div className="text-xs text-slate-500">{item.section?.course.title}</div></td>
                  <td className="max-w-[260px] text-sm text-slate-600">{item.reason}</td>
                  <td className="text-sm text-slate-600">{new Date(item.submittedAt).toLocaleString()}</td>
                  <td><textarea className="campus-input min-h-20 py-2" value={notes[item.id] ?? ""} onChange={(event) => setNotes((prev) => ({ ...prev, [item.id]: event.target.value }))} placeholder="可选：给学生的审批备注" /></td>
                  <td>
                    <div className="flex flex-col gap-2">
                      <button type="button" disabled={savingId === item.id} onClick={() => confirmDecide(item, "APPROVED")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">通过</button>
                      <button type="button" disabled={savingId === item.id} onClick={() => confirmDecide(item, "REJECTED")} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">拒绝</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <details className="campus-card p-4">
        <summary className="cursor-pointer text-base font-semibold text-slate-900">已处理历史</summary>
        <div className="mt-4 overflow-x-auto">
          <table className="campus-table min-w-[760px]">
            <thead><tr><th>学生</th><th>课程</th><th>状态</th><th>时间</th><th>备注</th></tr></thead>
            <tbody>
              {data.history.map((item) => (
                <tr key={item.id}>
                  <td>{item.student?.studentProfile?.legalName ?? item.student?.email}</td>
                  <td>{item.section?.course.code} §{item.section?.sectionCode}</td>
                  <td><span className={item.status === "APPROVED" ? "campus-chip chip-emerald" : "campus-chip chip-red"}>{item.status === "APPROVED" ? "已通过" : "已拒绝"}</span></td>
                  <td>{new Date(item.submittedAt).toLocaleString()}</td>
                  <td>{item.decisionNote ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
