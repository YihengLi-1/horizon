"use client";

import { useState } from "react";

export default function ContactPage() {
  const [form, setForm] = useState({ subject: "", message: "", category: "general" });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSent(true);
    setSending(false);
  }

  if (sent) {
    return (
      <div className="campus-page flex min-h-[60vh] items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50 text-3xl">
            ✉️
          </div>
          <p className="text-lg font-semibold text-slate-800 dark:text-white">Message Sent!</p>
          <p className="text-sm text-slate-500">Your advisor will respond within 1-2 business days.</p>
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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Contact Advisor</h1>
        <p className="mt-1 text-sm text-slate-500">Send a message to your academic advisor</p>
      </div>
      <form onSubmit={submit} className="campus-card max-w-lg space-y-4 p-6">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Category</label>
          <select
            value={form.category}
            onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
            className="campus-select w-full"
          >
            <option value="general">General Inquiry</option>
            <option value="grades">Grades / Appeals</option>
            <option value="registration">Registration Help</option>
            <option value="graduation">Graduation Requirements</option>
            <option value="other">Other</option>
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
