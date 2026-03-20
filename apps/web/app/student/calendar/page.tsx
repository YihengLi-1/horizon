"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

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
  return new Date(iso).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function isUpcoming(iso: string) {
  const now = new Date();
  const d = new Date(iso);
  const diff = d.getTime() - now.getTime();
  return diff >= 0 && diff < 7 * 24 * 60 * 60 * 1000; // within 7 days
}

function isPast(iso: string) {
  const d = new Date(iso);
  const effective = d;
  return effective < new Date() && !isUpcoming(iso);
}

export default function StudentCalendarPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [filterTermId, setFilterTermId] = useState("");
  const [filterType, setFilterType] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms")
      .then((d) => setTerms(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "学期列表加载失败"));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (filterTermId) params.set("termId", filterTermId);
    void apiFetch<CalendarEvent[]>(`/academics/calendar-events${params.size ? `?${params}` : ""}`)
      .then((d) => setEvents(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "日历加载失败"))
      .finally(() => setLoading(false));
  }, [filterTermId]);

  const filtered = filterType ? events.filter((e) => e.type === filterType) : events;
  const upcoming = filtered.filter((e) => isUpcoming(e.eventDate));
  const future = filtered.filter((e) => !isUpcoming(e.eventDate) && !isPast(e.eventDate));
  const past = filtered.filter((e) => isPast(e.eventDate));

  const allTypes = [...new Set(events.map((e) => e.type))];

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">校园生活</p>
        <h1 className="campus-title">学术日历</h1>
        <p className="campus-subtitle">查看考试日程、假期安排、注册截止日等重要校历事件</p>
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterType("")}
            className={`campus-chip text-xs cursor-pointer ${filterType === "" ? "border-slate-700 bg-slate-900 text-white" : ""}`}
          >
            全部
          </button>
          {allTypes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterType(filterType === t ? "" : t)}
              className={`campus-chip text-xs cursor-pointer ${filterType === t ? TYPE_COLOR[t] : ""}`}
            >
              {TYPE_LABEL[t] ?? t}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <section className="campus-card p-6 text-sm text-red-600">日历暂时不可用：{error}</section>
      ) : null}

      {loading ? (
        <section className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="campus-card p-4 animate-pulse">
              <div className="h-4 w-1/3 rounded bg-slate-200" />
              <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
            </div>
          ))}
        </section>
      ) : null}

      {!loading && !error && filtered.length === 0 ? (
        <section className="campus-card p-8 text-center text-sm text-slate-500">
          暂无日历事件。
        </section>
      ) : null}

      {!loading && !error && filtered.length > 0 ? (
        <>
          {upcoming.length > 0 ? (
            <section className="space-y-2">
              <h2 className="px-1 text-xs font-semibold text-amber-600">
                即将到来（7 天内）
              </h2>
              {upcoming.map((ev) => (
                <EventCard key={ev.id} ev={ev} highlight />
              ))}
            </section>
          ) : null}

          {future.length > 0 ? (
            <section className="space-y-2">
              <h2 className="px-1 text-xs font-semibold text-slate-500">
                未来日程
              </h2>
              {future.map((ev) => (
                <EventCard key={ev.id} ev={ev} />
              ))}
            </section>
          ) : null}

          {past.length > 0 ? (
            <section className="space-y-2">
              <h2 className="px-1 text-xs font-semibold text-slate-400">
                历史事件
              </h2>
              {past.map((ev) => (
                <EventCard key={ev.id} ev={ev} muted />
              ))}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function EventCard({ ev, highlight, muted }: { ev: CalendarEvent; highlight?: boolean; muted?: boolean }) {
  return (
    <article
      className={`campus-card p-4 space-y-1 ${highlight ? "border-amber-300 bg-amber-50/30" : ""} ${muted ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`campus-chip text-[11px] ${TYPE_COLOR[ev.type] ?? "border-slate-200 bg-slate-50 text-slate-700"}`}>
          {TYPE_LABEL[ev.type] ?? ev.type}
        </span>
        {ev.term ? (
          <span className="campus-chip text-[11px]">{ev.term.name}</span>
        ) : null}
        {highlight ? (
          <span className="campus-chip text-[11px] border-amber-300 bg-amber-100 text-amber-700">即将到来</span>
        ) : null}
      </div>
      <p className={`font-semibold ${muted ? "text-slate-500" : "text-slate-900"}`}>{ev.title}</p>
      <p className="text-xs text-slate-500">
        {fmtDate(ev.eventDate)}
        {ev.endDate ? ` — ${fmtDate(ev.endDate)}` : ""}
      </p>
      {ev.description ? (
        <p className="text-sm text-slate-600 whitespace-pre-wrap">{ev.description}</p>
      ) : null}
    </article>
  );
}
