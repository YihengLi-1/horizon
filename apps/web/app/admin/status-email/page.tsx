"use client";

/**
 * Admin Bulk Email by Enrollment Status
 * Send targeted emails to all students in a given enrollment status + term.
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };
type Preview = {
  recipientCount: number;
  enrollmentCount: number;
  sampleRecipients: { email: string; name: string | null }[];
};

const STATUSES = ["ENROLLED", "WAITLISTED", "PENDING_APPROVAL", "COMPLETED", "DROPPED"];

const STATUS_DESC: Record<string, string> = {
  ENROLLED:          "所有当前已选课学生",
  WAITLISTED:        "所有候补名单学生",
  PENDING_APPROVAL:  "所有等待审批的注册申请",
  COMPLETED:         "所有课程已完成学生",
  DROPPED:           "所有退课学生"
};

export default function StatusEmailPage() {
  const [terms, setTerms]           = useState<Term[]>([]);
  const [termId, setTermId]         = useState("");
  const [status, setStatus]         = useState("ENROLLED");
  const [subject, setSubject]       = useState("");
  const [body, setBody]             = useState("");
  const [preview, setPreview]       = useState<Preview | null>(null);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [sending, setSending]       = useState(false);
  const [result, setResult]         = useState<{ sent: number; total: number } | null>(null);
  const [confirmed, setConfirmed]   = useState(false);

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms")
      .then((data) => setTerms(data ?? []))
      .catch(() => {});
  }, []);

  const loadPreview = useCallback(async () => {
    setLoadingPrev(true);
    setPreview(null);
    setResult(null);
    setConfirmed(false);
    try {
      const params = new URLSearchParams({ status });
      if (termId) params.set("termId", termId);
      const data = await apiFetch<Preview>(`/admin/status-email/preview?${params}`);
      setPreview(data);
    } catch { /* ignore */ }
    finally { setLoadingPrev(false); }
  }, [termId, status]);

  useEffect(() => { void loadPreview(); }, [loadPreview]);

  async function send() {
    if (!subject.trim() || !body.trim() || !preview) return;
    setSending(true);
    setResult(null);
    try {
      const res = await apiFetch<{ sent: number; total: number }>("/admin/status-email/send", {
        method: "POST",
        body: JSON.stringify({ termId: termId || undefined, status, subject, body })
      });
      setResult(res);
      setConfirmed(false);
    } catch { /* ignore */ }
    finally { setSending(false); }
  }

  const canSend = subject.trim() && body.trim() && preview && preview.recipientCount > 0;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Communications</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">状态定向邮件</h1>
        <p className="mt-1 text-sm text-slate-500">
          向特定注册状态的学生批量发送邮件通知
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Config */}
        <div className="lg:col-span-3 space-y-4">
          <div className="campus-card p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">收件人筛选</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">学期</label>
                <select
                  className="campus-select w-full"
                  value={termId}
                  onChange={(e) => setTermId(e.target.value)}
                >
                  <option value="">所有学期</option>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">注册状态</label>
                <select
                  className="campus-select w-full"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-500">{STATUS_DESC[status]}</p>
          </div>

          <div className="campus-card p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900">邮件内容</h2>
            <input
              className="campus-input w-full"
              placeholder="邮件主题…"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <textarea
              className="campus-input w-full resize-none"
              rows={6}
              placeholder="邮件正文（支持换行）…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {/* Send button */}
          {!confirmed ? (
            <button
              type="button"
              disabled={!canSend || sending}
              onClick={() => setConfirmed(true)}
              className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              发送给 {preview?.recipientCount ?? 0} 名学生 →
            </button>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-800">
                ⚠️ 确认发送给 <strong>{preview?.recipientCount}</strong> 名学生？此操作不可撤销。
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmed(false)}
                  className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => void send()}
                  className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {sending ? "发送中…" : "✓ 确认发送"}
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              ✅ 已成功发送 {result.sent}/{result.total} 封邮件
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div className="lg:col-span-2 space-y-4">
          <div className="campus-card p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase text-slate-500">收件人预览</h3>
            {loadingPrev ? (
              <p className="text-sm text-slate-400">加载中…</p>
            ) : preview ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="campus-kpi">
                    <p className="campus-kpi-label">收件人数</p>
                    <p className="campus-kpi-value text-indigo-600">{preview.recipientCount}</p>
                  </div>
                  <div className="campus-kpi">
                    <p className="campus-kpi-label">注册条数</p>
                    <p className="campus-kpi-value">{preview.enrollmentCount}</p>
                  </div>
                </div>
                {preview.sampleRecipients.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 mb-2">示例收件人：</p>
                    <div className="space-y-1.5">
                      {preview.sampleRecipients.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs rounded bg-slate-50 px-2 py-1">
                          <span className="size-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {(r.name ?? r.email).slice(0, 1).toUpperCase()}
                          </span>
                          <span className="truncate text-slate-700">{r.name ?? ""}</span>
                          <span className="text-slate-400 truncate">{r.email}</span>
                        </div>
                      ))}
                      {preview.recipientCount > 5 && (
                        <p className="text-xs text-slate-400 text-center">
                          …以及 {preview.recipientCount - 5} 名学生
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">选择状态后自动预览</p>
            )}
          </div>

          <div className="campus-card p-4">
            <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">使用建议</h3>
            <div className="space-y-2 text-xs text-slate-600">
              {[
                { status: "ENROLLED", tip: "通知已选课学生重要日期或变更" },
                { status: "WAITLISTED", tip: "告知候补学生当前等待情况" },
                { status: "PENDING_APPROVAL", tip: "催促提交缺少的材料" },
                { status: "COMPLETED", tip: "发送学期末总结和下学期信息" }
              ].map(({ status: s, tip }) => (
                <div key={s} className="flex gap-2">
                  <span className="font-mono font-bold text-indigo-600 shrink-0">{s.slice(0, 3)}</span>
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
