"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Announcement = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  expiresAt?: string | null;
};

function getAnnouncementTone(announcement: Announcement) {
  const text = `${announcement.title} ${announcement.body}`.toLowerCase();
  if (text.includes("urgent") || text.includes("紧急") || text.includes("立即") || text.includes("逾期")) {
    return {
      bar: "bg-red-500",
      badge: "campus-chip chip-red",
      label: "urgent"
    };
  }
  if (text.includes("warning") || text.includes("提醒") || text.includes("截止") || text.includes("注意")) {
    return {
      bar: "bg-amber-500",
      badge: "campus-chip chip-amber",
      label: "warning"
    };
  }
  return {
    bar: "bg-blue-500",
    badge: "campus-chip chip-blue",
    label: "info"
  };
}

export default function PinnedAnnouncements({ announcements }: { announcements: Announcement[] }) {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const announcement of announcements) {
      if (window.sessionStorage.getItem(`dismissed_ann_${announcement.id}`) === "1") {
        next[announcement.id] = true;
      }
    }
    setDismissed(next);
  }, [announcements]);

  const visible = useMemo(
    () => announcements.filter((announcement) => announcement.pinned && !dismissed[announcement.id]),
    [announcements, dismissed]
  );

  if (!visible.length) return null;

  return (
    <div className="space-y-3">
      {visible.map((announcement) => {
        const tone = getAnnouncementTone(announcement);
        return (
          <div key={announcement.id} className="campus-card relative overflow-hidden p-4">
            <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} />
            <div className="flex items-start justify-between gap-3 pl-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={tone.badge}>{tone.label}</span>
                  <span className="text-xs text-slate-500">
                    {announcement.expiresAt ? `有效至 ${new Date(announcement.expiresAt).toLocaleDateString()}` : "最新公告"}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-900">{announcement.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{announcement.body}</p>
                <div className="mt-3">
                  <Link
                    href="/student/announcements"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 no-underline hover:text-indigo-800"
                  >
                    查看公告详情 →
                  </Link>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  window.sessionStorage.setItem(`dismissed_ann_${announcement.id}`, "1");
                  setDismissed((current) => ({ ...current, [announcement.id]: true }));
                }}
                className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label={`Dismiss ${announcement.title}`}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
