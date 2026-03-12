"use client";

import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

type WatchedSection = {
  id: string;
  sectionId: string;
  notifiedAt: string | null;
  createdAt: string;
  section: {
    id: string;
    sectionCode: string;
    instructorName: string | null;
    capacity: number;
    term: { id: string; name: string } | null;
    course: { id: string; code: string; title: string; credits: number };
    _count: { enrollments: number };
  };
};

export default function WatchedSectionsPage() {
  const [watches, setWatches] = useState<WatchedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<WatchedSection[]>("/registration/watches");
      setWatches(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUnwatch(sectionId: string) {
    setRemoving((prev) => new Set([...prev, sectionId]));
    try {
      await apiFetch(`/registration/watch/${sectionId}`, { method: "DELETE" });
      setWatches((prev) => prev.filter((w) => w.sectionId !== sectionId));
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(sectionId);
        return next;
      });
    }
  }

  function seatsLeft(w: WatchedSection): number {
    if (w.section.capacity === 0) return Infinity;
    return Math.max(0, w.section.capacity - w.section._count.enrollments);
  }

  function seatChip(w: WatchedSection) {
    const left = seatsLeft(w);
    if (left === Infinity) return { label: "无限制", cls: "border-slate-200 bg-slate-50 text-slate-600" };
    if (left === 0) return { label: "已满", cls: "border-red-200 bg-red-50 text-red-700" };
    if (left <= 3) return { label: `仅剩 ${left} 席`, cls: "border-amber-200 bg-amber-50 text-amber-700" };
    return { label: `${left} 席空余`, cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }

  const withSeats = watches.filter((w) => seatsLeft(w) > 0).length;
  const full = watches.filter((w) => seatsLeft(w) === 0).length;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">空位追踪</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">已订阅课程</h1>
        <p className="mt-1 text-sm text-slate-600 md:text-base">
          一旦关注的课程有空位，系统将自动发邮件通知您。
        </p>
      </section>

      {!loading && watches.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="campus-kpi">
            <p className="campus-kpi-label">订阅总数</p>
            <p className="campus-kpi-value">{watches.length}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">有空位</p>
            <p className="campus-kpi-value text-emerald-600">{withSeats}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">已满员</p>
            <p className="campus-kpi-value text-red-600">{full}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-2xl">⏳</p>
          <p className="mt-2 text-sm font-medium text-slate-600">加载中…</p>
        </div>
      ) : watches.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-3xl">🔔</p>
          <p className="mt-2 text-sm font-medium text-slate-600">暂无订阅课程</p>
          <p className="mt-1 text-xs text-slate-400">在课程目录中点击「空位通知我」即可订阅。</p>
          <a
            href="/student/catalog"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            前往课程目录
          </a>
        </div>
      ) : (
        <section className="space-y-3">
          {watches.map((w) => {
            const chip = seatChip(w);
            const left = seatsLeft(w);
            const notified = !!w.notifiedAt;
            const pct = w.section.capacity > 0 ? Math.round((w.section._count.enrollments / w.section.capacity) * 100) : 0;

            return (
              <article
                key={w.id}
                className={`campus-card p-5 transition-colors ${left > 0 && left !== Infinity ? "border-l-4 border-l-emerald-400" : left === 0 ? "border-l-4 border-l-red-300" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        {w.section.course.code}
                      </span>
                      <span className="text-xs text-slate-500">{w.section.sectionCode}</span>
                      {w.section.term && (
                        <span className="campus-chip border-slate-200 bg-slate-50 text-slate-500 text-xs">
                          {w.section.term.name}
                        </span>
                      )}
                      {notified && (
                        <span className="campus-chip border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">
                          ✉ 已通知
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-semibold text-slate-900">{w.section.course.title}</p>
                    {w.section.instructorName && (
                      <p className="mt-0.5 text-xs text-slate-500">👨‍🏫 {w.section.instructorName}</p>
                    )}
                    <p className="mt-0.5 text-xs text-slate-400">
                      订阅于 {new Date(w.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${chip.cls}`}>
                      {chip.label}
                    </span>
                    <button
                      onClick={() => handleUnwatch(w.sectionId)}
                      disabled={removing.has(w.sectionId)}
                      className="text-xs text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      {removing.has(w.sectionId) ? "取消中…" : "🔕 取消订阅"}
                    </button>
                  </div>
                </div>

                {w.section.capacity > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>容量使用率</span>
                      <span>{w.section._count.enrollments} / {w.section.capacity}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
