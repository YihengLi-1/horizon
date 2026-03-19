"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ConfirmDialog } from "@/components/confirm-dialog";

type PendingOverload = {
  id: string;
  studentId: string;
  studentEmail: string;
  studentName: string;
  termId: string;
  termName: string;
  sectionId: string;
  sectionCode: string;
  courseCode: string;
  courseTitle: string;
  currentCredits: number;
  requestedCredits: number;
  submittedAt: string;
};

export default function PendingOverloadsPage() {
  const [rows, setRows] = useState<PendingOverload[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<PendingOverload[]>("/admin/pending-overloads");
      setRows(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载超学分审批失败");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

  async function decide(enrollmentId: string, approve: boolean) {
    setSavingId(enrollmentId);
    setNotice("");
    setError("");
    try {
      await apiFetch(`/admin/pending-overloads/${enrollmentId}`, {
        method: "PATCH",
        body: JSON.stringify({ approve })
      });
      setNotice(approve ? "超学分申请已批准" : "超学分申请已拒绝");
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "审批失败");
    } finally {
      setSavingId("");
    }
  }

  function confirmDecide(row: PendingOverload, approve: boolean) {
    setConfirmState({
      title: approve ? "批准超学分申请" : "拒绝超学分申请",
      message: approve
        ? `确认批准 ${row.studentName} 注册 ${row.courseCode} §${row.sectionCode}？该学生当前已有 ${row.currentCredits} 学分。`
        : `确认拒绝 ${row.studentName} 的超学分申请？`,
      onConfirm: () => { setConfirmState(null); void decide(row.id, approve); },
    });
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">超载审批</p>
        <h1 className="campus-title">超学分审批</h1>
        <p className="campus-subtitle">学生超出学分上限后，注册会进入待审批状态，由管理员统一处理。</p>
      </section>

      {notice ? <div className="campus-card border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
      {error ? <div className="campus-card border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="campus-card overflow-x-auto">
        <table className="campus-table min-w-[960px]">
          <thead>
            <tr>
              <th>学生</th>
              <th>课程</th>
              <th>当前学分</th>
              <th>申请学分</th>
              <th>学期</th>
              <th>提交时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">加载中…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">当前没有待审批的超学分申请</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td><div className="font-semibold text-slate-900">{row.studentName}</div><div className="text-xs text-slate-500">{row.studentEmail}</div></td>
                  <td><div className="font-semibold text-slate-900">{row.courseCode} §{row.sectionCode}</div><div className="text-xs text-slate-500">{row.courseTitle}</div></td>
                  <td className="text-sm text-slate-700">{row.currentCredits}</td>
                  <td className="text-sm text-slate-700">+{row.requestedCredits}</td>
                  <td className="text-sm text-slate-700">{row.termName}</td>
                  <td className="text-sm text-slate-600">{new Date(row.submittedAt).toLocaleString()}</td>
                  <td>
                    <div className="flex gap-2">
                      <button type="button" disabled={savingId === row.id} onClick={() => confirmDecide(row, true)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">
                        {savingId === row.id ? "处理中…" : "批准"}
                      </button>
                      <button type="button" disabled={savingId === row.id} onClick={() => confirmDecide(row, false)} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
                        {savingId === row.id ? "处理中…" : "拒绝"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

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
