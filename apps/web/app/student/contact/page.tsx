"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";
import { apiFetch } from "@/lib/api";

export default function ContactPage() {
  const toast = useToast();
  const [form, setForm] = useState({ subject: "", message: "", category: "registration" });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSending(true);
    try {
      await apiFetch("/students/contact", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setSent(true);
      toast("您的请求已提交给注册/支持团队，我们将在 2 个工作日内回复", "success");
    } catch (ex) {
      const message = ex instanceof Error ? ex.message : "发送失败";
      setError(message);
      toast(message, "error");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="campus-page flex min-h-[60vh] items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50 text-3xl">
            ✉️
          </div>
          <p className="text-lg font-semibold text-slate-800 dark:text-white">Request Submitted</p>
          <p className="text-sm text-slate-500">您的请求已提交给注册/支持团队，我们将在 2 个工作日内回复。</p>
          <button type="button" onClick={() => setSent(false)} className="text-sm font-medium text-blue-600 hover:underline">
            Send another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Registrar / Support Request</h1>
        <p className="mt-1 text-sm text-slate-500">Send a request to the registrar or support team for follow-up.</p>
      </div>
      <form onSubmit={submit} className="campus-card max-w-lg space-y-4 p-6">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Category</label>
          <select
            value={form.category}
            onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
            className="campus-select w-full"
          >
            <option value="registration">课程注册问题</option>
            <option value="grades">成绩问题</option>
            <option value="technical">技术问题</option>
            <option value="other">其他</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Subject</label>
          <input
            required
            value={form.subject}
            onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
            className="campus-input w-full"
            placeholder="Brief subject line"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Message</label>
          <textarea
            required
            rows={6}
            value={form.message}
            onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
            className="campus-input w-full"
            placeholder="Describe your question or concern in detail…"
          />
        </div>
        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={sending}
          className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {sending ? "Sending…" : "Send Message"}
        </button>
      </form>
    </div>
  );
}
