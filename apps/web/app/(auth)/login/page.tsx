"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { ApiError, apiFetch } from "@/lib/api";

type LoginResult = {
  role: "STUDENT" | "FACULTY" | "ADVISOR" | "ADMIN";
};

const SHOW_DEMO_ACCOUNTS = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO === "true";
const DEMO_STUDENT_ID = process.env.NEXT_PUBLIC_DEMO_STUDENT_ID || "student1@univ.edu";
const DEMO_STUDENT_PASSWORD = process.env.NEXT_PUBLIC_DEMO_STUDENT_PASSWORD || "Student1234!";
const DEMO_ADMIN_EMAIL = process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL || "admin@univ.edu";
const DEMO_ADMIN_PASSWORD = process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD || "Admin1234!";
const DEMO_FACULTY_EMAIL = process.env.NEXT_PUBLIC_DEMO_FACULTY_EMAIL || "faculty1@univ.edu";
const DEMO_FACULTY_PASSWORD = process.env.NEXT_PUBLIC_DEMO_FACULTY_PASSWORD || "Faculty1234!";
const DEMO_ADVISOR_EMAIL = process.env.NEXT_PUBLIC_DEMO_ADVISOR_EMAIL || "advisor1@univ.edu";
const DEMO_ADVISOR_PASSWORD = process.env.NEXT_PUBLIC_DEMO_ADVISOR_PASSWORD || "Advisor1234!";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDemoAccounts, setShowDemoAccounts] = useState(SHOW_DEMO_ACCOUNTS);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  useEffect(() => {
    if (SHOW_DEMO_ACCOUNTS) { setShowDemoAccounts(true); return; }
    const host = window.location.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") setShowDemoAccounts(true);
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(""); setLocked(false); setUnverifiedEmail(""); setLoading(true);
    try {
      const data = await apiFetch<LoginResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      if (data.role === "ADMIN")    { router.push("/admin/dashboard");   return; }
      if (data.role === "STUDENT")  { router.push("/student/dashboard"); return; }
      if (data.role === "FACULTY")  { router.push("/faculty/dashboard"); return; }
      if (data.role === "ADVISOR")  { router.push("/advisor/dashboard"); return; }
      await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
      setError("当前账号角色暂不支持登录。");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "ACCOUNT_LOCKED") {
          setLocked(true);
          setError("账号已锁定，请 15 分钟后重试或联系管理员");
        } else if (err.code === "EMAIL_NOT_VERIFIED") {
          setUnverifiedEmail(identifier.trim());
          setError("邮箱尚未验证，请查收注册邮件并完成验证后再登录。");
        } else if (err.code === "API_UNAVAILABLE") {
          setError("当前无法连接到后端服务，请确认 API 和数据库已启动后重试。");
        } else {
          setError(err.message);
        }
      } else {
        setError(err instanceof Error ? err.message : "登录失败");
      }
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    if (!unverifiedEmail || resendLoading) return;
    setResendLoading(true);
    try {
      await apiFetch("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: unverifiedEmail }),
      });
      setResendDone(true);
    } catch { setResendDone(true); }
    finally { setResendLoading(false); }
  };

  const fillDemo = (email: string, pw: string) => {
    setIdentifier(email); setPassword(pw); setError("");
  };

  return (
    <div className="w-full space-y-5">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-[hsl(221_65%_42%)]">地平线</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">登录系统</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">使用学号或邮箱登录，进入学生、教师、顾问或管理工作台。</p>
      </div>

      {/* Form */}
      <form aria-label="登录表单" className="space-y-4" onSubmit={onSubmit}>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">学号或邮箱</span>
          <input
            className="campus-input"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoComplete="email"
            autoFocus
            aria-describedby="login-error"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">密码</span>
          <div className="relative">
            <input
              className="campus-input pr-10"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
              aria-label={showPw ? "隐藏密码" : "显示密码"}
            >
              {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </label>

        {error ? (
          <div
            id="login-error"
            role="alert"
            className={`rounded-xl border px-3 py-2 text-sm ${
              locked
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {error}
          </div>
        ) : null}

        {unverifiedEmail ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            {resendDone ? (
              <p>验证邮件已重新发送，请查收收件箱（含垃圾箱）。</p>
            ) : (
              <p>
                未收到验证邮件？{" "}
                <button
                  type="button"
                  disabled={resendLoading}
                  onClick={() => void resendVerification()}
                  className="font-semibold underline underline-offset-2 hover:text-amber-900 disabled:opacity-60"
                >
                  {resendLoading ? "发送中…" : "重新发送"}
                </button>
              </p>
            )}
          </div>
        ) : null}

        <button
          disabled={loading}
          type="submit"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[hsl(221_83%_43%)] px-4 text-sm font-semibold text-white shadow-md transition duration-200 hover:bg-[hsl(221_83%_38%)] hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? (
            <>
              <span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
              登录中…
            </>
          ) : "登录"}
        </button>
      </form>

      {/* Demo accounts */}
      {showDemoAccounts ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="mb-3 text-xs font-semibold text-slate-600">演示账号（点击自动填充）</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { label: "学生", email: DEMO_STUDENT_ID, pw: DEMO_STUDENT_PASSWORD },
              { label: "管理员", email: DEMO_ADMIN_EMAIL, pw: DEMO_ADMIN_PASSWORD },
              { label: "教师", email: DEMO_FACULTY_EMAIL, pw: DEMO_FACULTY_PASSWORD },
              { label: "学业顾问", email: DEMO_ADVISOR_EMAIL, pw: DEMO_ADVISOR_PASSWORD },
            ] as const).map(({ label, email, pw }) => (
              <button
                key={label}
                type="button"
                onClick={() => fillDemo(email, pw)}
                className="flex flex-col items-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-[hsl(221_83%_43%)] hover:bg-[hsl(221_80%_97%)]"
              >
                <span className="text-xs font-semibold text-slate-800">{label}</span>
                <span className="mt-0.5 w-full truncate text-[11px] text-slate-400">{email}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Footer links */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>v1.0</span>
        <div className="flex items-center gap-3">
          <Link className="hover:text-slate-600" href="/forgot">忘记密码</Link>
          <Link className="hover:text-slate-600" href="/register">注册账号</Link>
        </div>
      </div>
    </div>
  );
}
