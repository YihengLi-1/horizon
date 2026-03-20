"use client";

import { useEffect, useState, useCallback } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Term = { id: string; name: string };

type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  eventDate: string;
  endDate?: string | null;
  type: string;
  termId?: string | null;
  term?: { id: string; name: string } | null;
};

const EVENT_TYPES = ["INFO", "EXAM", "HOLIDAY", "DEADLINE", "REGISTRATION"] as const;

const TYPE_LABEL: Record<string, string> = {
  INFO: "通知",
  EXAM: "考试",
  HOLIDAY: "假期",
  DEADLINE: "截止日",
  REGISTRATION: "注册",
};

const TYPE_COLOR: Record<string, string> = {
  INFO: "border-blue-200 bg-blue-50 text-blue-700",
  EXAM: "border-red-200 bg-red-50 text-red-700",
  HOLIDAY: "border-green-200 bg-green-50 text-green-700",
  DEADLINE: "border-amber-200 bg-amber-50 text-amber-700",
  REGISTRATION: "border-purple-200 bg-purple-50 text-purple-700",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

const BLANK_FORM = { title: "", description: "", eventDate: "", endDate: "", type: "INFO", termId: "" };

export default function CalendarPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [filterTermId, setFilterTermId] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const toast = useToast();

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms")
      .then((d) => setTerms(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "学期列表加载失败"));
  }, []);

  const load = useCallback(async (tid: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (tid) params.set("termId", tid);
      const d = await apiFetch<CalendarEvent[]>(`/academics/calendar-events${params.size ? `?${params}` : ""}`);
      setEvents(d ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "日历加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filterTermId);
  }, [load, filterTermId]);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...BLANK_FORM });
    setShowForm(true);
  };

  const openEdit = (ev: CalendarEvent) => {
    setEditingId(ev.id);
    setForm({
      title: ev.title,
      description: ev.description ?? "",
      eventDate: ev.eventDate.slice(0, 10),
      endDate: ev.endDate ? ev.endDate.slice(0, 10) : "",
      type: ev.type,
      termId: ev.termId ?? "",
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...BLANK_FORM });
  };

  const saveForm = async () => {
    if (!form.title.trim() || !form.eventDate) {
      toast("请填写标题和日期", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        eventDate: new Date(form.eventDate).toISOString(),
        endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
        type: form.type,
        termId: form.termId || undefined,
      };
      if (editingId) {
        await apiFetch(`/admin/calendar-events/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast("日历事件已更新", "success");
      } else {
        await apiFetch("/admin/calendar-events", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast("日历事件已创建", "success");
      }
      cancelForm();
      await load(filterTermId);
    } catch (err) {
      if (err instanceof ApiError) {
        toast(err.message, "error");
      } else {
        toast("保存失败", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = (id: string) => {
    setConfirmState({
      title: "删除日历事件",
      message: "确认删除该日历事件？",
      onConfirm: async () => {
        setConfirmState(null);
        setDeletingId(id);
        try {
          await apiFetch(`/admin/calendar-events/${id}`, { method: "DELETE" });
          toast("日历事件已删除", "success");
          await load(filterTermId);
        } catch (err) {
          if (err instanceof ApiError) toast(err.message, "error");
          else toast("删除失败", "error");
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">学术管理</p>
        <h1 className="campus-title">学术日历</h1>
        <p className="campus-subtitle">管理考试、假期、注册截止日等重要校历事件</p>
      </section>

      <section className="campus-toolbar flex-wrap gap-3">
        <select
          className="campus-select w-48"
          value={filterTermId}
          onChange={(e) => setFilterTermId(e.target.value)}
        >
          <option value="">全部学期</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          ＋ 添加事件
        </button>
      </section>

      {/* Inline form */}
      {showForm ? (
        <section className="campus-card p-5 space-y-4 border-2 border-slate-300 max-w-xl">
          <h2 className="text-sm font-semibold text-slate-800">
            {editingId ? "编辑日历事件" : "新建日历事件"}
          </h2>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">标题 *</span>
              <input
                type="text"
                className="campus-input"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="事件标题"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">开始日期 *</span>
                <input
                  type="date"
                  className="campus-input"
                  value={form.eventDate}
                  onChange={(e) => setForm((p) => ({ ...p, eventDate: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">结束日期</span>
                <input
                  type="date"
                  className="campus-input"
                  value={form.endDate}
                  onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">事件类型</span>
                <select
                  className="campus-select"
                  value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">关联学期</span>
                <select
                  className="campus-select"
                  value={form.termId}
                  onChange={(e) => setForm((p) => ({ ...p, termId: e.target.value }))}
                >
                  <option value="">不关联</option>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">说明</span>
              <textarea
                className="campus-input min-h-20"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="可选：事件详细说明"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void saveForm()}
              disabled={saving}
              className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              disabled={saving}
              className="campus-btn-ghost h-9 px-4 text-sm"
            >
              取消
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="campus-card p-6 text-sm text-red-600">日历暂时不可用：{error}</section>
      ) : null}

      {!error && loading ? (
        <section className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="campus-card p-4 animate-pulse">
              <div className="h-4 w-1/3 rounded bg-slate-200" />
              <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
            </div>
          ))}
        </section>
      ) : null}

      {!error && !loading && events.length === 0 ? (
        <section className="campus-card p-8 text-center text-sm text-slate-500">
          暂无日历事件。点击「添加事件」创建第一条。
        </section>
      ) : null}

      {!error && !loading && events.length > 0 ? (
        <section className="space-y-2">
          {events.map((ev) => (
            <article
              key={ev.id}
              className={`campus-card p-4 flex flex-wrap items-start gap-3 ${editingId === ev.id ? "border-2 border-blue-400" : ""}`}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`campus-chip text-[11px] ${TYPE_COLOR[ev.type] ?? "border-slate-200 bg-slate-50 text-slate-700"}`}>
                    {TYPE_LABEL[ev.type] ?? ev.type}
                  </span>
                  {ev.term ? (
                    <span className="campus-chip text-[11px]">{ev.term.name}</span>
                  ) : null}
                </div>
                <p className="font-semibold text-slate-900">{ev.title}</p>
                <p className="text-xs text-slate-500">
                  {fmtDate(ev.eventDate)}
                  {ev.endDate ? ` — ${fmtDate(ev.endDate)}` : ""}
                </p>
                {ev.description ? (
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">{ev.description}</p>
                ) : null}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(ev)}
                  className="campus-chip cursor-pointer text-xs"
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => void deleteEvent(ev.id)}
                  disabled={deletingId === ev.id}
                  className="campus-chip cursor-pointer text-xs border-red-200 bg-red-50 text-red-700 disabled:opacity-60"
                >
                  {deletingId === ev.id ? "删除中…" : "删除"}
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}
      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
