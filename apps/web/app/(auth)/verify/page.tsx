"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { API_URL } from "@/lib/config";

export default function VerifyPage() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState("Verifying...");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  useEffect(() => {
    let mounted = true;
    async function run() {
      if (!token) {
        setStatus("Missing token");
        return;
      }
      const res = await fetch(`${API_URL}/auth/verify-email?token=${encodeURIComponent(token)}`);
      if (!mounted) return;
      if (res.ok) {
        setStatus("Email verified. You can now sign in.");
      } else {
        setStatus("Verification failed or token expired.");
      }
    }
    run();
    return () => {
      mounted = false;
    };
  }, [token]);

  return (
    <Card className="rounded-3xl border-slate-200/90 bg-white/95 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.75)]">
      <CardHeader className="pb-4">
        <CardTitle className="font-heading text-2xl text-slate-900">Email Verification</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`rounded-xl border px-3 py-2 text-sm ${
            status.includes("verified")
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : status.includes("failed") || status.includes("Missing")
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          {status}
        </div>
        <Link className="mt-4 block text-sm font-medium text-primary underline underline-offset-2" href="/login">
          Back to login
        </Link>
      </CardContent>
    </Card>
  );
}
