"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await apiFetch<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email })
      });
    } catch {
      // 始终返回同样的提示，避免泄露账户存在性
    } finally {
      setMessage("如果该邮箱已注册，重置链接已发送，请检查收件箱。");
      setLoading(false);
    }
  };

  return (
    <div className="w-full space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-[hsl(221_65%_42%)]">地平线</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">忘记密码</h2>
        <p className="mt-1 text-sm text-slate-500">输入注册邮箱，我们会向你发送重置密码链接。</p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">邮箱</span>
          <input
            type="email"
            className="campus-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@univ.edu"
            autoFocus
            required
          />
        </label>

        {message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </div>
        ) : null}

        <button
          disabled={loading}
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(221_83%_43%)] px-4 text-sm font-semibold text-white shadow-md transition hover:bg-[hsl(221_83%_38%)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
              发送中…
            </>
          ) : (
            "发送重置链接"
          )}
        </button>
      </form>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <Link href="/login" className="hover:text-slate-600">返回登录</Link>
        <Link href="/register" className="hover:text-slate-600">注册账号</Link>
      </div>
    </div>
  );
}
