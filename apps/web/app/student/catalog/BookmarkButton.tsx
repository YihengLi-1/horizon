"use client";

import { useEffect, useState } from "react";
import { BookmarkIcon } from "lucide-react";

export default function BookmarkButton({ sectionId }: { sectionId: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const bookmarks = new Set<string>(JSON.parse(localStorage.getItem("sis-bookmarks") || "[]"));
      setSaved(bookmarks.has(sectionId));
    } catch {
      setSaved(false);
    }
  }, [sectionId]);

  function toggle() {
    const bookmarks = new Set<string>(JSON.parse(localStorage.getItem("sis-bookmarks") || "[]"));
    if (bookmarks.has(sectionId)) bookmarks.delete(sectionId);
    else bookmarks.add(sectionId);
    localStorage.setItem("sis-bookmarks", JSON.stringify([...bookmarks]));
    setSaved(bookmarks.has(sectionId));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={saved ? "Remove bookmark" : "Bookmark this course"}
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
        saved ? "text-amber-500 hover:text-amber-700" : "text-slate-300 hover:text-slate-500"
      }`}
    >
      <BookmarkIcon className="h-4 w-4" fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
