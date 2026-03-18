"use client";

import Link from "next/link";

type StepKey = "catalog" | "cart" | "submit";

type Step = {
  key: StepKey;
  label: string;
  href?: string;
};

const STEPS: Step[] = [
  { key: "catalog", label: "浏览课程", href: "/student/catalog" },
  { key: "cart", label: "检查确认", href: "/student/cart" },
  { key: "submit", label: "完成" }
];

export function RegistrationStepper({
  current,
  termId
}: {
  current: StepKey;
  termId?: string;
}) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);

  return (
    <nav
      aria-label="注册流程进度"
      className="campus-card p-4 md:p-5"
    >
      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((step, index) => {
          const isCurrent = step.key === current;
          const isDone = index < currentIndex;
          const canNavigate = Boolean(step.href) && !isCurrent;
          const badge = isDone ? "✓" : `${index + 1}`;
          const content = (
            <div
              aria-current={isCurrent ? "step" : undefined}
              className={`relative flex items-center gap-3 rounded-xl border px-3 py-3 text-sm transition ${
                isCurrent
                  ? "border-[hsl(221_83%_43%)] bg-[hsl(221_83%_43%)] text-white shadow-sm"
                : isDone
                  ? "border-slate-300 bg-slate-100 text-slate-800"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {index < STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`absolute left-[calc(100%-12px)] top-1/2 hidden h-[2px] w-[calc(100%-24px)] -translate-y-1/2 sm:block ${
                    isDone ? "bg-[hsl(221_83%_43%)]" : "bg-slate-200"
                  }`}
                />
              ) : null}
              <span
                className={`relative z-10 inline-flex size-7 items-center justify-center rounded-full border text-xs font-semibold ${
                  isCurrent
                    ? "border-white/40 bg-white/15 text-white"
                    : isDone
                    ? "border-slate-300 bg-white text-slate-700"
                    : "border-slate-300 bg-white text-slate-600"
                }`}
              >
                {badge}
              </span>
              <span className="relative z-10 font-medium">{step.label}</span>
            </div>
          );

          if (canNavigate && step.href) {
            const href = termId ? `${step.href}?termId=${termId}` : step.href;
            return (
              <li key={step.key}>
                <Link href={href}>{content}</Link>
              </li>
            );
          }

          return <li key={step.key}>{content}</li>;
        })}
      </ol>
    </nav>
  );
}
