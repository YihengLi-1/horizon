"use client";

import { useEffect, useMemo, useState } from "react";
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

function audienceChip(audience: string): string {
  if (audience === "admin") return "border-violet-200 bg-violet-50 text-violet-700";
  if (audience === "student") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function StudentAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [page, setPage] = useState(1);
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
        if (alive) setError(err instanceof Error ? err.message : "Failed to load announcements");
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

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Announcements</h1>
        <p className="mt-1 text-sm text-slate-500">All active announcements for students</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {visible.length === 0 ? (
        <div className="campus-card p-12 text-center text-slate-400">📢 No active announcements.</div>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <article key={item.id} className="campus-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{item.title}</h2>
                    {item.pinned ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        ★ Pinned
                      </span>
                    ) : null}
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${audienceChip(item.audience)}`}>
                      {item.audience}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {item.body.length > 200 ? `${item.body.slice(0, 200)}…` : item.body}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-400">
                  {item.createdAt ? <p>{new Date(item.createdAt).toLocaleDateString()}</p> : null}
                  {item.expiresAt ? <p>Expires {new Date(item.expiresAt).toLocaleDateString()}</p> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {items.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Page {safePage} / {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage === 1}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={safePage === totalPages}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
