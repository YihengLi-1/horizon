"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { apiFetch } from "@/lib/api";

function passwordStrength(pw: string): { score: number; label: string; color: string; bg: string } {
  if (!pw) return { score: 0, label: "", color: "", bg: "bg-slate-200" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "弱", color: "text-red-600", bg: "bg-red-400" };
  if (score <= 2) return { score, label: "一般", color: "text-amber-600", bg: "bg-amber-400" };
  if (score <= 3) return { score, label: "良好", color: "text-blue-600", bg: "bg-blue-400" };
  return { score, label: score <= 4 ? "强" : "非常强", color: "text-emerald-600", bg: "bg-emerald-400" };
}

export default function ResetPage() {
  const [token] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") || "";
  });
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const pwStrength = passwordStrength(newPassword);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      await apiFetch<{ message: string }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置失败");
    } finally { setLoading(false); }
  };

  if (!token) {
    return (
      <div className="w-full space-y-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-[hsl(221_65%_42%)]">地平线</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-900">重置密码</h2>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          链接无效或已过期，请重新申请密码重置。
        </div>
        <Link href="/forgot" className="block text-sm font-medium text-[hsl(221_65%_42%)] hover:underline">← 重新申请</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="w-full space-y-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50 text-3xl">✓</div>
        <div>
          <p className="text-base font-semibold text-slate-800">密码已重置</p>
          <p className="mt-1 text-sm text-slate-500">现在可以使用新密码登录。</p>
        </div>
        <Link
          href="/login"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(221_83%_43%)] px-4 text-sm font-semibold text-white shadow-md transition hover:bg-[hsl(221_83%_38%)]"
        >
          使用新密码登录
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-[hsl(221_65%_42%)]">地平线</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">重置密码</h2>
        <p className="mt-1 text-sm text-slate-500">请输入您的新密码（至少 8 位）。</p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">新密码</span>
          <div className="relative">
            <input
              className="campus-input pr-10"
              type={showPw ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              autoFocus
            />
            <button
              type="button" tabIndex={-1}
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={showPw ? "隐藏密码" : "显示密码"}
            >
              {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {newPassword ? (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((seg) => (
                  <div key={seg} className={`h-1.5 flex-1 rounded-full transition-colors ${seg <= pwStrength.score ? pwStrength.bg : "bg-slate-200"}`} />
                ))}
              </div>
              {pwStrength.label ? <p className={`text-xs font-medium ${pwStrength.color}`}>{pwStrength.label}</p> : null}
            </div>
          ) : null}
        </label>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        <button
          disabled={loading}
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(221_83%_43%)] px-4 text-sm font-semibold text-white shadow-md transition hover:bg-[hsl(221_83%_38%)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? (<><span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />重置中…</>) : "确认重置密码"}
        </button>
      </form>

      <div className="text-center">
        <Link href="/login" className="text-xs text-slate-400 hover:text-slate-600">返回登录</Link>
      </div>
    </div>
  );
}
