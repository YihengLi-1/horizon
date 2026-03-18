"use client";

import Link from "next/link";

interface Enroll {
  id: string;
  status: string;
  section: {
    course?: {
      code?: string;
      title?: string;
    };
    location?: string | null;
  };
  waitlistPosition?: number | null;
}

const STATUS_BORDER: Record<string, string> = {
  ENROLLED: "border-l-emerald-400",
  WAITLISTED: "border-l-amber-400",
  PENDING_APPROVAL: "border-l-blue-400"
};

const STATUS_CHIP: Record<string, string> = {
  ENROLLED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  WAITLISTED: "border-amber-200 bg-amber-50 text-amber-700",
  PENDING_APPROVAL: "border-blue-200 bg-blue-50 text-blue-700"
};

export default function QuickCoursesPanel({ enrollments }: { enrollments: Enroll[] }) {
  const active = enrollments.filter((enrollment) => ["ENROLLED", "WAITLISTED", "PENDING_APPROVAL"].includes(enrollment.status));
  if (!active.length) return null;

  return (
    <div className="campus-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">我的当前课程</p>
        <Link href="/student/schedule" className="text-xs font-medium text-blue-600 hover:underline">
          查看课表 →
        </Link>
      </div>
      <div className="divide-y divide-slate-50 dark:divide-slate-700">
        {active.map((enrollment) => (
          <div
            key={enrollment.id}
            className={`border-l-4 px-4 py-3 dark:bg-slate-800/50 ${STATUS_BORDER[enrollment.status] ?? "border-l-slate-200"}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-400">{enrollment.section.course?.code ?? "—"}</p>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{enrollment.section.course?.title ?? "课程"}</p>
                {enrollment.section.location ? <p className="text-xs text-slate-400">{enrollment.section.location}</p> : null}
                {enrollment.status === "WAITLISTED" && enrollment.waitlistPosition ? (
                  <p className="text-xs text-amber-600">候补第 {enrollment.waitlistPosition} 位</p>
                ) : null}
              </div>
              <span className={`campus-chip text-xs ${STATUS_CHIP[enrollment.status] ?? ""}`}>
                {enrollment.status === "ENROLLED" ? "在读" : enrollment.status === "WAITLISTED" ? "候补中" : "待处理"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
