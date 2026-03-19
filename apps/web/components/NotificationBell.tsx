"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Circle } from "lucide-react";
import { apiFetch } from "@/lib/api";

type NotificationItem = {
  id: string;
  type: "success" | "warning" | "info" | "error";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

const toneClass: Record<NotificationItem["type"], string> = {
  success: "text-emerald-500",
  warning: "text-amber-500",
  info: "text-blue-500",
  error: "text-red-500"
};

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} 分钟前`;
  if (diff < day) return `${Math.max(1, Math.floor(diff / hour))} 小时前`;
  return `${Math.max(1, Math.floor(diff / day))} 天前`;
}

export default function NotificationBell() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;

    async function loadItems() {
      try {
        const data = await apiFetch<NotificationItem[]>("/notifications");
        if (alive) setItems(data ?? []);
      } catch {
        if (alive) setItems([]);
      }
    }

    async function loadCount() {
      try {
        const data = await apiFetch<{ count: number }>("/notifications/unread-count");
        if (alive) setCount(Number(data?.count ?? 0));
      } catch {
        if (alive) setCount(0);
      }
    }

    void loadItems();
    void loadCount();
    const timer = window.setInterval(() => {
      void loadCount();
    }, 30_000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length || count, [count, items]);

  async function markRead(id: string) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
    setCount((current) => Math.max(0, current - 1));
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "PATCH" });
    } catch {}
  }

  function markAllRead() {
    const unread = items.filter((item) => !item.read).length;
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    setCount((current) => Math.max(0, current - unread));
  }

  return (
    <div ref={wrapperRef} className="relative">
      <span className="sr-only" aria-live="polite">
        {unreadCount > 0 ? `${unreadCount} 条未读通知` : "当前没有未读通知"}
      </span>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex size-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
        aria-label={`通知${unreadCount ? `，${unreadCount} 条未读` : ""}`}
      >
        <Bell className="size-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="campus-card absolute right-0 top-full z-50 mt-3 flex max-h-96 w-80 flex-col overflow-hidden shadow-2xl">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">通知中心</p>
          </div>
          <div className="max-h-80 overflow-y-auto px-2 py-2">
            {items.length === 0 ? (
              <div className="campus-empty py-8">
                <div className="campus-empty-title text-sm">暂无通知</div>
                <div className="campus-empty-desc text-xs">当前没有系统通知。</div>
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void markRead(item.id)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-50 ${
                    item.read ? "opacity-60" : ""
                  }`}
                >
                  <Circle className={`mt-1 size-3 fill-current ${toneClass[item.type]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(item.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{item.body}</p>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-slate-200 px-3 py-3">
            <button
              type="button"
              onClick={markAllRead}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              全部标记已读
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
