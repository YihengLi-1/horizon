"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type ForgotResult = {
  message: string;
  resetLink?: string;
};

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<ForgotResult | null>(null);
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setResult(null);
    try {
      const data = await apiFetch<ForgotResult>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <Card className="rounded-3xl border-slate-200/90 bg-white/95 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.75)]">
      <CardHeader className="pb-4">
        <CardTitle className="font-heading text-2xl text-slate-900">Forgot Password</CardTitle>
        <CardDescription className="text-slate-600">A reset link will be sent to the email address on file.</CardDescription>
      </CardHeader>
      <CardContent>
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
          {result ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <p>{result.message}</p>
              {result.resetLink ? (
                <a className="mt-1 block font-semibold underline underline-offset-2" href={result.resetLink}>
                  Open reset link
                </a>
              ) : null}
            </div>
          ) : null}
          <Button className="h-10 w-full bg-primary text-white hover:bg-primary/90" type="submit">
            Send reset link
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
