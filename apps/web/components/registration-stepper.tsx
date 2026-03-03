"use client";

import Link from "next/link";

type StepKey = "catalog" | "cart" | "submit";

type Step = {
  key: StepKey;
  label: string;
  href?: string;
};

const STEPS: Step[] = [
  { key: "catalog", label: "Browse Catalog", href: "/student/catalog" },
  { key: "cart", label: "Review Cart", href: "/student/cart" },
  { key: "submit", label: "Submit & Results" }
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
      aria-label="Registration progress"
      className="campus-card p-3 md:p-4"
    >
      <ol className="grid gap-2 sm:grid-cols-3">
        {STEPS.map((step, index) => {
          const isCurrent = step.key === current;
          const isDone = index < currentIndex;
          const canNavigate = Boolean(step.href);
          const badge = isDone ? "✓" : `${index + 1}`;
          const content = (
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                isCurrent
                  ? "border-slate-800 bg-slate-900 text-white shadow-sm"
                  : isDone
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-50/90 text-slate-600"
              }`}
            >
              <span
                className={`inline-flex size-6 items-center justify-center rounded-full border text-xs font-semibold ${
                  isCurrent
                    ? "border-blue-200 bg-white/20 text-white"
                    : isDone
                      ? "border-emerald-300 bg-white text-emerald-700"
                      : "border-slate-300 bg-white text-slate-600"
                }`}
              >
                {badge}
              </span>
              <span className="font-medium">{step.label}</span>
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
