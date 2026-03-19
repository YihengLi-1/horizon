"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type MeetingTime = { weekday: number; startMinutes: number; endMinutes: number };

type WaitlistEntry = {
  id: string;
  sectionId: string;
  waitlistPosition: number | null;
  queueSize: number;
  section: {
    id: string;
    sectionCode: string;
    capacity: number;
    instructorName: string;
    course: { code: string; title: string };
    term: { id: string; name: string };
    meetingTimes: MeetingTime[];
  };
};

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function fmt(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function PositionBadge({ position, queueSize }: { position: number | null; queueSize: number }) {
  if (position == null) {
    return <span className="campus-chip border-slate-200 bg-slate-50 text-slate-500">—</span>;
  }
  const isFirst = position === 1;
  const pct = queueSize > 0 ? Math.round(((queueSize - position) / queueSize) * 100) : 0;
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-bold ${isFirst ? "border-emerald-300 bg-emerald-100 text-emerald-700" : "border-amber-300 bg-amber-100 text-amber-700"}`}>
        {isFirst ? "⭐ #1" : `#${position}`}
        <span className="ml-1 text-xs font-normal opacity-70">/ {queueSize}</span>
      </span>
      {queueSize > 1 && (
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${isFirst ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-slate-400">{position - 1} 人排在前面</span>
        </div>
      )}
    </div>
  );
}

export default function WaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshedLabel, setLastRefreshedLabel] = useState("—");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<WaitlistEntry[]>("/registration/my-waitlist");
      setEntries(data);
      setLastRefreshedLabel(new Date().toLocaleTimeString());
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const grouped = entries.reduce<Record<string, WaitlistEntry[]>>((acc, e) => {
    const key = e.section.term.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">候补管理</p>
        <h1 className="campus-title">候补名单</h1>
        <p className="campus-subtitle">实时查看您在各教学班的候补排名（每 60 秒自动刷新）</p>
      </section>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          上次刷新：{lastRefreshedLabel}
        </p>
        <button
          type="button"
          onClick={() => { void load(); }}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          🔄 立即刷新
        </button>
      </div>

      {loading ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-2xl">⏳</p>
          <p className="mt-2 text-sm text-slate-600">加载中…</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-3xl">✅</p>
          <p className="mt-2 text-sm font-medium text-slate-600">您目前没有候补中的课程</p>
          <p className="mt-1 text-xs text-slate-400">当课程满员时，选课操作会将您自动加入候补队列</p>
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-3 gap-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">候补课程数</p>
              <p className="campus-kpi-value">{entries.length}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">排名第1</p>
              <p className="campus-kpi-value text-emerald-600">
                {entries.filter((e) => e.waitlistPosition === 1).length}
              </p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">最高候补位</p>
              <p className="campus-kpi-value text-amber-600">
                {Math.max(...entries.map((e) => e.waitlistPosition ?? 0))}
              </p>
            </div>
          </div>

          {/* Grouped by term */}
          {Object.entries(grouped).map(([termName, termEntries]) => (
            <section key={termName} className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <span className="campus-chip border-slate-200 bg-slate-50 text-slate-600">{termName}</span>
                <span className="text-slate-400 font-normal">{termEntries.length} 门</span>
              </h2>
              <div className="space-y-3">
                {termEntries.map((entry) => (
                  <article key={entry.id} className="campus-card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                            {entry.section.course.code}
                          </span>
                          <span className="text-xs text-slate-500">§{entry.section.sectionCode}</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-slate-800 truncate">
                          {entry.section.course.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{entry.section.instructorName}</p>
                        {entry.section.meetingTimes.length > 0 && (
                          <p className="text-xs text-slate-400 mt-1">
                            {entry.section.meetingTimes
                              .map((m) => `${WEEKDAY[m.weekday]} ${fmt(m.startMinutes)}–${fmt(m.endMinutes)}`)
                              .join(" · ")}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                          <span>容量: {entry.section.capacity} 人</span>
                          <span>·</span>
                          <span>候补队列: {entry.queueSize} 人</span>
                        </div>
                      </div>
                      <PositionBadge position={entry.waitlistPosition} queueSize={entry.queueSize} />
                    </div>

                    {/* Visual queue strip */}
                    {entry.queueSize > 1 && entry.waitlistPosition != null && (
                      <div className="mt-3 flex gap-0.5 overflow-hidden rounded-full">
                        {Array.from({ length: Math.min(entry.queueSize, 20) }).map((_, i) => (
                          <div
                            key={i}
                            title={i + 1 === entry.waitlistPosition ? "您的位置" : `#${i + 1}`}
                            className={`h-2 flex-1 rounded-sm ${i + 1 === entry.waitlistPosition ? "bg-indigo-500" : i + 1 < (entry.waitlistPosition ?? 0) ? "bg-slate-300" : "bg-slate-100"}`}
                          />
                        ))}
                        {entry.queueSize > 20 && <span className="text-xs text-slate-400 ml-1">+{entry.queueSize - 20}</span>}
                      </div>
                    )}

                    {entry.waitlistPosition === 1 && (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 font-medium">
                        🎉 您是候补第一名！一旦有同学退课，您将被自动录取并收到邮件通知。
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
