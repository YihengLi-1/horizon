"use client";

/**
 * Admin Term Closeout
 * End-of-semester batch operations:
 *  - ENROLLED → COMPLETED (finalize course completions)
 *  - WAITLISTED → DROPPED (clear pending waitlist)
 *  - PENDING_APPROVAL → DROPPED (remove stale pending requests)
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string; endDate: string };

type CloseoutPreview = {
  termId: string;
  termName: string;
  enrolled: number;
  waitlisted: number;
  pendingApproval: number;
  completed: number;
};

type CloseoutResult = {
  termId: string;
  termName: string;
  action: string;
  updated: number;
};

const ACTIONS = [
  {
    id: "enroll_to_completed" as const,
    label: "ENROLLED → COMPLETED",
    desc: "将所有已选课学生的状态标记为已完成（学期结束后使用）",
    icon: "✅",
    cls: "border-emerald-200 bg-emerald-50 hover:bg-emerald-100",
    iconBg: "bg-emerald-100 text-emerald-700",
    btnCls: "bg-emerald-600 hover:bg-emerald-700",
    count: (p: CloseoutPreview) => p.enrolled
  },
  {
    id: "waitlist_to_dropped" as const,
    label: "WAITLISTED → DROPPED",
    desc: "清除候补名单，将未能选上课的学生状态设为已退课",
    icon: "🗑️",
    cls: "border-amber-200 bg-amber-50 hover:bg-amber-100",
    iconBg: "bg-amber-100 text-amber-700",
    btnCls: "bg-amber-600 hover:bg-amber-700",
    count: (p: CloseoutPreview) => p.waitlisted
  },
  {
    id: "pending_to_dropped" as const,
    label: "PENDING_APPROVAL → DROPPED",
    desc: "将过期的待审批注册记录设为退课，清理积压审批队列",
    icon: "🚫",
    cls: "border-red-200 bg-red-50 hover:bg-red-100",
    iconBg: "bg-red-100 text-red-700",
    btnCls: "bg-red-600 hover:bg-red-700",
    count: (p: CloseoutPreview) => p.pendingApproval
  }
];

export default function AdminCloseoutPage() {
  const [terms, setTerms]           = useState<Term[]>([]);
  const [termId, setTermId]         = useState("");
  const [preview, setPreview]       = useState<CloseoutPreview | null>(null);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [running, setRunning]       = useState<string | null>(null);
  const [results, setResults]       = useState<CloseoutResult[]>([]);
  const [confirmAction, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms")
      .then((data) => {
        const sorted = [...(data ?? [])].sort(
          (a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime()
        );
        setTerms(sorted);
        if (sorted.length > 0) setTermId(sorted[0].id);
      })
      .catch(() => {});
  }, []);

  const loadPreview = useCallback(async () => {
    if (!termId) return;
    setLoadingPrev(true);
    setPreview(null);
    try {
      const data = await apiFetch<CloseoutPreview>(`/admin/closeout/preview?termId=${termId}`);
      setPreview(data);
    } catch { /* ignore */ }
    finally { setLoadingPrev(false); }
  }, [termId]);

  useEffect(() => { void loadPreview(); }, [loadPreview]);

  async function runAction(action: "enroll_to_completed" | "waitlist_to_dropped" | "pending_to_dropped") {
    if (!termId) return;
    setRunning(action);
    setConfirm(null);
    try {
      const res = await apiFetch<CloseoutResult>("/admin/closeout/run", {
        method: "POST",
        body: JSON.stringify({ termId, action })
      });
      setResults((prev) => [res, ...prev]);
      await loadPreview(); // refresh counts
    } catch { /* ignore */ }
    finally { setRunning(null); }
  }

  const selectedTerm = terms.find((t) => t.id === termId);
  const isPast = selectedTerm ? new Date(selectedTerm.endDate) < new Date() : false;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Admin Operations</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">学期结课处理</h1>
        <p className="mt-1 text-sm text-slate-500">
          批量更新学生注册状态，完成学期结算
        </p>
      </section>

      {/* Term selector */}
      <div className="campus-card p-4 flex items-center gap-3">
        <label className="text-sm font-semibold text-slate-700 shrink-0">选择学期：</label>
        <select
          className="campus-select flex-1"
          value={termId}
          onChange={(e) => setTermId(e.target.value)}
        >
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({new Date(t.endDate) < new Date() ? "已结束" : "进行中"})
            </option>
          ))}
        </select>
        {selectedTerm && !isPast && (
          <span className="campus-chip border-amber-200 bg-amber-50 text-amber-700 text-xs shrink-0">
            ⚠️ 学期未结束
          </span>
        )}
      </div>

      {/* Preview counts */}
      {preview && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="campus-kpi">
            <p className="campus-kpi-label">ENROLLED</p>
            <p className={`campus-kpi-value ${preview.enrolled > 0 ? "text-indigo-600" : "text-slate-400"}`}>
              {preview.enrolled}
            </p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">WAITLISTED</p>
            <p className={`campus-kpi-value ${preview.waitlisted > 0 ? "text-amber-600" : "text-slate-400"}`}>
              {preview.waitlisted}
            </p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">PENDING</p>
            <p className={`campus-kpi-value ${preview.pendingApproval > 0 ? "text-blue-600" : "text-slate-400"}`}>
              {preview.pendingApproval}
            </p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">COMPLETED</p>
            <p className="campus-kpi-value text-emerald-600">{preview.completed}</p>
          </div>
        </div>
      )}

      {loadingPrev && (
        <div className="campus-card px-6 py-10 text-center">
          <p className="text-sm text-slate-500">⏳ 加载预览数据…</p>
        </div>
      )}

      {/* Action cards */}
      {preview && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase text-slate-500">批量操作</h2>
          {ACTIONS.map((act) => {
            const count = act.count(preview);
            const isRunning = running === act.id;
            const isConfirming = confirmAction === act.id;
            return (
              <div key={act.id} className={`campus-card p-4 border transition ${act.cls}`}>
                <div className="flex items-start gap-4">
                  <div className={`shrink-0 flex items-center justify-center size-10 rounded-xl text-lg ${act.iconBg}`}>
                    {act.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold text-slate-900 font-mono">{act.label}</h3>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${count > 0 ? "bg-slate-200 text-slate-700" : "bg-slate-100 text-slate-400"}`}>
                        {count} 条
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{act.desc}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {isConfirming ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setConfirm(null)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={() => void runAction(act.id)}
                          disabled={isRunning}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${act.btnCls}`}
                        >
                          {isRunning ? "执行中…" : "确认执行"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={count === 0 || isRunning}
                        onClick={() => setConfirm(act.id)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 ${act.btnCls}`}
                      >
                        {isRunning ? "执行中…" : "执行"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Operation history */}
      {results.length > 0 && (
        <div className="campus-card p-4 space-y-2">
          <h3 className="text-xs font-bold uppercase text-slate-500">本次操作记录</h3>
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
              <span className="text-emerald-600">✅</span>
              <span className="font-semibold text-slate-800">{r.termName}</span>
              <span className="font-mono text-xs text-slate-600">{r.action}</span>
              <span className="ml-auto text-emerald-700 font-bold">{r.updated} 条已更新</span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        ⚠️ 所有操作会记录到审计日志，且<strong>不可撤销</strong>。请在确认无误后再执行。
      </div>
    </div>
  );
}
