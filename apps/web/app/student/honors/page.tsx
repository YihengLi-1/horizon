"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Honor = {
  type: string;
  termName: string;
  awardedAt: string;
};

type HonorsData = {
  honors: Honor[];
  summary: string;
};

const HONOR_CONFIG: Record<string, { emoji: string; color: string; border: string; bg: string }> = {
  "荣誉院长名单": {
    emoji: "🏆",
    color: "text-amber-700",
    border: "border-amber-300",
    bg: "bg-amber-50",
  },
  "院长名单": {
    emoji: "⭐",
    color: "text-blue-700",
    border: "border-blue-200",
    bg: "bg-blue-50",
  },
  "学业优秀": {
    emoji: "🎓",
    color: "text-emerald-700",
    border: "border-emerald-200",
    bg: "bg-emerald-50",
  },
  "全勤学者": {
    emoji: "✅",
    color: "text-violet-700",
    border: "border-violet-200",
    bg: "bg-violet-50",
  },
};

function defaultConfig() {
  return { emoji: "🏅", color: "text-slate-700", border: "border-slate-200", bg: "bg-slate-50" };
}

export default function HonorsPage() {
  const [data, setData] = useState<HonorsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<HonorsData>("/students/honors")
      .then((d) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const honors = data?.honors ?? [];
  const termHonors = honors.filter((h) => h.termName !== "累计荣誉");
  const cumulative = honors.filter((h) => h.termName === "累计荣誉");

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业荣誉</p>
        <h1 className="campus-hero-title">我的荣誉记录</h1>
        <p className="campus-hero-subtitle">
          {loading ? "加载中…" : data?.summary ?? ""}
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">荣誉总数</p>
          <p className="campus-kpi-value text-amber-600">{loading ? "—" : honors.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">学期荣誉</p>
          <p className="campus-kpi-value">{loading ? "—" : termHonors.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">累计荣誉</p>
          <p className="campus-kpi-value text-emerald-600">{loading ? "—" : cumulative.length}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : honors.length === 0 ? (
        <div className="campus-card p-12 text-center">
          <p className="text-4xl mb-3">📚</p>
          <p className="text-sm font-semibold text-slate-600">尚未获得任何荣誉</p>
          <p className="mt-1 text-xs text-slate-400">
            单学期 GPA ≥ 3.5 可获得院长名单；≥ 3.8 可获得荣誉院长名单。
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            累计修读 60+ 学分且无挂科/退课可获得全勤学者荣誉。
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          {honors.map((honor, i) => {
            const cfg = HONOR_CONFIG[honor.type] ?? defaultConfig();
            return (
              <div
                key={i}
                className={`campus-card flex items-center gap-5 border p-5 ${cfg.border} ${cfg.bg}`}
              >
                <span className="text-3xl shrink-0">{cfg.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-base font-bold ${cfg.color}`}>{honor.type}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{honor.termName}</p>
                </div>
                {honor.termName !== "累计荣誉" ? (
                  <p className="shrink-0 text-xs text-slate-400">
                    {new Date(honor.awardedAt).toLocaleDateString("zh-CN")}
                  </p>
                ) : null}
              </div>
            );
          })}
        </section>
      )}

      {!loading && honors.length === 0 ? null : (
        <div className="campus-card p-4 text-xs text-slate-500 space-y-1">
          <p className="font-semibold text-slate-700 text-sm">荣誉评定标准</p>
          <p>🏆 荣誉院长名单：单学期所有已评分课程 GPA ≥ 3.8</p>
          <p>⭐ 院长名单：单学期所有已评分课程 GPA ≥ 3.5（低于 3.8）</p>
          <p>🎓 学业优秀：累计完成学分 ≥ 60</p>
          <p>✅ 全勤学者：无任何退课或不及格记录</p>
        </div>
      )}
    </div>
  );
}
