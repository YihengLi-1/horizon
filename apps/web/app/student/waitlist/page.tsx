"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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

function fmt(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function meetingSummary(mts: MeetingTime[]) {
  if (!mts.length) return "异步";
  return mts.map((mt) => `${WEEKDAY[mt.weekday]} ${fmt(mt.startMinutes)}–${fmt(mt.endMinutes)}`).join(", ");
}

function PositionBar({ position, total }: { position: number; total: number }) {
  const pct = total > 0 ? Math.round(((total - position + 1) / total) * 100) : 0;
  const tone =
    position === 1
      ? "bg-emerald-500"
      : position <= 3
      ? "bg-amber-400"
      : "bg-slate-300";
  return (
    <div className="mt-2 space-y-1">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-slate-400">队列中第 {position} / {total} 位</p>
    </div>
  );
}

const POLL_INTERVAL_MS = 30_000;

export default function StudentWaitlistPage() {
  const [items, setItems] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(POLL_INTERVAL_MS / 1000);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchWaitlist = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiFetch<WaitlistEntry[]>("/registration/my-waitlist");
      setItems(data ?? []);
      setLastRefreshed(new Date());
      setError("");
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    void fetchWaitlist(false);

    timerRef.current = setInterval(() => {
      void fetchWaitlist(true);
      setCountdown(POLL_INTERVAL_MS / 1000);
    }, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchWaitlist]);

  // Countdown ticker
  useEffect(() => {
    const ticker = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? POLL_INTERVAL_MS / 1000 : prev - 1));
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  return (
    <div className="campus-page space-y-6">
      <div className="flex gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-1 text-sm w-fit">
        <Link href="/student/catalog" className="px-4 py-1.5 text-slate-500 transition hover:text-slate-700 no-underline">课程目录</Link>
        <Link href="/student/cart" className="px-4 py-1.5 text-slate-500 transition hover:text-slate-700 no-underline">购物车</Link>
        <Link href="/student/schedule" className="px-4 py-1.5 text-slate-500 transition hover:text-slate-700 no-underline">我的课表</Link>
        <span className="rounded-lg bg-white px-4 py-1.5 font-semibold text-slate-900 shadow-sm">候补名单</span>
      </div>
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="campus-eyebrow">选课候补</p>
            <h1 className="campus-title">我的候补名单</h1>
            <p className="campus-subtitle">
              当前排队等待的课程班级，满员时按队列顺序自动录取。
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 pt-1">
            <button
              type="button"
              onClick={() => { void fetchWaitlist(false); setCountdown(POLL_INTERVAL_MS / 1000); }}
              className="campus-btn-ghost text-xs"
            >
              立即刷新
            </button>
            <p className="text-[11px] text-slate-400">
              {lastRefreshed ? `${lastRefreshed.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 更新` : "加载中…"}
              {" · "}
              {countdown}s 后自动刷新
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">加载中…</div>
      ) : items.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-sm font-medium text-slate-700">暂无候补记录</p>
          <p className="mt-1 text-xs text-slate-400">你当前没有排队等待的课程。</p>
          <Link
            href="/student/catalog"
            className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white no-underline hover:bg-slate-700"
          >
            浏览课程目录
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="campus-kpi">
              <p className="campus-kpi-label">候补总数</p>
              <p className="campus-kpi-value">{items.length}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">排第 1 位</p>
              <p className="campus-kpi-value text-emerald-600">
                {items.filter((i) => i.waitlistPosition === 1).length}
              </p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">最前排名</p>
              <p className="campus-kpi-value">
                {Math.min(...items.map((i) => i.waitlistPosition ?? 999))}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
            候补录取自动进行，无需手动确认。录取成功后你将收到系统通知，
            请确保到时课表无冲突。若要放弃候补，请前往{" "}
            <Link href="/student/schedule" className="font-semibold underline">课表页面</Link>{" "}
            退出。
          </div>

          <div className="space-y-3">
            {items.map((entry) => (
              <div
                key={entry.id}
                className="campus-card p-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {entry.section.course.code}
                    </span>
                    <span className="text-sm text-slate-600">{entry.section.course.title}</span>
                    <span className="campus-chip chip-blue text-xs">{entry.section.term.name}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {entry.section.sectionCode} · {entry.section.instructorName || "待定"} ·{" "}
                    {meetingSummary(entry.section.meetingTimes)}
                  </p>
                  {entry.waitlistPosition !== null ? (
                    <PositionBar
                      position={entry.waitlistPosition}
                      total={entry.queueSize}
                    />
                  ) : null}
                </div>
                <div className="shrink-0 text-center sm:text-right">
                  <p className="text-2xl font-bold text-slate-900">
                    #{entry.waitlistPosition ?? "—"}
                  </p>
                  <p className="text-xs text-slate-400">当前排名</p>
                  <p className="mt-1 text-xs text-slate-500">
                    容量 {entry.section.capacity} 人
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
