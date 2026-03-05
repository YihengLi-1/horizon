"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type ForgotResult = {
  message: string;
};

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<ForgotResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const sendReset = async () => {
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch<ForgotResult>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setResult(data);
      setSent(true);
      setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await sendReset();
  };

  return (
    <Card className="rounded-3xl border-slate-200/90 bg-white/95 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.75)]">
      <CardHeader className="pb-4">
        <CardTitle className="font-heading text-2xl text-slate-900">Forgot Password</CardTitle>
        <CardDescription className="text-slate-600">A reset link will be sent to the email address on file.</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50 text-3xl">
              ✉️
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold text-slate-800">Check your inbox</p>
              <p className="text-sm text-slate-500">
                {result?.message ?? "We've sent a password reset link to your email."} It expires in 15 minutes.
              </p>
            </div>
            {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            <Button disabled={loading || cooldown > 0} className="h-10 w-full bg-primary text-white hover:bg-primary/90" onClick={() => void sendReset()} type="button">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Sending...
                </span>
              ) : cooldown > 0 ? (
                `Resend in ${cooldown}s`
              ) : (
                "Send Again"
              )}
            </Button>
            <a href="/login" className="inline-block text-sm font-medium text-blue-600 hover:underline">
              ← Back to login
            </a>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={onSubmit}>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Email</label>
              <Input
                className="h-10"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="student@example.edu"
              />
            </div>
            {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            <Button disabled={loading || cooldown > 0} className="h-10 w-full bg-primary text-white hover:bg-primary/90" type="submit">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Sending...
                </span>
              ) : cooldown > 0 ? (
                `Resend in ${cooldown}s`
              ) : (
                "Send reset link"
              )}
            </Button>
          </form>
        )}
        <p className="mt-4 text-sm text-slate-600">
          Remember your password?{" "}
          <Link className="font-medium text-primary underline underline-offset-2" href="/login">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
