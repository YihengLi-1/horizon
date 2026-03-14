"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api";

type LoginResult = {
  role: "STUDENT" | "FACULTY" | "ADVISOR" | "ADMIN";
};

const SHOW_DEMO_ACCOUNTS = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO === "true";
const DEMO_STUDENT_ID = process.env.NEXT_PUBLIC_DEMO_STUDENT_ID || "student1@sis.edu";
const DEMO_STUDENT_PASSWORD = process.env.NEXT_PUBLIC_DEMO_STUDENT_PASSWORD || "Student123!";
const DEMO_ADMIN_EMAIL = process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL || "admin@sis.edu";
const DEMO_ADMIN_PASSWORD = process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD || "Admin123!";
const DEMO_FACULTY_EMAIL = process.env.NEXT_PUBLIC_DEMO_FACULTY_EMAIL || "faculty1@sis.edu";
const DEMO_FACULTY_PASSWORD = process.env.NEXT_PUBLIC_DEMO_FACULTY_PASSWORD || "Faculty@2026!";
const DEMO_ADVISOR_EMAIL = process.env.NEXT_PUBLIC_DEMO_ADVISOR_EMAIL || "advisor1@sis.edu";
const DEMO_ADVISOR_PASSWORD = process.env.NEXT_PUBLIC_DEMO_ADVISOR_PASSWORD || "Advisor@2026!";
export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
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
        } else if (err.code === "API_UNAVAILABLE") {
          setError("当前无法连接到后端服务。请先启动 API 和数据库，再重试登录。");
        } else {
          setError(err.message);
        }
      } else {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    } finally {
      setLoading(false);
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
    <Card className="rounded-3xl border-slate-200/90 bg-gradient-to-br from-white via-white to-indigo-50/60 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.75)]">
      <CardHeader className="pb-4">
        <p className="text-xs font-semibold tracking-[0.12em] text-slate-500">地平线</p>
        <CardTitle className="font-heading text-2xl text-slate-900">登录系统</CardTitle>
        <CardDescription className="text-slate-600">使用学号或邮箱与密码登录。</CardDescription>
      </CardHeader>
      <CardContent>
        <form aria-label="Sign in form" className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium">学号或邮箱</label>
            <Input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              aria-required="true"
              autoComplete="email"
              autoFocus
              aria-describedby="email-error"
            />
            <span id="email-error" className="sr-only" aria-live="polite">
              {error && !locked ? error : ""}
            </span>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">密码</label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-required="true"
                autoComplete="current-password"
                className="pr-10"
                aria-describedby="pw-error"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showPw ? "隐藏密码" : "显示密码"}
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <span id="pw-error" className="sr-only" aria-live="polite">
              {error}
            </span>
          </div>
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
          <Button disabled={loading} className="h-10 w-full bg-primary text-white shadow-md transition-all duration-200 hover:bg-primary/90 hover:shadow-lg" type="submit">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                登录中...
              </span>
            ) : (
              "登录"
            )}
          </Button>
        </form>

        {showDemoAccounts ? (
          <div className="mt-5 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4">
            <h2 className="text-sm font-semibold text-slate-900">演示账号</h2>
            <p className="mt-1 text-xs text-slate-600">点击按钮可自动填充测试账号。</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 border-slate-300 bg-white text-slate-700 shadow-md transition-all duration-200 hover:bg-slate-100 hover:shadow-lg"
                onClick={fillStudentDemo}
              >
                填充学生账号
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 border-slate-300 bg-white text-slate-700 shadow-md transition-all duration-200 hover:bg-slate-100 hover:shadow-lg"
                onClick={fillAdminDemo}
              >
                填充管理账号
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 border-slate-300 bg-white text-slate-700 shadow-md transition-all duration-200 hover:bg-slate-100 hover:shadow-lg"
                onClick={fillFacultyDemo}
              >
                填充教师账号
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 border-slate-300 bg-white text-slate-700 shadow-md transition-all duration-200 hover:bg-slate-100 hover:shadow-lg"
                onClick={fillAdvisorDemo}
              >
                填充顾问账号
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 text-center text-sm text-slate-500">
          <Link className="font-medium text-primary underline underline-offset-2" href="/register">注册</Link>
          <span className="mx-2 text-slate-300">·</span>
          <Link className="font-medium text-primary underline underline-offset-2" href="/forgot">忘记密码？</Link>
        </div>
      </CardContent>
    </Card>
  );
}
