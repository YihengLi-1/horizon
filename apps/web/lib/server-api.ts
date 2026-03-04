import { cookies } from "next/headers";

const SERVER_API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type ServerApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  cache?: RequestCache;
};

export async function serverApi<T>(path: string, options: ServerApiOptions = {}): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  const headers: Record<string, string> = {
    ...(options.headers ?? {})
  };
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  let body: string | undefined;
  if (options.body !== undefined) {
    if (!headers["content-type"]) {
      headers["content-type"] = "application/json";
    }
    body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  const res = await fetch(`${SERVER_API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body,
    cache: options.cache ?? "no-store"
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message || "Server request failed");
  }
  return json.data as T;
}
