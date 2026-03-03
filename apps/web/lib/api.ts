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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
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
