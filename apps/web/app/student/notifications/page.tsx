"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCircle, Info, AlertTriangle } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface Notif {
  id: string;
  type: "success" | "warning" | "info" | "error";
  title: string;
  body: string;
  createdAt?: string;
}

const TYPE_CONFIG: Record<Notif["type"], {
  border: string;
  bg: string;
  iconColor: string;
  Icon: React.FC<{ className?: string }>;
}> = {
  success: {
    border: "border-l-emerald-400",
    bg: "bg-emerald-50/40",
    iconColor: "text-emerald-500",
    Icon: CheckCircle,
  },
  warning: {
    border: "border-l-amber-400",
    bg: "bg-amber-50/40",
    iconColor: "text-amber-500",
    Icon: AlertTriangle,
  },
  info: {
    border: "border-l-blue-400",
    bg: "bg-blue-50/40",
    iconColor: "text-blue-500",
    Icon: Info,
  },
  error: {
    border: "border-l-red-400",
    bg: "bg-red-50/40",
    iconColor: "text-red-500",
    Icon: AlertTriangle,
  },
};

function timeAgo(value?: string): string {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(value).toLocaleDateString("zh-CN");
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    window.localStorage.setItem("notif_last_seen", String(Date.now()));
    void apiFetch<Notif[]>("/students/notifications")
      .then((data) => setItems(data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "通知加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const successCount = items.filter((n) => n.type === "success").length;
  const warningCount = items.filter((n) => n.type === "warning").length;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">消息中心</p>
        <h1 className="campus-hero-title">我的通知</h1>
        <p className="campus-hero-subtitle">
          {loading ? "加载中…" : `共 ${items.length} 条通知`}
        </p>
      </section>

      {!loading && !error && items.length > 0 ? (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="campus-kpi">
            <p className="campus-kpi-label">全部通知</p>
            <p className="campus-kpi-value">{items.length}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">已选课</p>
            <p className="campus-kpi-value text-emerald-600">{successCount}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">候补 / 待审</p>
            <p className="campus-kpi-value text-amber-600">{warningCount}</p>
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="campus-card border-red-200 bg-red-50 p-6 text-sm text-red-700">
          无法加载通知。{error}
        </div>
      ) : loading ? (
        <div className="campus-card animate-pulse space-y-3 p-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="size-9 rounded-full bg-slate-200" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 w-2/5 rounded bg-slate-200" />
                <div className="h-3 w-3/5 rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="campus-card p-12 text-center">
          <Bell className="mx-auto mb-3 size-10 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">暂无通知</p>
          <p className="mt-1 text-xs text-slate-400">选课、候补或成绩变更时会在此显示通知。</p>
        </div>
      ) : (
        <section className="space-y-2">
          {items.map((item) => {
            const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.info;
            const { Icon } = cfg;
            return (
              <div
                key={item.id}
                className={`campus-card flex items-start gap-4 border-l-4 p-4 ${cfg.border} ${cfg.bg}`}
              >
                <span className={`mt-0.5 shrink-0 ${cfg.iconColor}`}>
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                    {item.createdAt ? (
                      <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(item.createdAt)}</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{item.body}</p>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
