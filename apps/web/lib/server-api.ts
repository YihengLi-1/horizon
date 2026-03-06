import { cookies } from "next/headers";

const SERVER_API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
const CSRF_COOKIE_NAME =
  (process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME || process.env.CSRF_COOKIE_NAME || "sis-csrf").trim() || "sis-csrf";
const CSRF_HEADER_NAME =
  (process.env.NEXT_PUBLIC_CSRF_HEADER_NAME || process.env.CSRF_HEADER_NAME || "x-csrf-token").trim().toLowerCase() ||
  "x-csrf-token";

type ServerApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  cache?: RequestCache;
};

function getServerApiBaseUrls(): string[] {
  const configured = SERVER_API_URL.replace(/\/+$/, "");
  const urls = [configured];
  if (configured.includes("localhost")) {
    urls.push(configured.replace("localhost", "127.0.0.1"));
  } else if (configured.includes("127.0.0.1")) {
    urls.push(configured.replace("127.0.0.1", "localhost"));
  }
  return [...new Set(urls)];
}

export async function serverApi<T>(path: string, options: ServerApiOptions = {}): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  const method = (options.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    ...(options.headers ?? {})
  };
  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }
  if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method)) {
    const csrfToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
    if (csrfToken) {
      headers[CSRF_HEADER_NAME] = csrfToken;
    }
  }

  let body: string | undefined;
  if (options.body !== undefined) {
    if (!headers["content-type"]) {
      headers["content-type"] = "application/json";
    }
    body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  let lastError: Error | null = null;

  for (const baseUrl of getServerApiBaseUrls()) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body,
        cache: options.cache ?? "no-store"
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message || "Server request failed");
      }

      return json.data as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Server request failed");
    }
  }

  throw lastError ?? new Error("Server request failed");
}
