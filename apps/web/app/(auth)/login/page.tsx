"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff, GraduationCap, ShieldCheck, Sparkles } from "lucide-react";
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

const FEATURES = [
  { icon: GraduationCap, text: "统一查看选课、成绩与毕业进度" },
  { icon: ShieldCheck, text: "角色分层清晰，面向真实教务场景" },
  { icon: Sparkles, text: "从注册到审批的关键流程都可直接演示" }
];

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

  useEffect(() => {
    if (SHOW_DEMO_ACCOUNTS) {
      setShowDemoAccounts(true);
      return;
    }

    const host = window.location.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") {
      setShowDemoAccounts(true);
    }
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLocked(false);
    setUnverifiedEmail("");
    setLoading(true);
    try {
      const data = await apiFetch<LoginResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password })
      });

      if (data.role === "ADMIN") {
        router.push("/admin/dashboard");
        return;
      }

      if (data.role === "STUDENT") {
        router.push("/student/dashboard");
        return;
      }

      if (data.role === "FACULTY") {
        router.push("/faculty/dashboard");
        return;
      }

      if (data.role === "ADVISOR") {
        router.push("/advisor/dashboard");
        return;
      }

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
          setError("当前无法连接到后端服务。请先启动 API 和数据库，再重试登录。");
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

  const [resendLoading, setResendLoading] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  const resendVerification = async () => {
    if (!unverifiedEmail || resendLoading) return;
    setResendLoading(true);
    try {
      await apiFetch("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email: unverifiedEmail })
      });
      setResendDone(true);
    } catch {
      // silently fail - show generic hint
      setResendDone(true);
    } finally {
      setResendLoading(false);
    }
  };

  const fillStudentDemo = () => {
    setIdentifier(DEMO_STUDENT_ID);
    setPassword(DEMO_STUDENT_PASSWORD);
    setError("");
  };

  const fillAdminDemo = () => {
    setIdentifier(DEMO_ADMIN_EMAIL);
    setPassword(DEMO_ADMIN_PASSWORD);
    setError("");
  };

  const fillFacultyDemo = () => {
    setIdentifier(DEMO_FACULTY_EMAIL);
    setPassword(DEMO_FACULTY_PASSWORD);
    setError("");
  };

  const fillAdvisorDemo = () => {
    setIdentifier(DEMO_ADVISOR_EMAIL);
    setPassword(DEMO_ADVISOR_PASSWORD);
    setError("");
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,hsl(221_50%_98%)_0%,white_100%)]">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="hidden lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:bg-[hsl(221_83%_43%)] lg:px-14 lg:py-12 lg:text-white">
          <div>
            <p className="text-sm font-semibold tracking-[0.16em] text-white/75">HORIZON</p>
            <h1 className="mt-8 text-4xl font-bold leading-tight text-white">地平线学生信息系统</h1>
            <p className="mt-4 max-w-md text-base leading-7 text-white/80">
              面向真实大学选课、学业管理与审批流程的统一门户，适合课程演示、答辩和正式交付展示。
            </p>
          </div>

          <div className="space-y-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.text} className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/8 px-4 py-3 backdrop-blur-sm">
                  <span className="inline-flex size-10 items-center justify-center rounded-full bg-white/14">
                    <Icon className="size-5 text-white" />
                  </span>
                  <span className="text-sm text-white/90">{feature.text}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[380px]">
            <div className="rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,white_0%,hsl(221_45%_99%)_100%)] p-7 shadow-2xl">
              <div className="mb-6">
                <p className="text-xs font-semibold tracking-[0.14em] text-[hsl(221_65%_42%)]">地平线</p>
                <h2 className="mt-3 text-[1.75rem] font-bold text-slate-900">登录系统</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">使用学号或邮箱登录，进入学生、教师、顾问或管理工作台。</p>
              </div>

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
                    aria-describedby="email-error"
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
                      aria-describedby="pw-error"
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
                  <span id="email-error" className="sr-only" aria-live="polite">
                    {error && !locked ? error : ""}
                  </span>
                  <span id="pw-error" className="sr-only" aria-live="polite">
                    {error}
                  </span>
                </label>

                {error ? (
                  <div
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
                          {resendLoading ? "发送中…" : "重新发送验证邮件"}
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
                      登录中...
                    </>
                  ) : (
                    "登录"
                  )}
                </button>
              </form>

              {showDemoAccounts ? (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">演示账号</h3>
                      <p className="mt-1 text-xs text-slate-500">点击后会自动填充常用测试账号。</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {([
                      { label: "学生", email: DEMO_STUDENT_ID, fill: fillStudentDemo },
                      { label: "管理员", email: DEMO_ADMIN_EMAIL, fill: fillAdminDemo },
                      { label: "教师", email: DEMO_FACULTY_EMAIL, fill: fillFacultyDemo },
                      { label: "学业顾问", email: DEMO_ADVISOR_EMAIL, fill: fillAdvisorDemo },
                    ] as const).map(({ label, email, fill }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={fill}
                        className="flex flex-col items-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-[hsl(221_83%_43%)] hover:bg-[hsl(221_80%_97%)] hover:text-[hsl(221_83%_38%)]"
                      >
                        <span className="text-xs font-semibold text-slate-800">{label}</span>
                        <span className="mt-0.5 truncate text-[11px] text-slate-400">{email}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-6 flex items-center justify-between gap-4 text-xs text-slate-500">
                <span>版本 v1.0</span>
                <div className="flex items-center gap-3">
                  <Link className="hover:text-slate-700" href="/forgot">帮助与重置密码</Link>
                  <Link className="hover:text-slate-700" href="/register">注册</Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
