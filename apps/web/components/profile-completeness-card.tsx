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

  return (
    <section className="campus-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="campus-eyebrow">Profile</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{title}</h3>
        </div>
        <span className={palette.chip}>{palette.label}</span>
      </div>

      <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-center">
        <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
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
          <div className="grid gap-2">
            {fields.map((field) => (
              <div
                key={field.name}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                  field.filled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                <span>{field.label}</span>
                <span className="font-medium">{field.filled ? "已填写" : "待补充"}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              {missing.length > 0 ? `仍缺少：${missing.join("、")}` : "档案信息已经完整，可直接用于演示与管理。"}
            </p>
            {missing.length > 0 ? (
              <Link href={href} className="text-sm font-semibold text-primary no-underline hover:text-primary/80">
                去填写
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
