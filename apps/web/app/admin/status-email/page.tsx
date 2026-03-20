"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };

type PreviewData = {
  recipientCount: number;
  enrollmentCount: number;
  sampleRecipients: { email: string; name: string | null }[];
};

const STATUS_OPTIONS = [
  { value: "ENROLLED", label: "在读" },
  { value: "COMPLETED", label: "已完课" },
  { value: "DROPPED", label: "已退课" },
  { value: "WAITLISTED", label: "候补" },
];

export default function StatusEmailPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [status, setStatus] = useState("ENROLLED");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ sent: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"compose" | "confirm">("compose");

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "学期列表加载失败"));
  }, []);

  async function loadPreview() {
    if (!subject.trim() || !body.trim()) {
      setError("请填写邮件主题和正文");
      return;
    }
    setPreviewLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status });
      if (termId) params.set("termId", termId);
      const data = await apiFetch<PreviewData>(`/admin/status-email/preview?${params}`);
      setPreview(data ?? null);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "预览失败");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function sendEmail() {
    setSending(true);
    setError("");
    try {
      const result = await apiFetch<{ sent: number; total: number }>("/admin/status-email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termId, status, subject, body }),
      });
      setSent(result ?? { sent: 0, total: 0 });
      setStep("compose");
      setSubject("");
      setBody("");
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">批量通知</p>
        <h1 className="campus-title">学生状态邮件</h1>
        <p className="campus-subtitle">向指定学期特定注册状态的学生批量发送邮件通知</p>
      </section>

      {sent ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✅ 已成功向 <strong>{sent.sent}</strong> 名学生发送邮件（共筛选 {sent.total} 人）
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {step === "compose" ? (
        <section className="campus-card p-6">
          <p className="font-semibold text-slate-800 mb-5">撰写邮件</p>
          <div className="space-y-4 max-w-xl">
            {/* Term filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">学期（可选）</label>
              <select className="campus-select w-full" value={termId} onChange={(e) => setTermId(e.target.value)}>
                <option value="">全部学期</option>
                {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {/* Status filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">注册状态</label>
              <select className="campus-select w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">邮件主题 <span className="text-red-500">*</span></label>
              <input
                className="campus-input w-full"
                placeholder="例：学期注册确认通知"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            {/* Body */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">邮件正文 <span className="text-red-500">*</span></label>
              <textarea
                className="campus-input w-full min-h-[120px] resize-y"
                placeholder="请输入邮件正文内容…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>

            <button
              type="button"
              onClick={loadPreview}
              disabled={previewLoading || !subject.trim() || !body.trim()}
              className="campus-btn-ghost disabled:opacity-40"
            >
              {previewLoading ? "预览中…" : "预览收件人 →"}
            </button>
          </div>
        </section>
      ) : preview ? (
        <section className="campus-card p-6 space-y-5">
          <div>
            <p className="font-semibold text-slate-800 text-lg mb-1">发送确认</p>
            <p className="text-sm text-slate-500">请确认以下信息后发送</p>
          </div>

          {/* Summary */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="campus-kpi">
              <p className="campus-kpi-label">收件人数</p>
              <p className="campus-kpi-value text-blue-600">{preview.recipientCount}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">涉及注册记录</p>
              <p className="campus-kpi-value">{preview.enrollmentCount}</p>
            </div>
          </div>

          {/* Sample recipients */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">收件人预览（前 5 名）</p>
            <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
              {preview.sampleRecipients.map((r) => (
                <div key={r.email} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="size-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
                    {(r.name ?? r.email).slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{r.name ?? "—"}</p>
                    <p className="text-xs text-slate-500">{r.email}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Email preview */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">邮件内容预览</p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-bold text-slate-800 mb-2">主题：{subject}</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{body}</p>
            </div>
          </div>

          {/* Warning */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            ⚠ 此操作将向 <strong>{preview.recipientCount}</strong> 名学生发送真实邮件，请确认无误后再继续。
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => { setStep("compose"); setPreview(null); }} className="campus-btn-ghost text-sm">
              ← 返回修改
            </button>
            <button
              type="button"
              onClick={sendEmail}
              disabled={sending}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {sending ? "发送中…" : `确认发送 (${preview.recipientCount} 人)`}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
