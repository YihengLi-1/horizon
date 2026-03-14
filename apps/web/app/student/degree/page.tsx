"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  DEGREE_MIN_GPA,
  DEGREE_TOTAL_CREDITS,
  computeProgress,
  type CompletedCourse,
  type BucketProgress,
  type GroupProgress
} from "@/lib/degreeRequirements";

type StudentEnrollment = {
  id: string;
  finalGrade: string | null;
  status: string;
  section: {
    credits: number;
    course: { code: string; title: string };
    term?: { name: string };
  };
};

type StudentProfileResponse = {
  enrollments?: StudentEnrollment[];
};

function ProgressBar({ pct, color = "indigo" }: { pct: number; color?: string }) {
  const colorMap: Record<string, string> = {
    indigo: "bg-indigo-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500"
  };
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${colorMap[color] ?? "bg-indigo-500"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function BucketCard({ bp }: { bp: BucketProgress }) {
  const [expanded, setExpanded] = useState(false);
  const color = bp.satisfied ? "emerald" : bp.pct >= 50 ? "amber" : "indigo";
  return (
    <div className={`rounded-lg border p-3 space-y-1.5 ${bp.satisfied ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-sm font-semibold text-slate-800">{bp.bucket.label}</span>
          <p className="text-xs text-slate-500 mt-0.5">{bp.bucket.description}</p>
        </div>
        <div className="text-right shrink-0">
          {bp.satisfied ? (
            <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">✓ 完成</span>
          ) : (
            <span className="text-xs font-mono text-slate-500">{bp.earnedCredits}/{bp.requiredCredits} cr</span>
          )}
        </div>
      </div>
      <ProgressBar pct={bp.pct} color={color} />
      {bp.courses.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-indigo-600 hover:underline mt-1"
        >
          {expanded ? "▲ 收起" : `▼ 查看 ${bp.courses.length} 门课程`}
        </button>
      )}
      {expanded && (
        <ul className="mt-1 space-y-1">
          {bp.courses.map((c) => (
            <li key={c.code} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-xs">
              <span className="font-mono font-semibold text-slate-700">{c.code}</span>
              <span className="text-slate-500">{c.termName}</span>
              <span className="font-bold text-slate-700">{c.grade ?? "IP"}</span>
              <span className="text-slate-400">{c.credits}cr</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GroupSection({ gp }: { gp: GroupProgress }) {
  return (
    <section className="campus-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">{gp.group.label}</h2>
        <span className={`text-xs font-semibold rounded-full border px-2 py-0.5 ${gp.satisfied ? "border-emerald-300 bg-emerald-100 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>
          {gp.earnedCredits}/{gp.requiredCredits} 学分
        </span>
      </div>
      <div className="space-y-2">
        {gp.buckets.map((bp) => (
          <BucketCard key={bp.bucket.id} bp={bp} />
        ))}
      </div>
    </section>
  );
}

export default function DegreePage() {
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiFetch<StudentProfileResponse>("/students/me")
      .then((data) => setEnrollments(data.enrollments ?? []))
      .catch(() => setEnrollments([]))
      .finally(() => setLoading(false));
  }, []);

  const completed: CompletedCourse[] = enrollments
    .filter((g) => g.status === "COMPLETED" && g.finalGrade && g.finalGrade !== "W")
    .map((g) => ({
      code: g.section.course.code,
      credits: g.section.credits,
      grade: g.finalGrade,
      termName: g.section.term?.name ?? "Unknown term"
    }));

  const inProgress: StudentEnrollment[] = enrollments.filter((g) => g.status === "ENROLLED");

  const progress = computeProgress(completed);

  const gpaColor = progress.gpa >= 3.7 ? "text-emerald-600" : progress.gpa >= 3.0 ? "text-indigo-600" : progress.gpa >= 2.0 ? "text-amber-600" : "text-red-600";

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Progress</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">毕业进度</h1>
        <p className="mt-1 text-sm text-slate-500">追踪您的学位要求完成情况（计算机科学 B.Sc.，共 {DEGREE_TOTAL_CREDITS} 学分）</p>
      </section>

      {loading ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-2xl">⏳</p>
          <p className="mt-2 text-sm text-slate-600">加载中…</p>
        </div>
      ) : (
        <>
          {/* KPI bar */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">已修学分</p>
              <p className="campus-kpi-value">{progress.totalEarned}</p>
              <p className="text-xs text-slate-400">共需 {DEGREE_TOTAL_CREDITS}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">当前 GPA</p>
              <p className={`campus-kpi-value ${gpaColor}`}>{progress.gpa.toFixed(2)}</p>
              <p className="text-xs text-slate-400">最低要求 {DEGREE_MIN_GPA.toFixed(1)}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">已完成课程</p>
              <p className="campus-kpi-value">{completed.length}</p>
              <p className="text-xs text-slate-400">门课程</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">在读课程</p>
              <p className="campus-kpi-value text-indigo-600">{inProgress.length}</p>
              <p className="text-xs text-slate-400">本学期</p>
            </div>
          </div>

          {/* Overall progress */}
          <div className="campus-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">总体进度</span>
              <span className="text-sm font-bold text-slate-900">{progress.overallPct}%</span>
            </div>
            <ProgressBar pct={progress.overallPct} color={progress.overallPct === 100 ? "emerald" : "indigo"} />
            <div className="flex items-center gap-2 pt-1">
              {progress.allSatisfied ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                  🎓 所有毕业要求已满足！
                </span>
              ) : (
                <span className="text-xs text-slate-500">还需修满 {Math.max(0, DEGREE_TOTAL_CREDITS - progress.totalEarned)} 学分方可毕业</span>
              )}
              {progress.gpa < DEGREE_MIN_GPA && (
                <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                  ⚠️ GPA 低于最低要求
                </span>
              )}
            </div>
          </div>

          {/* In-progress courses */}
          {inProgress.length > 0 && (
            <section className="campus-card p-4 space-y-2">
              <h2 className="text-sm font-bold text-slate-900">本学期在读课程</h2>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {inProgress.map((g) => (
                  <div key={g.id} className="flex items-center justify-between rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs">
                    <span className="font-mono font-semibold text-indigo-800">{g.section.course.code}</span>
                    <span className="text-slate-500 truncate max-w-[120px]">{g.section.course.title}</span>
                    <span className="text-indigo-600 font-semibold">{g.section.credits}cr</span>
                    <span className="text-slate-400">{g.section.term?.name ?? "Unknown term"}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Requirement groups */}
          <div className="space-y-4">
            {progress.groups.map((gp) => (
              <GroupSection key={gp.group.id} gp={gp} />
            ))}
          </div>

          <p className="text-center text-xs text-slate-400">
            * 学分计算基于已完成（COMPLETED）且成绩非 W 的课程。在读课程不计入毕业学分。
          </p>
        </>
      )}
    </div>
  );
}
