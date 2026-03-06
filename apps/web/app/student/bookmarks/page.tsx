"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function BookmarksPage() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      setIds(JSON.parse(localStorage.getItem("sis-bookmarks") || "[]"));
    } catch {
      setIds([]);
    }
  }, []);

  function remove(id: string) {
    const next = ids.filter((item) => item !== id);
    setIds(next);
    localStorage.setItem("sis-bookmarks", JSON.stringify(next));
  }

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Bookmarks</h1>
        <p className="mt-1 text-sm text-slate-500">Your saved courses</p>
      </div>
      {ids.length === 0 ? (
        <div className="campus-card p-12 text-center">
          <span className="text-4xl">🔖</span>
          <p className="mt-3 text-slate-500">No bookmarks yet. Browse the catalog and save courses.</p>
          <Link href="/student/catalog" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline">
            Browse Catalog →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {ids.map((id) => (
            <div key={id} className="campus-card flex items-center justify-between p-3">
              <span className="font-mono text-xs text-slate-500">{id}</span>
              <div className="flex gap-2">
                <Link href={`/student/catalog?section=${id}`} className="text-xs text-blue-600 hover:underline">
                  View
                </Link>
                <button type="button" onClick={() => remove(id)} className="text-xs text-red-400 hover:text-red-600">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
