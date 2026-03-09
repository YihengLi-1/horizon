"use client";

import { useEffect, useRef, useState } from "react";
import { BellIcon } from "lucide-react";

interface Notif {
  id: string;
  type: "success" | "warning" | "info";
  title: string;
  body: string;
  createdAt?: string;
}

const TYPE_CLS = {
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
} as const;

export default function NotificationBell({ apiBase }: { apiBase: string }) {
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const [loadError, setLoadError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = Number(window.localStorage.getItem("notif_last_seen") ?? "0");
      setLastSeenAt(Number.isFinite(raw) ? raw : 0);
    } catch {
      setLastSeenAt(0);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const response = await fetch(`${apiBase}/students/notifications`, { credentials: "include" });
        if (!response.ok || !alive) {
          if (alive) setLoadError("Notifications unavailable");
          return;
        }
        const payload = (await response.json()) as
          | Notif[]
          | { success?: boolean; data?: Notif[] };
        const nextItems = Array.isArray(payload) ? payload : payload.data ?? [];
        if (alive) {
          setItems(nextItems);
          setLoadError("");
        }
      } catch {
        if (alive) setLoadError("Notifications unavailable");
      }
    }

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 30_000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [apiBase]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = items.filter((item) => {
    const createdAt = item.createdAt ? Date.parse(item.createdAt) : 0;
    return createdAt > lastSeenAt;
  }).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          setOpen((current) => {
            const nextOpen = !current;
            if (nextOpen) {
              const ts = Date.now();
              window.localStorage.setItem("notif_last_seen", String(ts));
              setLastSeenAt(ts);
            }
            return nextOpen;
          });
        }}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
      >
        <BellIcon className="h-4 w-4" />
        {unread > 0 ? (
          <span
            aria-live="polite"
            className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">Notifications</p>
            <span className="text-xs text-slate-400">{items.length} total</span>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                {loadError ? "⚠️ Notifications unavailable" : "🔔 No notifications"}
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} role="menuitem" className={`border-l-4 px-4 py-3 ${TYPE_CLS[item.type]}`}>
                  <p className="text-xs font-semibold">{item.title}</p>
                  <p className="mt-0.5 text-xs opacity-80">{item.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
