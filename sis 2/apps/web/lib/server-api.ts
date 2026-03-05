import { cookies } from "next/headers";
import { API_URL } from "./config";

export async function serverApi<T>(path: string): Promise<T> {
  const cookieStore = await cookies();
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      cookie: cookieStore.toString()
    },
    cache: "no-store"
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message || "Server request failed");
  }
  return json.data as T;
}
