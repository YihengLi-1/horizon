"use client";

import { useEffect, useMemo, useState } from "react";

type Announcement = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
};

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
      {visible.map((announcement) => (
        <div key={announcement.id} className="campus-card border border-blue-200 bg-blue-50/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-blue-900">{announcement.title}</p>
              <p className="mt-1 text-xs text-blue-800/80">{announcement.body}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                window.sessionStorage.setItem(`dismissed_ann_${announcement.id}`, "1");
                setDismissed((current) => ({ ...current, [announcement.id]: true }));
              }}
              className="rounded px-2 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
              aria-label={`Dismiss ${announcement.title}`}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
