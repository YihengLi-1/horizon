"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/Toast";

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function minutesToTime(m: number) {
  return `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}`;
}

type MeetingTime = { weekday: number; startMinutes: number; endMinutes: number };

type WatchedSection = {
  id: string;
  createdAt: string;
  section: {
    id: string;
    sectionCode: string;
    instructorName: string | null;
    capacity: number;
    meetingTimes: MeetingTime[];
    course: { code: string; title: string; credits: number };
    term: { id: string; name: string };
    _count: { enrollments: number };
  };
};

function seatLabel(capacity: number, enrolled: number) {
  const seats = capacity - enrolled;
  if (capacity === 0) return { text: "不限名额", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" };
  if (seats <= 0) return { text: "已满班", color: "text-red-700", bg: "bg-red-50 border-red-200" };
  if (seats <= 3) return { text: `仅剩 ${seats} 席`, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" };
  return { text: `${seats} 席空余`, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" };
}

export default function WatchlistPage() {
  const toast = useToast();
  const [watches, setWatches] = useState<WatchedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  async function load() {
    try {
      const d = await apiFetch<WatchedSection[]>("/registration/watches");
      setWatches(d ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function removeWatch(sectionId: string) {
    setRemoving(sectionId);
    try {
      await apiFetch(`/registration/watch/${sectionId}`, { method: "DELETE" });
      setWatches((prev) => prev.filter((w) => w.section.id !== sectionId));
      toast("已取消订阅", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "取消失败", "error");
    } finally {
      setRemoving(null);
    }
  }

  async function addToCart(sectionId: string) {
    try {
      await apiFetch("/registration/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId })
      });
      toast("已加入购物车", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "加入购物车失败", "error");
    }
  }

  const available = watches.filter((w) => {
    const enrolled = w.section._count.enrollments;
    return w.section.capacity === 0 || enrolled < w.section.capacity;
  });

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">选课工具</p>
        <h1 className="campus-title">课程订阅</h1>
        <p className="campus-subtitle">当订阅的班级出现空位时系统会通知您</p>
      </section>

      {!loading && watches.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="campus-kpi">
            <p className="campus-kpi-label">订阅总数</p>
            <p className="campus-kpi-value">{watches.length}</p>
          </div>
          <div className="campus-kpi border-emerald-200 bg-emerald-50/70">
            <p className="campus-kpi-label text-emerald-700">当前有空位</p>
            <p className="campus-kpi-value text-emerald-900">{available.length}</p>
          </div>
          <div className="campus-kpi border-red-200 bg-red-50/70">
            <p className="campus-kpi-label text-red-700">已满班</p>
            <p className="campus-kpi-value text-red-900">{watches.length - available.length}</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : watches.length === 0 ? (
        <div className="campus-card p-10 text-center text-slate-400">
          <p>暂无订阅的班级</p>
          <p className="mt-2 text-xs">在
            <Link href="/student/catalog" className="text-blue-500 hover:underline mx-1">课程目录</Link>
            中点击"🔔 空位通知我"即可订阅</p>
        </div>
      ) : (
        <div className="space-y-3">
          {watches.map((w) => {
            const enrolled = w.section._count.enrollments;
            const seat = seatLabel(w.section.capacity, enrolled);
            return (
              <div key={w.id} className="campus-card p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{w.section.course.code}</span>
                      <span className="text-sm text-slate-700">{w.section.course.title}</span>
                      <span className="campus-chip border-slate-200 bg-slate-50 text-xs text-slate-500">
                        {w.section.term.name} · {w.section.sectionCode}
                      </span>
                      <span className={`campus-chip text-xs ${seat.bg} ${seat.color}`}>
                        {seat.text}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {w.section.instructorName ?? "教师待定"} · {w.section.course.credits} 学分
                    </p>
                    {w.section.meetingTimes.length > 0 ? (
                      <p className="mt-1 text-xs text-slate-400">
                        {w.section.meetingTimes.map((mt) =>
                          `${WEEKDAY[mt.weekday]} ${minutesToTime(mt.startMinutes)}–${minutesToTime(mt.endMinutes)}`
                        ).join("  ")}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-400">
                      {enrolled}/{w.section.capacity > 0 ? w.section.capacity : "不限"} 人 · 订阅于 {new Date(w.createdAt).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {w.section.capacity === 0 || enrolled < w.section.capacity ? (
                      <button
                        type="button"
                        onClick={() => void addToCart(w.section.id)}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        加入购物车
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void removeWatch(w.section.id)}
                      disabled={removing === w.section.id}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {removing === w.section.id ? "处理中…" : "取消订阅"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
