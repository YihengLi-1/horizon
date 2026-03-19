"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type CoursePairing = {
  pairKey: string;
  courseAId: string;
  courseACode: string;
  courseATitle: string;
  courseBId: string;
  courseBCode: string;
  courseBTitle: string;
  coCount: number;
  termCount: number;
  terms: { termId: string; termName: string; coCount: number }[];
};

export default function CoursePairingsPage() {
  const [data, setData] = useState<CoursePairing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void apiFetch<CoursePairing[]>("/admin/course-pairings")
      .then((d) => setData(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "SELECT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return data;
    return data.filter(
      (p) =>
        p.courseACode.toLowerCase().includes(q) ||
        p.courseATitle.toLowerCase().includes(q) ||
        p.courseBCode.toLowerCase().includes(q) ||
        p.courseBTitle.toLowerCase().includes(q)
    );
  }, [data, search]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const maxCount = data[0]?.coCount ?? 1;
  const topPairs = data.length;
  const avgTerms =
    data.length > 0
      ? (data.reduce((s, p) => s + p.termCount, 0) / data.length).toFixed(1)
      : "—";

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">选课洞察</p>
        <h1 className="campus-title">课程同选分析</h1>
        <p className="campus-subtitle">统计学生同学期同时选修两门课程的频率，发现课程搭配规律</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">高频组合数</p>
          <p className="campus-kpi-value">{topPairs}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">最高同选人次</p>
          <p className="campus-kpi-value">{loading ? "—" : maxCount}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">平均跨学期数</p>
          <p className="campus-kpi-value">{loading ? "—" : avgTerms}</p>
        </div>
      </section>

      <div className="campus-toolbar">
        <input
          ref={searchRef}
          className="campus-input max-w-sm"
          placeholder="按课程代码或名称搜索… (/)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="campus-card p-10 text-center text-slate-400">暂无数据</div>
      ) : (
        <section className="space-y-2">
          {filtered.map((pair, rank) => {
            const open = expanded.has(pair.pairKey);
            const barPct = Math.round((pair.coCount / maxCount) * 100);
            return (
              <div key={pair.pairKey} className="campus-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(pair.pairKey)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <span className="shrink-0 inline-flex size-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                      #{rank + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                          {pair.courseACode}
                        </span>
                        <span className="text-slate-400 text-sm">+</span>
                        <span className="font-mono text-xs font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded">
                          {pair.courseBCode}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 truncate max-w-sm">
                        {pair.courseATitle} · {pair.courseBTitle}
                      </p>
                      {/* bar */}
                      <div className="mt-2 h-1 w-full max-w-[200px] rounded-full bg-slate-100">
                        <div
                          className="h-1 rounded-full bg-indigo-400"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-slate-400">同选人次</p>
                      <p className="text-base font-bold text-slate-900">{pair.coCount}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">学期数</p>
                      <p className="text-sm font-semibold text-slate-700">{pair.termCount}</p>
                    </div>
                    <span className="text-slate-400">{open ? "▲" : "▼"}</span>
                  </div>
                </button>

                {open ? (
                  <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                    <p className="text-xs font-semibold text-slate-500 mb-2">各学期同选人次</p>
                    <div className="space-y-1.5">
                      {pair.terms.map((t) => (
                        <div key={t.termId} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">{t.termName}</span>
                          <span className="font-mono font-semibold text-slate-900">{t.coCount} 人</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      )}

      <p className="text-xs text-slate-400 text-right">最多展示 150 对最高频率的课程组合。</p>
    </div>
  );
}
