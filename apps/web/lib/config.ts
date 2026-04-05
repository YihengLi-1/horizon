const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

function getClientApiUrl(): string {
  if (typeof window === "undefined") {
    return DEFAULT_API_URL;
  }

  const fallback = `${window.location.protocol}//${window.location.hostname}:4000`;

  try {
    const resolved = new URL(DEFAULT_API_URL || fallback);
    if (LOOPBACK_HOSTS.has(resolved.hostname) && LOOPBACK_HOSTS.has(window.location.hostname)) {
      resolved.hostname = window.location.hostname;
      if (!resolved.port) {
        resolved.port = "4000";
      }
    }
    return resolved.toString().replace(/\/+$/, "");
  } catch {
    return fallback.replace(/\/+$/, "");
  }
}

export const API_URL = typeof window === "undefined" ? DEFAULT_API_URL : getClientApiUrl();
