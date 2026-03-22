import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const upstream = await fetch(`${API_BASE.replace(/\/$/, "")}/auth/saml/callback`, {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") || "application/x-www-form-urlencoded"
    },
    body,
    redirect: "manual"
  });

  const redirectLocation = upstream.headers.get("location") || "/student/dashboard";
  const response = NextResponse.redirect(redirectLocation, upstream.status >= 300 && upstream.status < 400 ? upstream.status : 302);

  const setCookies =
    (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const cookie of setCookies) {
    response.headers.append("set-cookie", cookie);
  }

  return response;
}
