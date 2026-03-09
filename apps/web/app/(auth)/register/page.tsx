"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

function getStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

const STRENGTH_LABEL = ["", "Very Weak", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLOR = ["", "bg-red-400", "bg-orange-400", "bg-amber-400", "bg-blue-400", "bg-emerald-400"];

type RegisterResult = {
  message: string;
};

export default function RegisterPage() {
  const [form, setForm] = useState({
    email: "",
    studentId: "",
    legalName: "",
    inviteCode: "",
    password: ""
  });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [strength, setStrength] = useState(0);
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailExists, setEmailExists] = useState(false);
  const pwMatch = confirmPassword.length > 0 && confirmPassword === form.password;
  const pwMismatch = confirmPassword.length > 0 && confirmPassword !== form.password;

  const checkEmail = async () => {
    const candidate = form.email.trim();
    if (!candidate || !candidate.includes("@")) {
      setEmailExists(false);
      return;
    }
    try {
      setCheckingEmail(true);
      const data = await apiFetch<{ exists: boolean }>(`/auth/check-email?email=${encodeURIComponent(candidate)}`);
      setEmailExists(Boolean(data.exists));
    } catch {
      setEmailExists(false);
    } finally {
      setCheckingEmail(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setResult(null);
    if (form.password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<RegisterResult>("/auth/register", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="rounded-3xl border-slate-200/90 bg-white/95 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.75)]">
      <CardHeader className="pb-4">
        <CardTitle className="font-heading text-2xl text-slate-900">Create Student Account</CardTitle>
        <CardDescription className="text-slate-600">Invite code and email verification are required.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Legal name</label>
            <Input
              placeholder="Alice Chen"
              className="h-10"
              value={form.legalName}
              onChange={(e) => setForm((prev) => ({ ...prev, legalName: e.target.value }))}
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Student ID</label>
              <Input
                placeholder="S4001"
                className="h-10"
                value={form.studentId}
                onChange={(e) => setForm((prev) => ({ ...prev, studentId: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Invite code</label>
              <Input
                placeholder="OPEN-2026"
                className="h-10"
                value={form.inviteCode}
                onChange={(e) => setForm((prev) => ({ ...prev, inviteCode: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Email</label>
            <Input
              type="email"
              className="h-10"
              placeholder="student@example.edu"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              onBlur={() => void checkEmail()}
              required
            />
            {checkingEmail ? (
              <p className="text-xs text-slate-400">Checking email…</p>
            ) : emailExists ? (
              <p className="text-xs font-medium text-amber-600">此邮箱已注册，请直接登录</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                className="h-10 pr-10"
                placeholder="Create a secure password"
                value={form.password}
                onChange={(e) => {
                  const nextPassword = e.target.value;
                  setForm((prev) => ({ ...prev, password: nextPassword }));
                  setStrength(getStrength(nextPassword));
                }}
                required
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
            {form.password ? (
              <div className="mt-1.5 space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((seg) => (
                    <div
                      key={seg}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        seg <= strength ? STRENGTH_COLOR[strength] : "bg-slate-200"
                      }`}
                    />
                  ))}
                </div>
                {strength > 0 ? (
                  <p
                    className={`text-xs font-medium ${
                      strength <= 2 ? "text-red-500" : strength <= 3 ? "text-amber-500" : "text-emerald-600"
                    }`}
                  >
                    {STRENGTH_LABEL[strength]}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Confirm password</label>
            <div className="relative">
              <Input
                type={showConfirm ? "text" : "password"}
                className={`h-10 pr-10 ${pwMismatch ? "border-red-400 focus-visible:ring-red-300" : pwMatch ? "border-emerald-400 focus-visible:ring-emerald-300" : ""}`}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {pwMismatch ? (
              <p className="text-xs font-medium text-red-600">Passwords do not match</p>
            ) : pwMatch ? (
              <p className="text-xs font-medium text-emerald-600">Passwords match ✓</p>
            ) : null}
          </div>
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          {result ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <p>{result.message}</p>
              <p className="mt-1 text-emerald-700">We sent a verification email. Please complete verification before login.</p>
            </div>
          ) : null}
          <Button disabled={loading} className="h-10 w-full bg-primary text-white hover:bg-primary/90" type="submit">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Creating account...
              </span>
            ) : (
              "Create Account"
            )}
          </Button>
        </form>
        <p className="mt-4 text-sm text-slate-600">
          Already registered?{" "}
          <Link className="font-medium text-primary underline underline-offset-2" href="/login">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
