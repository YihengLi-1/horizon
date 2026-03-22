"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { apiFetch } from "@/lib/api";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    try {
      await apiFetch<{ message: string }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword })
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "密码重置失败");
    } finally {
      setLoading(false);
    }
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
        <Link href="/forgot-password" className="block text-sm font-medium text-[hsl(221_65%_42%)] hover:underline">
          返回重新申请
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="w-full space-y-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50 text-3xl">✓</div>
        <div>
          <p className="text-base font-semibold text-slate-800">密码已重置</p>
          <p className="mt-1 text-sm text-slate-500">现在可以使用新密码重新登录。</p>
        </div>
        <Link
          href="/login"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(221_83%_43%)] px-4 text-sm font-semibold text-white shadow-md transition hover:bg-[hsl(221_83%_38%)]"
        >
          返回登录
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-[hsl(221_65%_42%)]">地平线</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">重置密码</h2>
        <p className="mt-1 text-sm text-slate-500">新密码至少 8 位，且需包含大小写字母和数字。</p>
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
              autoFocus
              required
              minLength={8}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPw((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
              aria-label={showPw ? "隐藏密码" : "显示密码"}
            >
              {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">确认新密码</span>
          <input
            className="campus-input"
            type={showPw ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
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
              重置中…
            </>
          ) : (
            "确认重置密码"
          )}
        </button>
      </form>

      <div className="text-center">
        <Link href="/login" className="text-xs text-slate-400 hover:text-slate-600">返回登录</Link>
      </div>
    </div>
  );
}

function ResetPasswordFallback() {
  return (
    <div className="w-full space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-[hsl(221_65%_42%)]">地平线</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">重置密码</h2>
        <p className="mt-1 text-sm text-slate-500">正在加载重置链接，请稍候…</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        正在校验链接有效性。
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
