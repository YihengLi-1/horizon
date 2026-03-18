"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
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

type AudienceFilter = "ALL" | "STUDENT" | "ADMIN" | "ALL_USERS";

type AnnouncementForm = {
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
  expiresAt: string;
};

function emptyForm(): AnnouncementForm {
  return { title: "", body: "", audience: "ALL", pinned: false, expiresAt: "" };
}

function toDateInput(value?: string | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 16);
}

function isExpired(item: Announcement): boolean {
  return Boolean(item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now());
}

function audienceLabel(audience: string): string {
  if (audience === "STUDENT") return "学生";
  if (audience === "ADMIN") return "管理员";
  return "所有人";
}

export default function AnnouncementsPage() {
  const toast = useToast();
  const [list, setList] = useState<Announcement[]>([]);
  const [form, setForm] = useState<AnnouncementForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AnnouncementForm>(emptyForm());
  const [previewing, setPreviewing] = useState<Announcement | null>(null);
  const [filterAudience, setFilterAudience] = useState<AudienceFilter>("ALL");
  const [saving, setSaving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    const data = await apiFetch<Announcement[]>("/admin/announcements").catch(() => []);
    setList(data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiFetch("/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null
        })
      });
      setForm(emptyForm());
      toast("公告已发布", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "发布失败", "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    setSavingEdit(true);
    try {
      await apiFetch(`/admin/announcements/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          expiresAt: editForm.expiresAt ? new Date(editForm.expiresAt).toISOString() : null
        })
      });
      setEditingId(null);
      setEditForm(emptyForm());
      toast("公告已更新", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "更新失败", "error");
    } finally {
      setSavingEdit(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("确认删除这条公告？")) return;
    try {
      await apiFetch(`/admin/announcements/${id}`, { method: "DELETE" });
      toast("公告已删除", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "删除失败", "error");
    }
  }

  const stats = useMemo(() => {
    const active = list.filter((item) => !isExpired(item)).length;
    const pinned = list.filter((item) => item.pinned).length;
    const expired = list.filter(isExpired).length;
    return { total: list.length, active, pinned, expired };
  }, [list]);

  const visibleList = useMemo(() => {
    return [...list]
      .filter((item) => {
        if (filterAudience === "ALL") return true;
        if (filterAudience === "ALL_USERS") return item.audience === "ALL";
        return item.audience === filterAudience;
      })
      .sort((a, b) => {
        const expiredA = isExpired(a) ? 1 : 0;
        const expiredB = isExpired(b) ? 1 : 0;
        if (expiredA !== expiredB) return expiredA - expiredB;
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [filterAudience, list]);

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">系统公告</h1>
        <p className="mt-1 text-sm text-slate-500">向学生和管理员发布通知公告。</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="campus-kpi"><p className="text-xs font-semibold uppercase text-slate-500">总计</p><p className="mt-1 text-2xl font-bold text-slate-900">{stats.total}</p></div>
        <div className="campus-kpi border-emerald-200 bg-emerald-50/70"><p className="text-xs font-semibold uppercase text-emerald-700">生效中</p><p className="mt-1 text-2xl font-bold text-emerald-900">{stats.active}</p></div>
        <div className="campus-kpi border-amber-200 bg-amber-50/70"><p className="text-xs font-semibold uppercase text-amber-700">置顶</p><p className="mt-1 text-2xl font-bold text-amber-900">{stats.pinned}</p></div>
        <div className="campus-kpi border-red-200 bg-red-50/70"><p className="text-xs font-semibold uppercase text-red-700">已过期</p><p className="mt-1 text-2xl font-bold text-red-900">{stats.expired}</p></div>
      </div>

      <form onSubmit={create} className="campus-card space-y-3 p-5">
        <p className="text-sm font-semibold text-slate-700">新建公告</p>
        <input
          required
          placeholder="标题"
          value={form.title}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          className="campus-input w-full"
        />
        <textarea
          required
          rows={4}
          placeholder="正文内容"
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
            <option value="ALL">全部用户</option>
            <option value="STUDENT">学生</option>
            <option value="ADMIN">管理员</option>
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
            type="datetime-local"
            value={form.expiresAt}
            onChange={(event) => setForm((prev) => ({ ...prev, expiresAt: event.target.value }))}
            className="campus-input text-sm"
            placeholder="过期时间（选填）"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "发布中…" : "发布"}
        </button>
      </form>

      <section className="campus-toolbar">
        <div className="flex flex-wrap gap-2">
          {([
            ["ALL", "全部"],
            ["STUDENT", "学生"],
            ["ADMIN", "管理员"],
            ["ALL_USERS", "所有人"]
          ] as Array<[AudienceFilter, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilterAudience(value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                filterAudience === value
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <div className="space-y-3">
        {visibleList.length === 0 ? (
          <div className="campus-card p-8 text-center text-slate-400">📢 No announcements yet</div>
        ) : (
          visibleList.map((announcement) => {
            const expired = isExpired(announcement);
            const editing = editingId === announcement.id;
            return (
              <div
                key={announcement.id}
                className={`campus-card p-4 ${announcement.pinned ? "border-amber-200 bg-amber-50/30 dark:bg-amber-900/10" : ""} ${expired ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
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
                        {audienceLabel(announcement.audience)}
                      </span>
                      {expired ? <span className="campus-chip border-red-200 bg-red-50 text-xs text-red-700">已过期</span> : null}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">{announcement.title}</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">{announcement.body}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      {new Date(announcement.createdAt).toLocaleString()}
                      {announcement.expiresAt ? ` · 过期：${new Date(announcement.expiresAt).toLocaleString('zh-CN')}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewing(announcement)}
                      className="text-sm text-slate-500 hover:text-slate-700"
                    >
                      预览
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(announcement.id);
                        setEditForm({
                          title: announcement.title,
                          body: announcement.body,
                          audience: announcement.audience,
                          pinned: announcement.pinned,
                          expiresAt: toDateInput(announcement.expiresAt)
                        });
                      }}
                      className="text-sm text-blue-500 hover:text-blue-700"
                    >
                      编辑
                    </button>
                    <button onClick={() => void remove(announcement.id)} className="text-sm text-red-400 hover:text-red-600">
                      Delete
                    </button>
                  </div>
                </div>

                {editing ? (
                  <form onSubmit={saveEdit} className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <input
                      required
                      value={editForm.title}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                      className="campus-input w-full"
                    />
                    <textarea
                      required
                      rows={4}
                      value={editForm.body}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, body: event.target.value }))}
                      className="campus-input w-full"
                    />
                    <div className="flex flex-wrap gap-3">
                      <select
                        value={editForm.audience}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, audience: event.target.value }))}
                        className="campus-select"
                      >
                        <option value="ALL">全部用户</option>
                        <option value="STUDENT">学生</option>
                        <option value="ADMIN">管理员</option>
                      </select>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editForm.pinned}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, pinned: event.target.checked }))}
                        />
                        Pinned
                      </label>
                      <input
                        type="datetime-local"
                        value={editForm.expiresAt}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, expiresAt: event.target.value }))}
                        className="campus-input text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={savingEdit} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        {savingEdit ? "保存中…" : "保存"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {previewing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4" onClick={() => setPreviewing(null)}>
          <div className="campus-card w-full max-w-2xl p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  {previewing.pinned ? <span className="campus-chip border-amber-200 bg-amber-50 text-xs text-amber-700">★ Pinned</span> : null}
                  <span className="campus-chip border-slate-200 bg-slate-50 text-xs text-slate-600">{audienceLabel(previewing.audience)}</span>
                </div>
                <h2 className="mt-3 text-xl font-bold text-slate-900">{previewing.title}</h2>
              </div>
              <button type="button" onClick={() => setPreviewing(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <p className="mt-4 whitespace-pre-line text-sm text-slate-600">{previewing.body}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
              <span>创建于 {new Date(previewing.createdAt).toLocaleString()}</span>
              {previewing.expiresAt ? <span>过期：{new Date(previewing.expiresAt).toLocaleString('zh-CN')}</span> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
