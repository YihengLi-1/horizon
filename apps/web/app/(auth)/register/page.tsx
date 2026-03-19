"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { apiFetch } from "@/lib/api";

function getStrength(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}
const STRENGTH_LABEL = ["", "极弱", "弱", "一般", "良好", "强"];
const STRENGTH_COLOR = ["", "text-red-600", "text-red-500", "text-amber-600", "text-blue-600", "text-emerald-600"];
const STRENGTH_BG    = ["", "bg-red-400", "bg-red-400", "bg-amber-400", "bg-blue-400", "bg-emerald-400"];

export default function RegisterPage() {
  const [form, setForm] = useState({ email: "", studentId: "", legalName: "", inviteCode: "", password: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [strength, setStrength] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailExists, setEmailExists] = useState(false);

  const pwMatch = confirmPassword.length > 0 && confirmPassword === form.password;
  const pwMismatch = confirmPassword.length > 0 && confirmPassword !== form.password;

  const checkEmail = async () => {
    const email = form.email.trim();
    if (!email || !email.includes("@")) { setEmailExists(false); return; }
    setCheckingEmail(true);
    try {
      const data = await apiFetch<{ exists: boolean }>(`/auth/check-email?email=${encodeURIComponent(email)}`);
      setEmailExists(Boolean(data.exists));
    } catch { setEmailExists(false); }
    finally { setCheckingEmail(false); }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    if (form.password !== confirmPassword) { setError("两次输入的密码不一致。"); return; }
    if (form.password.length < 8) { setError("密码至少需要 8 位。"); return; }
    setLoading(true);
    try {
      await apiFetch("/auth/register", { method: "POST", body: JSON.stringify(form) });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally { setLoading(false); }
  };

  if (done) {
    return (
      <div className="w-full space-y-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50 text-3xl">✉️</div>
        <div>
          <p className="text-base font-semibold text-slate-800">注册成功！</p>
          <p className="mt-1 text-sm text-slate-500">验证邮件已发送至 {form.email}，请完成邮箱验证后再登录。</p>
        </div>
        <Link href="/login" className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[hsl(221_83%_43%)] text-sm font-semibold text-white shadow-md transition hover:bg-[hsl(221_83%_38%)]">
          返回登录
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-[hsl(221_65%_42%)]">地平线</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">创建学生账号</h2>
        <p className="mt-1 text-sm text-slate-500">需要邀请码与邮箱验证。</p>
      </div>

      <form className="space-y-3" onSubmit={onSubmit}>
        {/* 真实姓名 */}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">真实姓名</span>
          <input className="campus-input" placeholder="张三" value={form.legalName}
            onChange={(e) => setForm((p) => ({ ...p, legalName: e.target.value }))} required />
        </label>

        {/* 学号 + 邀请码 */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">学号</span>
            <input className="campus-input" placeholder="S4001" value={form.studentId}
              onChange={(e) => setForm((p) => ({ ...p, studentId: e.target.value }))} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">邀请码</span>
            <input className="campus-input" placeholder="OPEN-2026" value={form.inviteCode}
              onChange={(e) => setForm((p) => ({ ...p, inviteCode: e.target.value }))} required />
          </label>
        </div>

        {/* 邮箱 */}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">邮箱</span>
          <input type="email" className="campus-input" placeholder="student@example.edu"
            value={form.email}
            onChange={(e) => { setForm((p) => ({ ...p, email: e.target.value })); setEmailExists(false); }}
            onBlur={() => void checkEmail()} required />
          {checkingEmail ? <p className="mt-1 text-xs text-slate-400">验证中…</p>
            : emailExists ? <p className="mt-1 text-xs font-medium text-amber-600">此邮箱已注册，请直接登录</p>
            : null}
        </label>

        {/* 密码 */}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">密码</span>
          <div className="relative">
            <input className="campus-input pr-10" type={showPw ? "text" : "password"}
              placeholder="设置安全密码" value={form.password}
              onChange={(e) => { const v = e.target.value; setForm((p) => ({ ...p, password: v })); setStrength(getStrength(v)); }}
              required />
            <button type="button" tabIndex={-1} onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={showPw ? "隐藏密码" : "显示密码"}>
              {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {form.password ? (
            <div className="mt-1.5 space-y-1">
              <div className="flex gap-1">
                {[1,2,3,4,5].map((s) => (
                  <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${s <= strength ? STRENGTH_BG[strength] : "bg-slate-200"}`} />
                ))}
              </div>
              {strength > 0 ? <p className={`text-xs font-medium ${STRENGTH_COLOR[strength]}`}>{STRENGTH_LABEL[strength]}</p> : null}
            </div>
          ) : null}
        </label>

        {/* 确认密码 */}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">确认密码</span>
          <div className="relative">
            <input
              className={`campus-input pr-10 ${pwMismatch ? "border-red-400" : pwMatch ? "border-emerald-400" : ""}`}
              type={showConfirm ? "text" : "password"} placeholder="再次输入密码"
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            <button type="button" tabIndex={-1} onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label={showConfirm ? "隐藏密码" : "显示密码"}>
              {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {pwMismatch ? <p className="mt-1 text-xs font-medium text-red-600">两次密码不一致</p>
            : pwMatch ? <p className="mt-1 text-xs font-medium text-emerald-600">密码一致 ✓</p>
            : null}
        </label>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        <button disabled={loading} type="submit"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(221_83%_43%)] px-4 text-sm font-semibold text-white shadow-md transition hover:bg-[hsl(221_83%_38%)] disabled:cursor-not-allowed disabled:opacity-70">
          {loading ? (<><span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />注册中…</>) : "创建账户"}
        </button>
      </form>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>已有账户？</span>
        <Link href="/login" className="font-medium text-[hsl(221_65%_42%)] hover:underline">立即登录</Link>
      </div>
    </div>
  );
}
