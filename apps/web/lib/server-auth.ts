import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type Me = {
  id: string;
  email: string;
  studentId: string | null;
  role: "STUDENT" | "FACULTY" | "ADVISOR" | "ADMIN";
  profile?: {
    legalName?: string;
    programMajor?: string | null;
    enrollmentStatus?: string | null;
    academicStatus?: string | null;
    dob?: string | null;
    address?: string | null;
    emergencyContact?: string | null;
  } | null;
};

function getServerApiBaseUrl(): string {
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
}

function getServerApiBaseUrls(): string[] {
  const configured = getServerApiBaseUrl().replace(/\/+$/, "");
  const urls = [configured];
  if (configured.includes("localhost")) {
    urls.push(configured.replace("localhost", "127.0.0.1"));
  } else if (configured.includes("127.0.0.1")) {
    urls.push(configured.replace("127.0.0.1", "localhost"));
  }
  return [...new Set(urls)];
}

export async function getMeServer(): Promise<Me | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  for (const baseUrl of getServerApiBaseUrls()) {
    try {
      const res = await fetch(`${baseUrl}/auth/me`, {
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
    } catch {
      continue;
    }
  }

  return null;
}

export async function requireRole(role: Me["role"]): Promise<Me> {
  const me = await getMeServer();
  if (!me || me.role !== role) {
    redirect("/login");
  }

  return me;
}
