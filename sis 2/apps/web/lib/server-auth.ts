import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type Me = {
  id: string;
  email: string;
  studentId: string | null;
  role: "STUDENT" | "ADMIN";
  profile?: {
    legalName?: string;
  } | null;
};

function getServerApiBaseUrl(): string {
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
}

export async function getMeServer(): Promise<Me | null> {
  const cookieStore = cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const res = await fetch(`${getServerApiBaseUrl()}/auth/me`, {
    method: "GET",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: "no-store"
  });

  if (!res.ok) {
    return null;
  }

  const json = await res.json();
  if (!json?.success) {
    return null;
  }

  return json.data as Me;
}

export async function requireRole(role: "STUDENT" | "ADMIN"): Promise<Me> {
  const me = await getMeServer();
  if (!me || me.role !== role) {
    redirect("/login");
  }

  return me;
}
