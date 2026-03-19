"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type NotifEntry = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  sentAt: string;
  user?: {
    email: string;
    studentProfile?: { legalName: string } | null;
  };
};

type LogResponse = {
  data: NotifEntry[];
  total: number;
  page: number;
  pageSize: number;
};

function typeStyle(type: string): string {
  switch (type) {
    case "success": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "warning": return "bg-amber-50 text-amber-700 border-amber-200";
    case "error":   return "bg-red-50 text-red-700 border-red-200";
    default:        return "bg-blue-50 text-blue-700 border-blue-200";
  }
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    success: "成功",
    warning: "警告",
    error:   "错误",
    info:    "信息",
  };
  return map[type] ?? type;
}

function timeStr(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PAGE_SIZE = 50;

export default function NotificationLogPage() {
  const [data, setData] = useState<NotifEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page) });
    void apiFetch<LogResponse>(`/admin/notification-log?${params}`)
      .then((res) => {
        setData(res?.data ?? []);
        setTotal(res?.total ?? 0);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [page]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.filter((entry) => {
      if (typeFilter && entry.type !== typeFilter) return false;
      if (!q) return true;
      return (
        entry.title.toLowerCase().includes(q) ||
        entry.body.toLowerCase().includes(q) ||
        entry.user?.email.toLowerCase().includes(q) ||
        (entry.user?.studentProfile?.legalName ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">消息中心</p>
        <h1 className="campus-title">通知发送记录</h1>
        <p className="campus-subtitle">查看系统向用户发送的所有通知历史，支持按类型和关键词筛选</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">本页条数</p>
          <p className="campus-kpi-value">{data.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">记录总数</p>
          <p className="campus-kpi-value">{total}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">当前页</p>
          <p className="campus-kpi-value">{page} / {totalPages}</p>
        </div>
      </section>

      <div className="campus-toolbar">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <input
            className="campus-input max-w-xs"
            placeholder="按标题、正文或用户搜索…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="campus-select w-36"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">全部类型</option>
            <option value="success">成功</option>
            <option value="warning">警告</option>
            <option value="error">错误</option>
            <option value="info">信息</option>
          </select>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="campus-card p-10 text-center text-slate-400">暂无记录</div>
      ) : (
        <section className="campus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3 text-left">时间</th>
                  <th className="px-4 py-3 text-left">用户</th>
                  <th className="px-4 py-3 text-left">类型</th>
                  <th className="px-4 py-3 text-left">标题</th>
                  <th className="px-4 py-3 text-left">内容</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                      {timeStr(entry.sentAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-slate-800">
                        {entry.user?.studentProfile?.legalName ?? "—"}
                      </p>
                      <p className="text-xs text-slate-500">{entry.user?.email ?? entry.userId}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${typeStyle(entry.type)}`}>
                        {typeLabel(entry.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 max-w-[180px] truncate">
                      {entry.title}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-[280px] truncate text-xs">
                      {entry.body}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2">
            <p className="text-xs text-slate-400">共 {total} 条记录</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                上一页
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
