"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type LoginResult = {
  role: "STUDENT" | "ADMIN";
};

const SHOW_DEMO_ACCOUNTS = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO === "true";
const DEMO_STUDENT_ID = process.env.NEXT_PUBLIC_DEMO_STUDENT_ID || "S1001";
const DEMO_STUDENT_PASSWORD = process.env.NEXT_PUBLIC_DEMO_STUDENT_PASSWORD || "Student123!";
const DEMO_ADMIN_EMAIL = process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL || "admin@university.edu";
const DEMO_ADMIN_PASSWORD = process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD || "Admin123!";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [webOrigin, setWebOrigin] = useState("");

  useEffect(() => {
    setWebOrigin(window.location.origin);
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch<LoginResult>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password })
      });
      router.push(data.role === "ADMIN" ? "/admin/dashboard" : "/student/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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

  return (
    <Card className="rounded-3xl border-slate-200/90 bg-white/95 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.75)]">
      <CardHeader className="pb-4">
        <CardTitle className="font-heading text-2xl text-slate-900">University SIS</CardTitle>
        <CardDescription className="text-slate-600">Login with student ID or email and password.</CardDescription>
        <p className="mt-1 text-sm text-slate-500">Welcome back to 地平线 SIS</p>
      </CardHeader>
      <CardContent>
        <form aria-label="Sign in form" className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium">Student ID or Email</label>
            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required aria-required="true" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Password</label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-required="true"
                className="pr-10"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}
          <Button disabled={loading} className="h-10 w-full bg-primary text-white hover:bg-primary/90" type="submit">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Signing in...
              </span>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        {SHOW_DEMO_ACCOUNTS ? (
          <div className="mt-5 rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4">
            <h2 className="text-sm font-semibold text-slate-900">Demo accounts</h2>
            <p className="mt-1 text-xs text-slate-600">Use these buttons to auto-fill test credentials.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                onClick={fillStudentDemo}
              >
                Fill Student
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                onClick={fillAdminDemo}
              >
                Fill Admin
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 text-center text-sm text-slate-500">
          <Link className="font-medium text-primary underline underline-offset-2" href="/register">Register</Link>
          <span className="mx-2 text-slate-300">·</span>
          <Link className="font-medium text-primary underline underline-offset-2" href="/forgot">Forgot password?</Link>
        </div>

        {SHOW_DEMO_ACCOUNTS ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
            <p>WEB: {webOrigin}</p>
            <p>API: {API_BASE_URL}</p>
            <p>MODE: {process.env.NODE_ENV}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
