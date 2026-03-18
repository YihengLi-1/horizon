"use client";

import { FormEvent, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";

type SendResult = {
  cohortYear: string;
  total: number;
  sent: number;
};

const currentYear = new Date().getFullYear();

export default function CohortMessagePage() {
  const [cohortYear, setCohortYear] = useState(String(currentYear));
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const toast = useToast();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!cohortYear.trim() || !subject.trim() || !body.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const res = await apiFetch<SendResult>("/admin/cohort-message", {
        method: "POST",
        body: JSON.stringify({ cohortYear: cohortYear.trim(), subject: subject.trim(), body: body.trim() })
      });
      setResult(res);
      toast(`已向 ${res.sent} 名学生发送消息`, "success");
      setSubject("");
      setBody("");
    } catch (err) {
      if (err instanceof ApiError) {
        toast(err.message, "error");
      } else {
        toast("消息发送失败", "error");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">管理员</p>
        <h1 className="font-heading text-3xl font-bold text-slate-900">群组消息</h1>
        <p className="mt-2 text-sm text-slate-600">
          向指定入学年份的所有学生批量发送通知邮件。
        </p>
      </section>

      <section className="campus-card p-6 space-y-5 max-w-xl">
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-5">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              入学年份（批次）
            </span>
            <input
              type="number"
              className="campus-input"
              value={cohortYear}
              onChange={(e) => setCohortYear(e.target.value)}
              min="2000"
              max={currentYear + 5}
              required
            />
            <p className="mt-1 text-xs text-slate-400">
              系统将向该年 1 月 1 日至 12 月 31 日期间创建账号的所有学生发送邮件。
            </p>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              邮件主题
            </span>
            <input
              type="text"
              className="campus-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="例：2024 级新学期通知"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              邮件正文
            </span>
            <textarea
              className="campus-input min-h-40"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="在此输入邮件内容…"
              required
            />
          </label>

          <button
            type="submit"
            disabled={sending || !cohortYear.trim() || !subject.trim() || !body.trim()}
            className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? "发送中…" : "发送群组邮件"}
          </button>
        </form>

        {result ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm">
            <p className="font-semibold text-green-800">发送完成</p>
            <p className="mt-1 text-green-700">
              {result.cohortYear} 级共找到 {result.total} 名学生，成功发送 {result.sent} 封邮件。
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
