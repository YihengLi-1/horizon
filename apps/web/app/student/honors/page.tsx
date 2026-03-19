"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type HonorEntry = {
  type: string;
  termName: string;
  awardedAt: string;
};

type HonorsData = {
  honors: HonorEntry[];
  summary: string;
};

const HONOR_STYLE: Record<string, { icon: string; cls: string }> = {
  "荣誉院长名单": { icon: "🏆", cls: "border-amber-300 bg-amber-50 text-amber-800" },
  "院长名单":     { icon: "🥇", cls: "border-blue-200 bg-blue-50 text-blue-800" },
  "学业优秀":     { icon: "🎓", cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  "全勤学者":     { icon: "⭐", cls: "border-purple-200 bg-purple-50 text-purple-800" },
};

export default function StudentHonorsPage() {
  const [data, setData] = useState<HonorsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<HonorsData>("/students/honors")
      .then((d) => setData(d ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const byType = data?.honors.reduce<Record<string, number>>((acc, h) => {
    acc[h.type] = (acc[h.type] ?? 0) + 1;
    return acc;
  }, {}) ?? {};

  const latestHonor = data?.honors.length
    ? data.honors.reduce((a, b) =>
        new Date(a.awardedAt) > new Date(b.awardedAt) ? a : b
      )
    : null;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业荣誉</p>
        <h1 className="campus-title">荣誉与成就</h1>
        <p className="campus-subtitle">记录您在学习过程中获得的荣誉称号与学业成就</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">荣誉总数</p>
          <p className="campus-kpi-value text-amber-500">
            {loading ? "—" : data?.honors.length ?? 0}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">荣誉种类</p>
          <p className="campus-kpi-value">{loading ? "—" : Object.keys(byType).length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">最新荣誉</p>
          <p className="campus-kpi-value text-sm">{loading ? "—" : latestHonor?.type ?? "—"}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : !data || data.honors.length === 0 ? (
        <div className="campus-card p-10 text-center">
          <p className="text-4xl mb-3">🌱</p>
          <p className="text-sm font-semibold text-slate-600">尚未获得任何荣誉</p>
          <p className="mt-1 text-xs text-slate-400">{data?.summary ?? "继续努力，荣誉即将到来。"}</p>
        </div>
      ) : (
        <>
          {/* Summary banner */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-center gap-4">
            <span className="text-3xl">🏅</span>
            <p className="text-sm font-semibold text-amber-800">{data.summary}</p>
          </div>

          {/* Honor type summary */}
          {Object.keys(byType).length > 0 ? (
            <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              {Object.entries(byType).map(([type, count]) => {
                const style = HONOR_STYLE[type] ?? { icon: "🎖️", cls: "border-slate-200 bg-slate-50 text-slate-700" };
                return (
                  <div key={type} className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${style.cls}`}>
                    <span className="text-2xl">{style.icon}</span>
                    <div>
                      <p className="font-semibold text-sm">{type}</p>
                      <p className="text-xs opacity-75">共 {count} 次</p>
                    </div>
                  </div>
                );
              })}
            </section>
          ) : null}

          {/* Honor list */}
          <section className="campus-card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3">
              <p className="text-sm font-semibold text-slate-700">荣誉明细</p>
            </div>
            <div className="divide-y divide-slate-100">
              {data.honors.map((h, i) => {
                const style = HONOR_STYLE[h.type] ?? { icon: "🎖️", cls: "" };
                return (
                  <div key={i} className="flex items-center gap-4 px-5 py-3">
                    <span className="text-2xl shrink-0">{style.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-800">{h.type}</p>
                      <p className="text-xs text-slate-500">{h.termName}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-slate-400">
                        {h.awardedAt ? new Date(h.awardedAt).toLocaleDateString("zh-CN", { year: "numeric", month: "long" }) : "—"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
