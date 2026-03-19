"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/config";

export default function VerifyPage() {
  const [token] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("token");
  });
  const [status, setStatus] = useState<"pending" | "ok" | "fail">("pending");
  const [message, setMessage] = useState("正在验证邮箱，请稍候…");

  useEffect(() => {
    let mounted = true;
    async function run() {
      if (!token) {
        setStatus("fail");
        setMessage("链接无效，验证令牌缺失。");
        return;
      }
      try {
        const res = await fetch(`${API_URL}/auth/verify-email?token=${encodeURIComponent(token)}`);
        if (!mounted) return;
        if (res.ok) {
          setStatus("ok");
          setMessage("邮箱验证成功！现在可以使用账户登录。");
        } else {
          setStatus("fail");
          setMessage("验证失败，链接可能已过期，请重新申请。");
        }
      } catch {
        if (mounted) { setStatus("fail"); setMessage("网络错误，请稍后重试。"); }
      }
    }
    void run();
    return () => { mounted = false; };
  }, [token]);

  return (
    <div className="w-full space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-[hsl(221_65%_42%)]">地平线</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">邮箱验证</h2>
      </div>

      <div className="flex flex-col items-center gap-4 py-4 text-center">
        {status === "pending" ? (
          <div className="size-12 animate-spin rounded-full border-4 border-slate-200 border-t-[hsl(221_83%_43%)]" />
        ) : status === "ok" ? (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50 text-3xl">✓</div>
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-200 bg-red-50 text-3xl">✗</div>
        )}
        <p className={`text-sm font-medium ${status === "ok" ? "text-emerald-700" : status === "fail" ? "text-red-700" : "text-slate-600"}`}>
          {message}
        </p>
      </div>

      {status === "ok" ? (
        <Link
          href="/login"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(221_83%_43%)] px-4 text-sm font-semibold text-white shadow-md transition hover:bg-[hsl(221_83%_38%)]"
        >
          立即登录
        </Link>
      ) : status === "fail" ? (
        <div className="flex flex-col gap-2 text-center text-sm">
          <Link href="/forgot" className="font-medium text-[hsl(221_65%_42%)] hover:underline">重新申请验证邮件</Link>
          <Link href="/login" className="text-slate-400 hover:text-slate-600">返回登录</Link>
        </div>
      ) : null}
    </div>
  );
}
