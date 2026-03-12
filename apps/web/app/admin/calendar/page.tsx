"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };
type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  eventDate: string;
  endDate: string | null;
  type: string;
  termId: string | null;
  term?: { id: string; name: string } | null;
};

const EVENT_TYPES = ["INFO", "EXAM", "HOLIDAY", "DEADLINE", "REGISTRATION"] as const;
type EventType = typeof EVENT_TYPES[number];

const TYPE_META: Record<EventType, { label: string; emoji: string; cls: string }> = {
  INFO:         { label: "公告",     emoji: "ℹ️",  cls: "border-slate-200 bg-slate-50 text-slate-600" },
  EXAM:         { label: "考试",     emoji: "📝",  cls: "border-red-200 bg-red-50 text-red-700" },
  HOLIDAY:      { label: "假期",     emoji: "🏖️",  cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  DEADLINE:     { label: "截止日期", emoji: "⏰",  cls: "border-amber-200 bg-amber-50 text-amber-700" },
  REGISTRATION: { label: "选课",     emoji: "🗂️",  cls: "border-indigo-200 bg-indigo-50 text-indigo-700" }
};

function TypeChip({ type }: { type: string }) {
  const meta = TYPE_META[type as EventType] ?? { label: type, emoji: "📅", cls: "border-slate-200 bg-slate-50 text-slate-600" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>
      {meta.emoji} {meta.label}
    </span>
  );
}

const EMPTY_FORM = { title: "", description: "", eventDate: "", endDate: "", type: "INFO" as EventType, termId: "" };

export default function AdminCalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterType, setFilterType] = useState<EventType | "all">("all");
  const [filterTerm, setFilterTerm] = useState("");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsData, termsData] = await Promise.all([
        apiFetch<CalendarEvent[]>("/academics/calendar-events"),
        apiFetch<Term[]>("/academics/terms")
      ]);
      setEvents(eventsData);
      setTerms(termsData);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.eventDate) return;
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        eventDate: form.eventDate,
        endDate: form.endDate || undefined,
        type: form.type,
        termId: form.termId || undefined
      };
      if (editingId) {
        await apiFetch(`/admin/calendar-events/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/admin/calendar-events", { method: "POST", body: JSON.stringify(payload) });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await loadEvents();
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("确认删除该日历事件？")) return;
    try {
      await apiFetch(`/admin/calendar-events/${id}`, { method: "DELETE" });
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch { /* ignore */ }
  }

  function startEdit(event: CalendarEvent) {
    setForm({
      title: event.title,
      description: event.description ?? "",
      eventDate: event.eventDate.slice(0, 10),
      endDate: event.endDate ? event.endDate.slice(0, 10) : "",
      type: (event.type as EventType) ?? "INFO",
      termId: event.termId ?? ""
    });
    setEditingId(event.id);
    setShowForm(true);
  }

  const filtered = events.filter((e) => {
    if (filterType !== "all" && e.type !== filterType) return false;
    if (filterTerm && e.termId !== filterTerm) return false;
    return true;
  });

  // Group events by month
  const grouped = filtered.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    const key = new Date(e.eventDate).toLocaleDateString("zh-CN", { year: "numeric", month: "long" });
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Calendar</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">日历事件管理</h1>
        <p className="mt-1 text-sm text-slate-500">管理学术日历事件，学生日历页面将同步显示</p>
      </section>

      {/* KPI */}
      {!loading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="campus-kpi">
            <p className="campus-kpi-label">总事件数</p>
            <p className="campus-kpi-value">{events.length}</p>
          </div>
          {EVENT_TYPES.slice(0, 3).map((t) => (
            <div key={t} className="campus-kpi">
              <p className="campus-kpi-label">{TYPE_META[t].label}</p>
              <p className="campus-kpi-value">{events.filter((e) => e.type === t).length}</p>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="campus-toolbar flex-wrap gap-3">
        <div className="flex gap-2">
          <select
            className="campus-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as EventType | "all")}
          >
            <option value="all">所有类型</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_META[t].emoji} {TYPE_META[t].label}</option>
            ))}
          </select>
          <select
            className="campus-select"
            value={filterTerm}
            onChange={(e) => setFilterTerm(e.target.value)}
          >
            <option value="">所有学期</option>
            {terms.map((term) => (
              <option key={term.id} value={term.id}>{term.name}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm((v) => !v); setEditingId(null); setForm(EMPTY_FORM); }}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          {showForm ? "✕ 取消" : "+ 新建事件"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <section className="campus-card p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900">{editingId ? "编辑事件" : "新建日历事件"}</h2>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">标题 *</label>
                <input
                  className="campus-input w-full"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="例如：期末考试周"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">开始日期 *</label>
                <input
                  type="date"
                  className="campus-input w-full"
                  value={form.eventDate}
                  onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">结束日期（可选）</label>
                <input
                  type="date"
                  className="campus-input w-full"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">类型</label>
                <select
                  className="campus-select w-full"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as EventType }))}
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_META[t].emoji} {TYPE_META[t].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">关联学期（可选）</label>
                <select
                  className="campus-select w-full"
                  value={form.termId}
                  onChange={(e) => setForm((f) => ({ ...f, termId: e.target.value }))}
                >
                  <option value="">不关联学期</option>
                  {terms.map((term) => (
                    <option key={term.id} value={term.id}>{term.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">描述（可选）</label>
                <textarea
                  className="campus-input w-full min-h-[60px]"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="事件详情…"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? "保存中…" : editingId ? "保存更改" : "创建事件"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Events list */}
      {loading ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-2xl">⏳</p>
          <p className="mt-2 text-sm text-slate-600">加载中…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-3xl">📅</p>
          <p className="mt-2 text-sm font-medium text-slate-600">暂无日历事件</p>
          <p className="mt-1 text-xs text-slate-400">点击「新建事件」添加第一个日历事件</p>
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([month, monthEvents]) => (
            <section key={month}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{month}</h2>
              <div className="space-y-2">
                {monthEvents.map((event) => {
                  const isPast = new Date(event.eventDate) < new Date();
                  return (
                    <article
                      key={event.id}
                      className={`campus-card p-4 ${isPast ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <TypeChip type={event.type} />
                            {event.term && (
                              <span className="campus-chip border-slate-100 bg-slate-50 text-slate-500 text-xs">
                                {event.term.name}
                              </span>
                            )}
                            {isPast && <span className="text-xs text-slate-400">已过期</span>}
                          </div>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{event.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {new Date(event.eventDate).toLocaleDateString("zh-CN")}
                            {event.endDate && ` — ${new Date(event.endDate).toLocaleDateString("zh-CN")}`}
                          </p>
                          {event.description && (
                            <p className="mt-1 text-xs text-slate-400">{event.description}</p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEdit(event)}
                            className="rounded px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(event.id)}
                            className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
