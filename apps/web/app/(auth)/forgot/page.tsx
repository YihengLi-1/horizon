"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => {
      setCooldown((v) => (v <= 1 ? 0 : v - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  const send = async () => {
    setError(""); setLoading(true);
    try {
      const data = await apiFetch<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(data.message ?? "重置密码链接已发送。");
      setSent(true); setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally { setLoading(false); }
  };

  const onSubmit = async (e: FormEvent) => { e.preventDefault(); await send(); };

  return (
    <div className="w-full space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-[hsl(221_65%_42%)]">地平线</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">忘记密码</h2>
        <p className="mt-1 text-sm text-slate-500">重置链接将发送至账户绑定的邮箱。</p>
      </div>

      {sent ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50 text-3xl">✉️</div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-slate-800">请查收邮件</p>
            <p className="text-sm text-slate-500">{message || "重置链接已发送，15 分钟内有效。"}</p>
          </div>
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <button
            disabled={loading || cooldown > 0}
            onClick={() => void send()}
            type="button"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(221_83%_43%)] px-4 text-sm font-semibold text-white shadow-md transition hover:bg-[hsl(221_83%_38%)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (<><span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />发送中…</>) : cooldown > 0 ? `${cooldown}s 后可重发` : "重新发送"}
          </button>
          <Link href="/login" className="block text-sm font-medium text-[hsl(221_65%_42%)] hover:underline">← 返回登录</Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">账户邮箱</span>
            <input
              type="email"
              className="campus-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@univ.edu"
              required
              autoFocus
            />
          </label>
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          <button
            disabled={loading}
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(221_83%_43%)] px-4 text-sm font-semibold text-white shadow-md transition hover:bg-[hsl(221_83%_38%)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (<><span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />发送中…</>) : "发送重置链接"}
          </button>
        </form>
      )}

      <div className="flex items-center justify-between text-xs text-slate-400">
        <Link href="/login" className="hover:text-slate-600">← 返回登录</Link>
        <Link href="/register" className="hover:text-slate-600">注册账号</Link>
      </div>
    </div>
  );
}
