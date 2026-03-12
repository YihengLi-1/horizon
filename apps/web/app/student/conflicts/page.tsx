"use client";

/**
 * Student Class Conflict Detector
 * Loads enrolled sections and detects time overlaps in meeting schedules.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type MeetingTime = {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
};

type Section = {
  id: string;
  sectionCode: string;
  instructorName: string;
  credits: number;
  course: { code: string; title: string };
  term: { id: string; name: string; endDate: string };
  meetingTimes: MeetingTime[];
};

type Enrollment = {
  id: string;
  status: string;
  section: Section;
};

type Conflict = {
  sectionA: { code: string; title: string; sectionCode: string };
  sectionB: { code: string; title: string; sectionCode: string };
  weekday: number;
  overlapStart: number;
  overlapEnd: number;
};

const DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const min = (m % 60).toString().padStart(2, "0");
  return `${h}:${min}`;
}

function detectConflicts(enrollments: Enrollment[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const enrolled = enrollments.filter((e) => e.status === "ENROLLED");

  for (let i = 0; i < enrolled.length; i++) {
    for (let j = i + 1; j < enrolled.length; j++) {
      const a = enrolled[i].section;
      const b = enrolled[j].section;

      // Only compare in same term
      if (a.term.id !== b.term.id) continue;

      for (const mtA of a.meetingTimes ?? []) {
        for (const mtB of b.meetingTimes ?? []) {
          if (mtA.weekday !== mtB.weekday) continue;
          // Overlap check
          const overlapStart = Math.max(mtA.startMinutes, mtB.startMinutes);
          const overlapEnd   = Math.min(mtA.endMinutes,   mtB.endMinutes);
          if (overlapStart < overlapEnd) {
            conflicts.push({
              sectionA: { code: a.course.code, title: a.course.title, sectionCode: a.sectionCode },
              sectionB: { code: b.course.code, title: b.course.title, sectionCode: b.sectionCode },
              weekday: mtA.weekday,
              overlapStart,
              overlapEnd
            });
          }
        }
      }
    }
  }

  return conflicts;
}

export default function ConflictsPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    void apiFetch<{ enrollments?: Enrollment[] }>("/students/me")
      .then((me) => setEnrollments(me?.enrollments ?? []))
      .catch(() => setEnrollments([]))
      .finally(() => setLoading(false));
  }, []);

  const enrolled = enrollments.filter((e) => e.status === "ENROLLED");
  const conflicts = detectConflicts(enrollments);

  // Group enrolled by term
  const byTerm = enrolled.reduce<Record<string, Enrollment[]>>((acc, e) => {
    const k = e.section.term.id;
    (acc[k] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Schedule Tools</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">时间冲突检测</h1>
        <p className="mt-1 text-sm text-slate-500">
          自动检测已选课程中存在的时间冲突
        </p>
      </section>

      {/* KPIs */}
      {!loading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="campus-kpi">
            <p className="campus-kpi-label">已选课程</p>
            <p className="campus-kpi-value text-indigo-600">{enrolled.length}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">冲突数量</p>
            <p className={`campus-kpi-value ${conflicts.length > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {conflicts.length}
            </p>
          </div>
          <div className="campus-kpi campus-kpi-sm hidden sm:block">
            <p className="campus-kpi-label">当前学期</p>
            <p className="campus-kpi-value text-slate-600">{Object.keys(byTerm).length}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-2xl">⏳</p>
          <p className="mt-2 text-sm text-slate-600">加载中…</p>
        </div>
      ) : conflicts.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-semibold text-red-800">
              ⚠️ 发现 {conflicts.length} 个时间冲突！请尽快联系教务处或调整选课。
            </p>
          </div>
          {conflicts.map((c, i) => (
            <div key={i} className="campus-card border border-red-200 bg-red-50/30 p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">🔴</span>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-bold text-slate-900">
                    {DAYS[c.weekday]} · {minutesToTime(c.overlapStart)} – {minutesToTime(c.overlapEnd)}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      (重叠 {c.overlapEnd - c.overlapStart} 分钟)
                    </span>
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="font-mono text-xs font-bold text-indigo-700">{c.sectionA.code}</p>
                      <p className="text-slate-700 truncate">{c.sectionA.title}</p>
                      <p className="text-xs text-slate-400">§{c.sectionA.sectionCode}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p className="font-mono text-xs font-bold text-indigo-700">{c.sectionB.code}</p>
                      <p className="text-slate-700 truncate">{c.sectionB.title}</p>
                      <p className="text-xs text-slate-400">§{c.sectionB.sectionCode}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div className="flex gap-3">
            <Link
              href="/student/schedule"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              查看课表 →
            </Link>
            <Link
              href="/student/contact"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              联系教务处
            </Link>
          </div>
        </div>
      ) : (
        <div className="campus-card px-6 py-16 text-center">
          <p className="text-4xl">{enrolled.length === 0 ? "📋" : "✅"}</p>
          <p className="mt-3 text-lg font-semibold text-slate-700">
            {enrolled.length === 0 ? "暂无已选课程" : "没有时间冲突！"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {enrolled.length === 0
              ? "请先在课程目录中选课"
              : "您所有已选课程的时间安排均无重叠"}
          </p>
          {enrolled.length === 0 && (
            <Link
              href="/student/catalog"
              className="inline-block mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              浏览课程目录 →
            </Link>
          )}
        </div>
      )}

      {/* Enrolled sections summary */}
      {enrolled.length > 0 && (
        <div className="campus-card p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase text-slate-500">已选课程摘要</h3>
          {Object.entries(byTerm).map(([, termEnrollments]) => (
            <div key={termEnrollments[0].section.term.id}>
              <p className="text-xs font-semibold text-slate-600 mb-2">
                {termEnrollments[0].section.term.name}
              </p>
              <div className="space-y-1.5">
                {termEnrollments.map((e) => {
                  const hasConflict = conflicts.some(
                    (c) =>
                      c.sectionA.sectionCode === e.section.sectionCode ||
                      c.sectionB.sectionCode === e.section.sectionCode
                  );
                  return (
                    <div
                      key={e.id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                        hasConflict ? "border-red-200 bg-red-50" : "border-slate-100 bg-slate-50"
                      }`}
                    >
                      {hasConflict && <span>⚠️</span>}
                      <span className="font-mono text-xs font-bold text-indigo-700">
                        {e.section.course.code}
                      </span>
                      <span className="text-slate-700 truncate flex-1">{e.section.course.title}</span>
                      <span className="text-xs text-slate-400">§{e.section.sectionCode}</span>
                      <span className="text-xs text-slate-400">{e.section.credits}cr</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
