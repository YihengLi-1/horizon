import { API_URL } from "./config";

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  error?: {
    statusCode?: number;
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;

  constructor(message: string, options?: { statusCode?: number; code?: string; details?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.statusCode = options?.statusCode;
    this.code = options?.code;
    this.details = options?.details;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = readCookie("csrf_token");
    if (csrfToken) {
      headers.set("x-csrf-token", csrfToken);
    }
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    method,
    credentials: "include",
    headers
  });

  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!res.ok || !body?.success) {
    const message = body?.error?.message || `Request failed (${res.status})`;
    throw new ApiError(message, {
      statusCode: body?.error?.statusCode ?? res.status,
      code: body?.error?.code,
      details: body?.error?.details
    });
  }

  return body.data;
}
