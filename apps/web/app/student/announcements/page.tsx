"use client";

import { useEffect, useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
  createdAt?: string;
  expiresAt?: string | null;
};

const PAGE_SIZE = 10;

const AUDIENCE_LABEL: Record<string, string> = {
  STUDENT: "学生",
  ADMIN: "管理员",
  ALL: "全体",
  student: "学生",
  admin: "管理员",
  all: "全体",
};

function audienceChip(audience: string): string {
  const key = audience.toLowerCase();
  if (key === "admin") return "border-violet-200 bg-violet-50 text-violet-700";
  if (key === "student") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function StudentAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void apiFetch<Announcement[]>("/students/announcements")
      .then((data) => {
        if (!alive) return;
        setItems(
          [...(data ?? [])].sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
          })
        );
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "公告加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = useMemo(
    () => items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [items, safePage]
  );
  const pinnedCount = items.filter((i) => i.pinned).length;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">校园动态</p>
        <h1 className="campus-title">系统公告</h1>
        <p className="campus-subtitle">
          {loading ? "加载中…" : `共 ${items.length} 条公告${pinnedCount ? `，${pinnedCount} 条已置顶` : ""}`}
        </p>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {!loading && visible.length === 0 ? (
        <div className="campus-card p-12 text-center">
          <Megaphone className="mx-auto mb-3 size-10 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">暂无公告</p>
          <p className="mt-1 text-xs text-slate-400">管理员发布公告后将在此显示。</p>
        </div>
      ) : (
        <section className="space-y-3">
          {visible.map((item) => (
            <article key={item.id} className="campus-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{item.title}</h2>
                    {item.pinned ? (
                      <span className="campus-chip chip-amber text-[11px]">★ 置顶</span>
                    ) : null}
                    <span className={`campus-chip text-[11px] ${audienceChip(item.audience)}`}>
                      {AUDIENCE_LABEL[item.audience] ?? item.audience}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {item.body.length > 300 ? `${item.body.slice(0, 300)}…` : item.body}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-slate-400">
                  {item.createdAt ? (
                    <p>{new Date(item.createdAt).toLocaleDateString("zh-CN")}</p>
                  ) : null}
                  {item.expiresAt ? (
                    <p className="mt-1 text-amber-600">
                      过期：{new Date(item.expiresAt).toLocaleDateString("zh-CN")}
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {items.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            第 {safePage} / {totalPages} 页
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage === 1}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              上一页
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={safePage === totalPages}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
