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
    inviteCode: "INVITE-2026",
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
    <Card>
      <CardHeader>
        <CardTitle>Register</CardTitle>
        <CardDescription>Invite code + email verification are required.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={onSubmit}>
          <Input
            placeholder="Legal name"
            value={form.legalName}
            onChange={(e) => setForm((prev) => ({ ...prev, legalName: e.target.value }))}
            required
          />
          <Input
            placeholder="Student ID"
            value={form.studentId}
            onChange={(e) => setForm((prev) => ({ ...prev, studentId: e.target.value }))}
            required
          />
          <Input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
          <Input
            placeholder="Invite code"
            value={form.inviteCode}
            onChange={(e) => setForm((prev) => ({ ...prev, inviteCode: e.target.value }))}
            required
          />
          <Input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            required
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {result ? (
            <div className="rounded-md bg-secondary p-3 text-sm">
              <p>{result.message}</p>
              <a className="mt-1 block" href={result.activationLink}>
                Open activation link
              </a>
            </div>
          ) : null}
          <Button disabled={loading} className="w-full" type="submit">
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>
        <p className="mt-4 text-sm">
          Already registered? <Link href="/login">Sign in</Link>
        </p>
      </CardContent>
    </Card>
  );
}
