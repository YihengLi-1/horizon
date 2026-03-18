"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type CloseoutPreview = {
  termId: string;
  termName: string;
  enrolledCount: number;
  waitlistedCount: number;
  pendingApprovalCount: number;
  completedCount: number;
  droppedCount: number;
};

type Term = { id: string; name: string };

type Action = "enroll_to_completed" | "waitlist_to_dropped" | "pending_to_dropped";

const ACTION_CONFIG: Record<Action, { label: string; description: string; warning: string; color: string }> = {
  enroll_to_completed: {
    label: "在读 → 已完成",
    description: "将当前所有 ENROLLED 状态的注册转为 COMPLETED",
    warning: "此操作将把所有在读学生标记为课程完成状态",
    color: "text-emerald-700",
  },
  waitlist_to_dropped: {
    label: "候补 → 已退课",
    description: "将所有 WAITLISTED 状态转为 DROPPED",
    warning: "候补学生将被标记为退课",
    color: "text-amber-700",
  },
  pending_to_dropped: {
    label: "待审批 → 已退课",
    description: "将所有 PENDING_APPROVAL 状态转为 DROPPED",
    warning: "所有待审批申请将被拒绝",
    color: "text-red-700",
  },
};

export default function CloseoutPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [preview, setPreview] = useState<CloseoutPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState<Action | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirm, setConfirm] = useState<Action | null>(null);

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!termId) { setPreview(null); return; }
    setLoading(true);
    setError(""); setSuccess("");
    void apiFetch<CloseoutPreview>(`/admin/closeout/preview?termId=${termId}`)
      .then((d) => setPreview(d))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId]);

  async function execute(action: Action) {
    if (!termId) return;
    setExecuting(action);
    setError(""); setSuccess("");
    try {
      await apiFetch(`/admin/closeout`, { method: "POST", body: JSON.stringify({ termId, action }) });
      setSuccess(`操作 "${ACTION_CONFIG[action].label}" 已完成`);
      setConfirm(null);
      // Refresh preview
      const updated = await apiFetch<CloseoutPreview>(`/admin/closeout/preview?termId=${termId}`);
      setPreview(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setExecuting(null);
    }
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学期管理</p>
        <h1 className="campus-hero-title">学期关闭操作</h1>
        <p className="campus-hero-subtitle">批量处理学期末的注册状态转换，请谨慎操作</p>
      </section>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        ⚠ 以下操作不可撤销，请确认已备份数据，并仔细核对操作前后的人数变化。
      </div>

      <div className="campus-toolbar">
        <select className="campus-select w-48" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">选择学期…</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 font-semibold">✓ {success}</div> : null}

      {!termId ? (
        <div className="campus-card p-10 text-center text-slate-400">请先选择要关闭的学期</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : preview ? (
        <>
          <section className="grid gap-3 sm:grid-cols-5">
            {[
              { label: "在读", count: preview.enrolledCount, color: "text-blue-600" },
              { label: "候补", count: preview.waitlistedCount, color: "text-amber-600" },
              { label: "待审批", count: preview.pendingApprovalCount, color: "text-purple-600" },
              { label: "已完成", count: preview.completedCount, color: "text-emerald-600" },
              { label: "已退课", count: preview.droppedCount, color: "text-slate-400" },
            ].map((s) => (
              <div key={s.label} className="campus-kpi">
                <p className="campus-kpi-label">{s.label}</p>
                <p className={`campus-kpi-value ${s.color}`}>{s.count}</p>
              </div>
            ))}
          </section>

          <div className="space-y-3">
            {(Object.entries(ACTION_CONFIG) as [Action, typeof ACTION_CONFIG[Action]][]).map(([action, cfg]) => (
              <div key={action} className="campus-card p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className={`font-bold text-base ${cfg.color}`}>{cfg.label}</p>
                    <p className="text-sm text-slate-600 mt-0.5">{cfg.description}</p>
                    <p className="text-xs text-slate-400 mt-1">{cfg.warning}</p>
                  </div>
                  {confirm === action ? (
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void execute(action)}
                        disabled={executing === action}
                        className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100 transition disabled:opacity-40"
                      >
                        {executing === action ? "处理中…" : "确认执行"}
                      </button>
                      <button type="button" onClick={() => setConfirm(null)} className="campus-btn-ghost text-sm">取消</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirm(action)}
                      disabled={!!executing}
                      className="campus-btn-ghost shrink-0 disabled:opacity-40"
                    >
                      执行操作
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
