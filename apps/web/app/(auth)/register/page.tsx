"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type RegisterResult = {
  message: string;
  activationLink: string;
};

export default function RegisterPage() {
  const [form, setForm] = useState({
    email: "",
    studentId: "",
    legalName: "",
    inviteCode: "",
    password: ""
  });
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setResult(null);
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
                placeholder="INVITE-2026"
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
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Password</label>
            <Input
              type="password"
              className="h-10"
              placeholder="Create a secure password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              required
            />
          </div>
          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          {result ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <p>{result.message}</p>
              <a className="mt-1 block font-semibold underline underline-offset-2" href={result.activationLink}>
                Open activation link
              </a>
            </div>
          ) : null}
          <Button disabled={loading} className="h-10 w-full bg-primary text-white hover:bg-primary/90" type="submit">
            {loading ? "Creating account..." : "Create Account"}
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
