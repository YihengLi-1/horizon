"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt?: string;
}

const TYPE_CLS: Record<string, string> = {
  success: "border-l-emerald-400 bg-emerald-50/30",
  warning: "border-l-amber-400 bg-amber-50/30",
  info: "border-l-blue-400 bg-blue-50/30"
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notif[]>([]);

  useEffect(() => {
    window.localStorage.setItem("notif_last_seen", String(Date.now()));
    void apiFetch<Notif[]>("/students/notifications")
      .then((data) => setItems(data ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Notifications</h1>
        <p className="mt-1 text-sm text-slate-500">
          {items.length} notification{items.length !== 1 ? "s" : ""}
        </p>
      </div>
      {items.length === 0 ? (
        <div className="campus-card p-12 text-center">
          <span className="text-4xl">🔔</span>
          <p className="mt-3 text-slate-500">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className={`campus-card border-l-4 p-4 ${TYPE_CLS[item.type] ?? ""}`}>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.title}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
