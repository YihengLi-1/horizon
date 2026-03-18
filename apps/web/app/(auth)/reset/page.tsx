"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

function passwordStrength(pw: string): { score: number; label: string; color: string; bg: string } {
  if (!pw) return { score: 0, label: "", color: "text-slate-400", bg: "bg-slate-200" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "弱", color: "text-red-600", bg: "bg-red-500" };
  if (score <= 2) return { score, label: "一般", color: "text-amber-600", bg: "bg-amber-500" };
  if (score <= 3) return { score, label: "良好", color: "text-yellow-600", bg: "bg-yellow-400" };
  if (score <= 4) return { score, label: "强", color: "text-emerald-600", bg: "bg-emerald-500" };
  return { score, label: "非常强", color: "text-emerald-700", bg: "bg-emerald-600" };
}

export default function ResetPage() {
  const [token] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") || "";
  });
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const pwStrength = passwordStrength(newPassword);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const data = await apiFetch<{ message: string }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword })
      });
      setMessage(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="rounded-3xl border-slate-200/90 bg-white/95 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.75)]">
      <CardHeader className="pb-4">
        <CardTitle className="font-heading text-2xl text-slate-900">重置密码</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">新密码</label>
            <div className="relative">
              <Input
                className="h-10 pr-10"
                type={showPw ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
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
            {newPassword ? (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((seg) => (
                    <div
                      key={seg}
                      className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                        seg <= pwStrength.score ? pwStrength.bg : "bg-slate-200"
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-xs font-medium ${pwStrength.color}`}>{pwStrength.label}</p>
              </div>
            ) : null}
          </div>
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          {message ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <p>{message}</p>
            </div>
          ) : null}
          <Button disabled={loading} className="h-10 w-full bg-primary text-white hover:bg-primary/90" type="submit">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Resetting...
              </span>
            ) : (
              "重置密码"
            )}
          </Button>
        </form>
        {message ? (
          <Link className="mt-4 block text-sm font-medium text-primary underline underline-offset-2" href="/login">
            Sign in with new password →
          </Link>
        ) : (
          <Link className="mt-4 block text-sm font-medium text-primary underline underline-offset-2" href="/login">
            返回登录
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
