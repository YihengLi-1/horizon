"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
  createdAt: string;
  expiresAt?: string | null;
}

export default function AnnouncementsPage() {
  const [list, setList] = useState<Announcement[]>([]);
  const [form, setForm] = useState({ title: "", body: "", audience: "ALL", pinned: false, expiresAt: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const data = await apiFetch<Announcement[]>("/admin/announcements").catch(() => []);
    setList(data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      setForm({ title: "", body: "", audience: "ALL", pinned: false, expiresAt: "" });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await apiFetch(`/admin/announcements/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Announcements</h1>
        <p className="mt-1 text-sm text-slate-500">Publish notices to students and admins</p>
      </div>

      <form onSubmit={create} className="campus-card space-y-3 p-5">
        <p className="text-sm font-semibold text-slate-700">New Announcement</p>
        <input
          required
          placeholder="Title"
          value={form.title}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          className="campus-input w-full"
        />
        <textarea
          required
          rows={3}
          placeholder="Body"
          value={form.body}
          onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
          className="campus-input w-full"
        />
        <div className="flex flex-wrap gap-3">
          <select
            value={form.audience}
            onChange={(event) => setForm((prev) => ({ ...prev, audience: event.target.value }))}
            className="campus-select"
          >
            <option value="ALL">All Users</option>
            <option value="STUDENT">Students</option>
            <option value="ADMIN">Admins</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(event) => setForm((prev) => ({ ...prev, pinned: event.target.checked }))}
            />
            Pin to top
          </label>
          <input
            type="date"
            value={form.expiresAt}
            onChange={(event) => setForm((prev) => ({ ...prev, expiresAt: event.target.value }))}
            className="campus-input text-sm"
            placeholder="Expires (optional)"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Publishing…" : "Publish"}
        </button>
      </form>

      <div className="space-y-3">
        {list.length === 0 ? (
          <div className="campus-card p-8 text-center text-slate-400">📢 No announcements yet</div>
        ) : (
          list.map((announcement) => (
            <div
              key={announcement.id}
              className={`campus-card p-4 ${
                announcement.pinned ? "border-amber-200 bg-amber-50/30 dark:bg-amber-900/10" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {announcement.pinned ? (
                      <span className="campus-chip border-amber-200 bg-amber-50 text-xs text-amber-700">📌 Pinned</span>
                    ) : null}
                    <span
                      className={`campus-chip text-xs ${
                        announcement.audience === "STUDENT"
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : announcement.audience === "ADMIN"
                            ? "border-violet-200 bg-violet-50 text-violet-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                      }`}
                    >
                      {announcement.audience}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">{announcement.title}</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">{announcement.body}</p>
                  <p className="mt-2 text-xs text-slate-400">
                    {new Date(announcement.createdAt).toLocaleString()}
                    {announcement.expiresAt ? ` · Expires ${new Date(announcement.expiresAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <button onClick={() => void remove(announcement.id)} className="text-sm text-red-400 hover:text-red-600">
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
