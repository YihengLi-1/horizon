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
    <Card>
      <CardHeader>
        <CardTitle>Forgot Password</CardTitle>
        <CardDescription>Reset link is emailed. Dev mode also shows it below.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={onSubmit}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="Email" />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {result ? (
            <div className="text-sm">
              <p>{result.message}</p>
              {result.resetLink ? (
                <a className="block mt-1" href={result.resetLink}>
                  Open reset link
                </a>
              ) : null}
            </div>
          ) : null}
          <Button className="w-full" type="submit">
            Send reset link
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
