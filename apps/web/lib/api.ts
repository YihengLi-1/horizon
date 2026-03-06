import { API_URL } from "./config";

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  error?: {
    statusCode?: number;
    code?: string;
    message?: string;
    requestId?: string;
    details?: unknown;
  };
};

export class ApiError extends Error {
  statusCode?: number;
  code?: string;
  requestId?: string;
  details?: unknown;

  constructor(message: string, options?: { statusCode?: number; code?: string; requestId?: string; details?: unknown }) {
    super(message);
    this.name = "ApiError";
    this.statusCode = options?.statusCode;
    this.code = options?.code;
    this.requestId = options?.requestId;
    this.details = options?.details;
  }
}

export class MaintenanceError extends ApiError {
  maintenance = true;

  constructor(message = "系统维护中，请稍后再试", options?: { statusCode?: number; requestId?: string; details?: unknown }) {
    super(message, {
      statusCode: options?.statusCode ?? 503,
      code: "MAINTENANCE_MODE",
      requestId: options?.requestId,
      details: options?.details
    });
    this.name = "MaintenanceError";
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);
const TOKEN_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const resolveTokenName = (raw: string | undefined, fallback: string, kind: "cookie" | "header"): string => {
  const value = (raw || "").trim();
  if (!value) return fallback;
  const normalized = kind === "header" ? value.toLowerCase() : value;
  return TOKEN_NAME_PATTERN.test(normalized) ? normalized : fallback;
};
const CSRF_COOKIE = process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? "sis-csrf";
const CSRF_HEADER = process.env.NEXT_PUBLIC_CSRF_HEADER_NAME ?? "x-csrf-token";
const CSRF_COOKIE_NAME = resolveTokenName(CSRF_COOKIE || process.env.CSRF_COOKIE_NAME, "sis-csrf", "cookie");
const CSRF_HEADER_NAME = resolveTokenName(CSRF_HEADER || process.env.CSRF_HEADER_NAME, "x-csrf-token", "header");

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function canUseFormData(): boolean {
  return typeof FormData !== "undefined";
}

async function fetchCsrfToken(): Promise<void> {
  await fetch(`${API_URL}/auth/csrf-token`, {
    method: "GET",
    credentials: "include"
  }).catch(() => null);
}

async function readOrRefreshCsrfToken(): Promise<string | null> {
  const existing = readCookie(CSRF_COOKIE_NAME);
  if (existing) return existing;
  await fetchCsrfToken();
  return readCookie(CSRF_COOKIE_NAME);
}

async function parseResponse<T>(res: Response): Promise<ApiResponse<T> | null> {
  return (await res.json().catch(() => null)) as ApiResponse<T> | null;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const unsafeMethod = !SAFE_METHODS.has(method);
  const baseHeaders = new Headers(init?.headers);
  const bodyIsFormData = canUseFormData() && init?.body instanceof FormData;
  if (init?.body !== undefined && !baseHeaders.has("Content-Type") && !bodyIsFormData) {
    baseHeaders.set("Content-Type", "application/json");
  }
  if (unsafeMethod) {
    const csrfToken = await readOrRefreshCsrfToken();
    if (csrfToken) {
      baseHeaders.set(CSRF_HEADER_NAME, csrfToken);
    }
  }

  const send = async (headers: Headers): Promise<{ res: Response; body: ApiResponse<T> | null }> => {
    try {
      const res = await fetch(`${API_URL}${path}`, {
        ...init,
        method,
        credentials: "include",
        headers
      });
      return { res, body: await parseResponse<T>(res) };
    } catch (error) {
      throw new ApiError("无法连接到服务器，请确认 API 和数据库已启动", {
        statusCode: 0,
        code: "API_UNAVAILABLE",
        details: error
      });
    }
  };

  let { res, body } = await send(baseHeaders);

  if (unsafeMethod && res.status === 403 && body?.error?.code === "CSRF_TOKEN_INVALID") {
    await fetchCsrfToken();
    const retryHeaders = new Headers(baseHeaders);
    const refreshedToken = readCookie(CSRF_COOKIE_NAME);
    if (refreshedToken) {
      retryHeaders.set(CSRF_HEADER_NAME, refreshedToken);
    }
    ({ res, body } = await send(retryHeaders));
  }

  if (res.status === 503 && body && typeof body === "object" && "maintenance" in body) {
    const raw = body as { message?: string; maintenance?: boolean };
    throw new MaintenanceError(raw.message ?? "系统维护中，请稍后再试", {
      statusCode: 503,
      details: raw
    });
  }

  if (!res.ok || !body?.success) {
    const baseMessage = body?.error?.message || `Request failed (${res.status})`;
    const requestId = body?.error?.requestId;
    const message = requestId ? `${baseMessage} (Request ID: ${requestId})` : baseMessage;
    throw new ApiError(message, {
      statusCode: body?.error?.statusCode ?? res.status,
      code: body?.error?.code,
      requestId,
      details: body?.error?.details
    });
  }

  if (typeof window !== "undefined" && method === "POST" && path === "/auth/login") {
    const loginPayload = body.data as { expiresAt?: string | number } | undefined;
    const expiresAt =
      loginPayload?.expiresAt !== undefined
        ? Number(loginPayload.expiresAt)
        : Date.now() + 7 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem("sis_session_exp", String(expiresAt));
  }

  return body.data;
}

export async function refreshSession(): Promise<void> {
  const data = await apiFetch<{ ok: boolean; expiresAt?: string | number }>("/auth/refresh", {
    method: "POST"
  });
  if (typeof window !== "undefined" && data?.expiresAt !== undefined) {
    window.localStorage.setItem("sis_session_exp", String(Number(data.expiresAt)));
  }
}
