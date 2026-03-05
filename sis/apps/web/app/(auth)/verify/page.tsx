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
    <Card>
      <CardHeader>
        <CardTitle>Email Verification</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{status}</p>
        <Link className="mt-4 block" href="/login">
          Back to login
        </Link>
      </CardContent>
    </Card>
  );
}
