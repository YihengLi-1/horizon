"use client";

import Link from "next/link";

type CompletenessField = {
  name: string;
  label: string;
  filled: boolean;
};

type ProfileCompletenessCardProps = {
  score: number;
  missing: string[];
  fields: CompletenessField[];
  href?: string;
  title?: string;
};

function tone(score: number) {
  if (score < 60) {
    return {
      stroke: "hsl(0 70% 52%)",
      chip: "campus-chip chip-red",
      label: "待完善"
    };
  }
  if (score <= 80) {
    return {
      stroke: "hsl(38 90% 48%)",
      chip: "campus-chip chip-amber",
      label: "基本完整"
    };
  }
  return {
    stroke: "hsl(160 65% 40%)",
    chip: "campus-chip chip-emerald",
    label: "资料完整"
  };
}

export default function ProfileCompletenessCard({
  score,
  missing,
  fields,
  href = "/student/profile",
  title = "档案完整度"
}: ProfileCompletenessCardProps) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  const palette = tone(score);
  const isComplete = missing.length === 0;
  const filledCount = fields.filter((field) => field.filled).length;

  return (
    <section className="campus-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="campus-eyebrow">档案管理</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{title}</h3>
        </div>
        <span className={palette.chip}>{palette.label}</span>
      </div>

      <div className={`mt-5 flex gap-5 ${isComplete ? "items-center" : "flex-col md:flex-row md:items-start"}`}>
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
          <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
            <circle cx="60" cy="60" r={radius} stroke="hsl(221 20% 92%)" strokeWidth="10" fill="none" />
            <circle
              cx="60"
              cy="60"
              r={radius}
              stroke={palette.stroke}
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-slate-900">{score}</span>
            <span className="text-xs font-medium text-slate-500">/ 100</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {isComplete ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">5 项关键信息均已完善，后续注册、通知与学籍流程将直接使用当前资料。</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="campus-chip chip-emerald">资料已可直接使用</span>
                <span>如需变更联系方式或紧急联系人，可随时回到档案页更新。</span>
              </div>
              <Link href={href} className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-50">
                查看档案
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                已完成 {filledCount}/{fields.length} 项，仍缺少：{missing.join("、")}
              </p>
              <div className="mt-3 grid gap-2">
                {fields
                  .filter((field) => !field.filled)
                  .map((field) => (
                    <div
                      key={field.name}
                      className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
                    >
                      <span>{field.label}</span>
                      <span className="font-medium">待补充</span>
                    </div>
                  ))}
              </div>
              <div className="mt-4">
                <Link href={href} className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-white no-underline transition hover:bg-primary/90">
                  去填写
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
