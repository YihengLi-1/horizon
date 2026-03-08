"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { enrollmentStatusLabel } from "@/lib/labels";
import PrintButton from "./PrintButton";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GRID_DAY_INDEXES = [1, 2, 3, 4, 5, 6, 0];
const GRID_START = 8 * 60;
const GRID_END = 21 * 60;
const GRID_SLOT = 30;
const GRID_ROW_COUNT = (GRID_END - GRID_START) / GRID_SLOT;

type Term = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  dropDeadline: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
};

type MeetingTime = {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
};

type Enrollment = {
  id: string;
  status: string;
  waitlistPosition: number | null;
  section: {
    id: string;
    sectionCode: string;
    instructorName: string;
    location: string | null;
    credits: number;
    course: { code: string; title: string };
    meetingTimes: MeetingTime[];
  };
};

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function meetingSummary(mts: MeetingTime[]): string {
  if (!mts.length) return "No meeting time (async)";
  return mts.map((mt) => `${WEEKDAY[mt.weekday] ?? mt.weekday} ${fmt(mt.startMinutes)}–${fmt(mt.endMinutes)}`).join(", ");
}

function statusBadge(status: string) {
  if (status === "ENROLLED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "WAITLISTED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "PENDING_APPROVAL") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function toIcsDate(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function firstOccurrence(termStart: string, weekday: number, minutes: number): Date {
  const start = new Date(termStart);
  const result = new Date(start);
  const delta = (weekday - result.getDay() + 7) % 7;
  result.setDate(result.getDate() + delta);
  result.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return result;
}

function buildIcs(term: Term | null, enrollments: Enrollment[]): string {
  if (!term) return "";
  const byDay = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SIS//Schedule//EN"];

  for (const enrollment of enrollments) {
    if (enrollment.status !== "ENROLLED" && enrollment.status !== "PENDING_APPROVAL") continue;
    for (const meetingTime of enrollment.section.meetingTimes ?? []) {
      const start = firstOccurrence(term.startDate, meetingTime.weekday, meetingTime.startMinutes);
      const end = firstOccurrence(term.startDate, meetingTime.weekday, meetingTime.endMinutes);
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${enrollment.id}-${meetingTime.weekday}-${meetingTime.startMinutes}@sis`);
      lines.push(`DTSTAMP:${toIcsDate(new Date())}`);
      lines.push(`DTSTART:${toIcsDate(start)}`);
      lines.push(`DTEND:${toIcsDate(end)}`);
      lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${byDay[meetingTime.weekday]};UNTIL=${toIcsDate(new Date(term.endDate))}`);
      lines.push(`SUMMARY:${enrollment.section.course.code} ${enrollment.section.course.title}`);
      if (enrollment.section.location) {
        lines.push(`LOCATION:${enrollment.section.location}`);
      }
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function useLocalStorage<T>(key: string, initialValue: T): [T, (next: T | ((value: T) => T)) => void] {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        setValue(JSON.parse(stored) as T);
      }
    } catch {
      setValue(initialValue);
    }
  }, [initialValue, key]);

  const updateValue = (next: T | ((value: T) => T)) => {
    setValue((current) => {
      const resolved = typeof next === "function" ? (next as (value: T) => T)(current) : next;
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {}
      }
      return resolved;
    });
  };

  return [value, updateValue];
}

export default function SchedulePage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dropError, setDropError] = useState<Record<string, string>>({});
  const [dropping, setDropping] = useState<Record<string, boolean>>({});
  const [loadingTerms, setLoadingTerms] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [showEnrolled, setShowEnrolled] = useState(true);
  const [showPending, setShowPending] = useState(true);
  const [showWaitlisted, setShowWaitlisted] = useState(true);
  const [viewMode, setViewMode] = useLocalStorage<"list" | "grid">("schedule_view_mode", "list");

  const activeTerm = useMemo(() => terms.find((t) => t.id === termId) ?? null, [terms, termId]);
  const dropDeadlinePassed = useMemo(() => {
    if (!activeTerm) return false;
    return Date.now() > new Date(activeTerm.dropDeadline).getTime();
  }, [activeTerm]);

  const statusCounts = useMemo(() => {
    const counts = { ENROLLED: 0, PENDING_APPROVAL: 0, WAITLISTED: 0 };
    for (const enrollment of enrollments) {
      if (enrollment.status === "ENROLLED") counts.ENROLLED += 1;
      if (enrollment.status === "PENDING_APPROVAL") counts.PENDING_APPROVAL += 1;
      if (enrollment.status === "WAITLISTED") counts.WAITLISTED += 1;
    }
    return counts;
  }, [enrollments]);

  const visibleEnrollments = useMemo(
    () =>
      enrollments.filter((enrollment) => {
        if (enrollment.status === "ENROLLED") return showEnrolled;
        if (enrollment.status === "PENDING_APPROVAL") return showPending;
        if (enrollment.status === "WAITLISTED") return showWaitlisted;
        return true;
      }),
    [enrollments, showEnrolled, showPending, showWaitlisted]
  );
  const visibleCredits = useMemo(
    () =>
      visibleEnrollments
        .filter((enrollment) => enrollment.status === "ENROLLED" || enrollment.status === "PENDING_APPROVAL")
        .reduce((sum, enrollment) => sum + enrollment.section.credits, 0),
    [visibleEnrollments]
  );
  const hasStatusFiltersApplied = useMemo(
    () => !showEnrolled || !showPending || !showWaitlisted,
    [showEnrolled, showPending, showWaitlisted]
  );
  const todayWeekday = new Date().getDay();
  const todayClasses = useMemo(
    () =>
      visibleEnrollments
        .flatMap((enrollment) =>
          (enrollment.section.meetingTimes ?? [])
            .filter((meetingTime) => meetingTime.weekday === todayWeekday)
            .map((meetingTime) => ({
              enrollment,
              meetingTime
            }))
        )
        .sort((a, b) => a.meetingTime.startMinutes - b.meetingTime.startMinutes),
    [todayWeekday, visibleEnrollments]
  );
  const timeSlots = useMemo(() => {
    const slots: number[] = [];
    for (let minutes = GRID_START; minutes < GRID_END; minutes += GRID_SLOT) {
      slots.push(minutes);
    }
    return slots;
  }, []);
  const gridBlocks = useMemo(
    () =>
      visibleEnrollments.flatMap((enrollment, enrollmentIndex) =>
        (enrollment.section.meetingTimes ?? [])
          .filter((meetingTime) => meetingTime.endMinutes > GRID_START && meetingTime.startMinutes < GRID_END)
          .map((meetingTime, meetingIndex) => {
            const startMinutes = Math.max(meetingTime.startMinutes, GRID_START);
            const endMinutes = Math.min(meetingTime.endMinutes, GRID_END);
            const rowStart = Math.floor((startMinutes - GRID_START) / GRID_SLOT) + 2;
            const rowSpan = Math.max(1, Math.ceil((endMinutes - startMinutes) / GRID_SLOT));
            const colStart = meetingTime.weekday === 0 ? 8 : meetingTime.weekday + 1;
            return {
              key: `${enrollment.id}-${enrollmentIndex}-${meetingIndex}`,
              enrollment,
              meetingTime,
              rowStart,
              rowSpan,
              colStart,
              tone:
                enrollment.status === "WAITLISTED"
                  ? "border-amber-500 bg-amber-100 text-amber-900"
                  : "border-emerald-500 bg-emerald-100 text-emerald-900"
            };
          })
      ),
    [visibleEnrollments]
  );

  const updateUrlTerm = (tid: string) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (tid) url.searchParams.set("termId", tid);
    else url.searchParams.delete("termId");
    window.history.replaceState({}, "", url.toString());
  };

  const loadSchedule = async (tid: string) => {
    if (!tid) { setEnrollments([]); return; }
    try {
      setLoadingSchedule(true);
      setError("");
      setNotice("");
      const data = await apiFetch<Enrollment[]>(`/registration/schedule?termId=${tid}`);
      setEnrollments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule");
    } finally {
      setLoadingSchedule(false);
    }
  };

  useEffect(() => {
    async function init() {
      try {
        setLoadingTerms(true);
        const termData = await apiFetch<Term[]>("/academics/terms");
        setTerms(termData);
        const queryId =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("termId") ?? "" : "";
        const validId = queryId && termData.some((t) => t.id === queryId) ? queryId : termData[0]?.id ?? "";
        setTermId(validId);
        if (validId) { updateUrlTerm(validId); await loadSchedule(validId); }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoadingTerms(false);
      }
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTermChange = async (tid: string) => {
    setTermId(tid);
    updateUrlTerm(tid);
    setDropError({});
    await loadSchedule(tid);
  };
  const resetStatusFilters = () => {
    setShowEnrolled(true);
    setShowPending(true);
    setShowWaitlisted(true);
  };

  const confirmDrop = (enrollment: Enrollment) => {
    const label = `${enrollment.section.course.code} §${enrollment.section.sectionCode}`;
    if (!window.confirm(`Drop ${label}? This cannot be undone.`)) return;
    void dropEnrollment(enrollment.id);
  };

  const dropEnrollment = async (enrollmentId: string) => {
    try {
      setDropping((p) => ({ ...p, [enrollmentId]: true }));
      setDropError((p) => { const n = { ...p }; delete n[enrollmentId]; return n; });
      await apiFetch("/registration/drop", {
        method: "POST",
        body: JSON.stringify({ enrollmentId })
      });
      await loadSchedule(termId);
    } catch (err) {
      setDropError((p) => ({ ...p, [enrollmentId]: err instanceof Error ? err.message : "Drop failed" }));
    } finally {
      setDropping((p) => ({ ...p, [enrollmentId]: false }));
    }
  };

  const dropDaysLeft = activeTerm && !dropDeadlinePassed ? daysUntil(activeTerm.dropDeadline) : 0;
  const downloadIcs = async () => {
    if (!activeTerm) return;
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/students/schedule/ical?termId=${termId}`,
        {
          credentials: "include",
          headers: {
            [process.env.NEXT_PUBLIC_CSRF_HEADER_NAME ?? "x-csrf-token"]:
              document.cookie.match(/sis-csrf=([^;]+)/)?.[1] ?? ""
          }
        }
      );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `schedule-${activeTerm.name.replace(/\s+/g, "-")}.ics`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("导出失败");
    }
  };
  const shareSchedule = async () => {
    if (!activeTerm || visibleEnrollments.length === 0 || typeof window === "undefined") return;
    try {
      const { token } = await apiFetch<{ token: string }>("/students/schedule/share", {
        method: "POST",
        body: JSON.stringify({ termId })
      });
      const url = `${window.location.origin}/schedule/share/${token}`;
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: `${activeTerm.name} schedule`,
            text: "查看我的课表快照",
            url
          });
        } catch {
          await navigator.clipboard.writeText(url);
        }
      } else {
        await navigator.clipboard.writeText(url);
      }
      setNotice("链接已复制到剪贴板");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share schedule");
    }
  };

  return (
    <div className="campus-page">
      <section className="campus-hero no-print">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Weekly Planning</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">Class Schedule</h1>
            <p className="text-sm text-slate-600 md:text-base">
              Review enrollment statuses and manage drops with a timetable view.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-emerald-300 bg-emerald-50 text-emerald-800">Enrolled {statusCounts.ENROLLED}</span>
              {statusCounts.PENDING_APPROVAL > 0 ? (
                <span className="campus-chip border-blue-300 bg-blue-50 text-blue-800">Pending {statusCounts.PENDING_APPROVAL}</span>
              ) : null}
              {statusCounts.WAITLISTED > 0 ? (
                <span className="campus-chip border-amber-300 bg-amber-50 text-amber-800">Waitlisted {statusCounts.WAITLISTED}</span>
              ) : null}
              {visibleCredits > 0 ? (
                <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{visibleCredits} enrolled credits</span>
              ) : null}
            </div>
          </div>
          <div className="w-full max-w-sm space-y-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Term</label>
              <select
                className="campus-select bg-white/95"
                value={termId}
                onChange={(e) => void onTermChange(e.target.value)}
                disabled={loadingTerms || terms.length === 0}
              >
                {terms.length === 0 ? <option value="">No active terms</option> : null}
                {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <PrintButton />
              <button
                type="button"
                onClick={downloadIcs}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:bg-white"
              >
                iCal 导出
              </button>
              <button
                type="button"
                onClick={shareSchedule}
                disabled={!activeTerm || visibleEnrollments.length === 0}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:bg-white disabled:opacity-50"
              >
                🔗 分享课表
              </button>
              <Link
                href={termId ? `/student/catalog?termId=${termId}` : "/student/catalog"}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 no-underline transition hover:bg-white"
              >
                Browse catalog
              </Link>
              <Link
                href={termId ? `/student/cart?termId=${termId}` : "/student/cart"}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 no-underline transition hover:bg-white"
              >
                Open cart
              </Link>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold transition ${
                  viewMode === "list"
                    ? "bg-blue-600 text-white"
                    : "campus-chip border-slate-300 bg-white text-slate-700"
                }`}
              >
                列表 📋
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold transition ${
                  viewMode === "grid"
                    ? "bg-blue-600 text-white"
                    : "campus-chip border-slate-300 bg-white text-slate-700"
                }`}
              >
                网格 🗓
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="campus-kpi border-emerald-200 bg-emerald-50/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Enrolled</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-900">{statusCounts.ENROLLED}</p>
        </div>
        <div className="campus-kpi border-blue-200 bg-blue-50/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Pending Approval</p>
          <p className="mt-1 text-2xl font-semibold text-blue-900">{statusCounts.PENDING_APPROVAL}</p>
        </div>
        <div className="campus-kpi border-amber-200 bg-amber-50/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Waitlisted</p>
          <p className="mt-1 text-2xl font-semibold text-amber-900">{statusCounts.WAITLISTED}</p>
        </div>
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Enrolled Credits</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{visibleCredits}</p>
        </div>
      </section>

      {/* Drop deadline banner */}
      {terms.length === 0 ? (
        <div className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          No active term is available yet. Schedule will appear after a term is published.
        </div>
      ) : null}
      {activeTerm ? (
        dropDeadlinePassed ? (
          <div className="no-print rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="flex items-start gap-2">
              <span className="text-base">⚠️</span>
              <div>
                <span className="font-semibold">Drop deadline has passed</span>{" "}
                (was {new Date(activeTerm.dropDeadline).toLocaleDateString()}).
                Enrolled and pending-approval drops now require advisor/registrar support.
              </div>
            </div>
          </div>
        ) : (
          <div className={`no-print rounded-xl border px-4 py-3 text-sm ${dropDaysLeft <= 3 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                Drop deadline:{" "}
                <span className="font-semibold">{new Date(activeTerm.dropDeadline).toLocaleDateString()}</span>
                {" "}at{" "}
                <span className="font-semibold">{new Date(activeTerm.dropDeadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>.
                {" "}You can drop courses until then.
              </div>
              <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${dropDaysLeft <= 3 ? "border-amber-300 bg-amber-100 text-amber-800" : "border-emerald-300 bg-emerald-100 text-emerald-800"}`}>
                {dropDaysLeft <= 0 ? "Today!" : dropDaysLeft === 1 ? "1 day left" : `${dropDaysLeft} days left`}
              </span>
            </div>
          </div>
        )
      ) : null}

      {error ? <div className="no-print rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="no-print rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
      <section className="campus-card no-print p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Status Filters</h2>
          <p className="text-xs text-slate-500 sm:hidden">{visibleEnrollments.length} visible</p>
          <p className="hidden text-xs text-slate-500 sm:block">{visibleEnrollments.length} row(s) visible in list and grid</p>
        </div>
        <p className="mt-1 text-[11px] text-slate-500 sm:hidden">
          Tip: tap a status chip to focus your schedule list.
        </p>
        <p aria-live="polite" className="sr-only">
          {visibleEnrollments.length} sections currently visible with the selected status filters.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowEnrolled((prev) => !prev)}
            aria-pressed={showEnrolled}
            className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition ${
              showEnrolled
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-slate-300 bg-white text-slate-600"
            }`}
          >
            {enrollmentStatusLabel("ENROLLED")} ({statusCounts.ENROLLED})
          </button>
          <button
            type="button"
            onClick={() => setShowPending((prev) => !prev)}
            aria-pressed={showPending}
            className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition ${
              showPending
                ? "border-blue-300 bg-blue-50 text-blue-800"
                : "border-slate-300 bg-white text-slate-600"
            }`}
          >
            {enrollmentStatusLabel("PENDING_APPROVAL")} ({statusCounts.PENDING_APPROVAL})
          </button>
          <button
            type="button"
            onClick={() => setShowWaitlisted((prev) => !prev)}
            aria-pressed={showWaitlisted}
            className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition ${
              showWaitlisted
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-slate-300 bg-white text-slate-600"
            }`}
          >
            {enrollmentStatusLabel("WAITLISTED")} ({statusCounts.WAITLISTED})
          </button>
          {hasStatusFiltersApplied ? (
            <button
              type="button"
              onClick={resetStatusFilters}
              className="inline-flex h-8 items-center rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Reset filters
            </button>
          ) : null}
        </div>
      </section>

      {viewMode === "list" ? (
        <section className="campus-card no-print border-blue-200 bg-blue-50/70 p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📘</span>
            <div className="w-full">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-blue-900">今日课程</p>
                <span className="rounded-full border border-blue-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                  {WEEKDAY[todayWeekday]} today
                </span>
              </div>
              {todayClasses.length === 0 ? (
                <p className="mt-1 text-sm text-blue-800">今天没有课程 🎉</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {todayClasses.map(({ enrollment, meetingTime }) => (
                    <div
                      key={`today-${enrollment.id}-${meetingTime.weekday}-${meetingTime.startMinutes}`}
                      className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900">
                          {enrollment.section.course.code} · {enrollment.section.course.title}
                        </p>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadge(enrollment.status)}`}>
                          {enrollmentStatusLabel(enrollment.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {fmt(meetingTime.startMinutes)}-{fmt(meetingTime.endMinutes)}
                        {enrollment.section.location ? ` · ${enrollment.section.location}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* List view with drop buttons */}
      {viewMode === "list" ? (
      <section className="campus-card no-print overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">列表视图</h2>
        </div>
        <div className="space-y-3 p-3 md:hidden">
          {loadingSchedule ? (
            <div role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
              Loading schedule…
            </div>
          ) : null}
          {!loadingSchedule && visibleEnrollments.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
              {enrollments.length === 0 ? "No courses in this term yet." : "No courses match current status filters."}
              {hasStatusFiltersApplied ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={resetStatusFilters}
                    className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Show all statuses
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {!loadingSchedule &&
            visibleEnrollments.map((enrollment) => (
              <article key={enrollment.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">
                  {enrollment.section.course.code} - {enrollment.section.course.title}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Section {enrollment.section.sectionCode}
                  {enrollment.section.location ? ` @ ${enrollment.section.location}` : ""}
                </p>
                <p className="mt-1 text-xs text-slate-600">Instructor: {enrollment.section.instructorName}</p>
                <p className="mt-1 text-xs text-slate-600">{meetingSummary(enrollment.section.meetingTimes)}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadge(enrollment.status)}`}>
                      {enrollmentStatusLabel(enrollment.status)}
                    </span>
                    {enrollment.status === "WAITLISTED" && enrollment.waitlistPosition !== null && (
                      <p className="mt-0.5 text-[10px] text-amber-700">#{enrollment.waitlistPosition} in queue</p>
                    )}
                  </div>
                  {dropDeadlinePassed && (enrollment.status === "ENROLLED" || enrollment.status === "PENDING_APPROVAL") ? (
                    <span className="text-[11px] text-amber-700">Drop unavailable after deadline</span>
                  ) : enrollment.status === "ENROLLED" || enrollment.status === "PENDING_APPROVAL" || enrollment.status === "WAITLISTED" ? (
                    <button
                      type="button"
                      onClick={() => confirmDrop(enrollment)}
                      disabled={dropping[enrollment.id]}
                      className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      {dropping[enrollment.id] ? "Dropping…" : "Drop"}
                    </button>
                  ) : null}
                </div>
                {dropError[enrollment.id] ? <p className="mt-2 text-xs text-red-700">{dropError[enrollment.id]}</p> : null}
              </article>
            ))}
        </div>

        <div className="hidden max-h-[460px] overflow-auto md:block">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">Course</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Section</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Instructor</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Meeting</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {loadingSchedule ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Loading schedule…</td></tr>
              ) : visibleEnrollments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      {enrollments.length === 0 ? (
                        <>
                          <span className="text-3xl">📅</span>
                          <p className="text-sm font-medium text-slate-700">No courses enrolled this term</p>
                          <p className="text-xs text-slate-500">Browse the catalog and add sections to your cart to register.</p>
                          <a
                            href={termId ? `/student/catalog?termId=${termId}` : "/student/catalog"}
                            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 no-underline transition hover:bg-slate-50"
                          >
                            Browse Catalog →
                          </a>
                        </>
                      ) : (
                        <>
                          <span className="text-3xl">🔍</span>
                          <p className="text-sm font-medium text-slate-700">No courses match current status filters</p>
                          <button
                            type="button"
                            onClick={resetStatusFilters}
                            className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            Show all statuses
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                visibleEnrollments.map((enrollment) => (
                  <Fragment key={enrollment.id}>
                    <tr key={enrollment.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/60">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {enrollment.section.course.code}
                        <span className="ml-1 font-normal text-slate-500">— {enrollment.section.course.title}</span>
                        <span className="ml-1.5 text-xs font-normal text-slate-400">({enrollment.section.credits} cr)</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        §{enrollment.section.sectionCode}
                        {enrollment.status === "PENDING_APPROVAL" ? <span className="ml-1 text-xs text-blue-700">(Pending)</span> : null}
                        {enrollment.section.location ? <span className="ml-1 text-xs text-slate-400">@ {enrollment.section.location}</span> : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{enrollment.section.instructorName}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{meetingSummary(enrollment.section.meetingTimes)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadge(enrollment.status)}`}>
                          {enrollmentStatusLabel(enrollment.status)}
                        </span>
                        {enrollment.status === "WAITLISTED" && enrollment.waitlistPosition !== null && (
                          <p className="mt-0.5 text-[10px] text-amber-700">#{enrollment.waitlistPosition} in queue</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {dropDeadlinePassed && (enrollment.status === "ENROLLED" || enrollment.status === "PENDING_APPROVAL") ? (
                          <div className="space-y-1">
                            <button
                              type="button"
                              disabled
                              className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-xs font-medium text-slate-400 cursor-not-allowed"
                              title="Drop deadline has passed"
                            >
                              Drop unavailable
                            </button>
                            <p className="text-[11px] text-amber-700">Contact advisor/registrar</p>
                          </div>
                        ) : enrollment.status === "ENROLLED" || enrollment.status === "PENDING_APPROVAL" || enrollment.status === "WAITLISTED" ? (
                          <button
                            type="button"
                            onClick={() => confirmDrop(enrollment)}
                            disabled={dropping[enrollment.id]}
                            className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            {dropping[enrollment.id] ? "Dropping…" : "Drop"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                    {dropError[enrollment.id] ? (
                      <tr key={`err-${enrollment.id}`} className="bg-red-50">
                        <td colSpan={6} className="px-4 py-2 text-xs text-red-700">{dropError[enrollment.id]}</td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {viewMode === "grid" ? (
        <section className="campus-card no-print overflow-hidden p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">网格视图</h2>
              <p className="text-xs text-slate-500">08:00-21:00 · 30 分钟粒度</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-emerald-700">
                {enrollmentStatusLabel("ENROLLED")}
              </span>
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-amber-700">
                {enrollmentStatusLabel("WAITLISTED")}
              </span>
            </div>
          </div>
          {loadingSchedule ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Loading grid view…
            </div>
          ) : visibleEnrollments.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              {enrollments.length === 0 ? "本学期暂无课程" : "当前筛选下没有可展示的课程。"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[980px] grid-cols-[60px_repeat(7,minmax(0,1fr))] auto-rows-[28px]">
                <div className="border-b border-r border-slate-200 bg-slate-50" />
                {GRID_DAY_INDEXES.map((weekday) => (
                  <div
                    key={`header-${weekday}`}
                    className={`border-b border-r border-slate-200 px-2 py-2 text-center text-xs font-semibold ${
                      weekday === todayWeekday ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-600"
                    }`}
                  >
                    <div>{WEEKDAY[weekday]}</div>
                    {weekday === todayWeekday ? (
                      <span className="mt-1 inline-flex rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        今天
                      </span>
                    ) : null}
                  </div>
                ))}
                {timeSlots.map((minutes, index) => (
                  <Fragment key={`slot-${minutes}`}>
                    <div className="border-b border-r border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
                      {fmt(minutes)}
                    </div>
                    {GRID_DAY_INDEXES.map((weekday) => (
                      <div
                        key={`cell-${weekday}-${minutes}`}
                        className={`border-r border-b border-gray-100 ${
                          weekday === todayWeekday
                            ? "bg-blue-50/30"
                            : index % 2 === 0
                              ? "bg-gray-50/50"
                              : "bg-white"
                        }`}
                      />
                    ))}
                  </Fragment>
                ))}
                {gridBlocks.map(({ key, enrollment, meetingTime, rowStart, rowSpan, colStart, tone }) => (
                  <div
                    key={key}
                    title={`${enrollment.section.course.title}\n${enrollment.section.instructorName}\n${enrollment.section.location ?? "TBA"}`}
                    className={`z-10 mx-1 my-0.5 overflow-hidden rounded-md border-l-4 px-2 py-1 shadow-sm ${tone}`}
                    style={{
                      gridColumnStart: colStart,
                      gridRowStart: rowStart,
                      gridRowEnd: `span ${rowSpan}`
                    }}
                  >
                    <p className="truncate text-xs font-bold">{enrollment.section.course.code}</p>
                    <p className="text-[10px] opacity-80">{fmt(meetingTime.startMinutes)}-{fmt(meetingTime.endMinutes)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : null}

      <section className="print-only hidden">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Schedule{activeTerm ? ` — ${activeTerm.name}` : ""}
        </h2>
        <table aria-label="Printable schedule">
          <thead>
            <tr>
              <th>Course</th>
              <th>Section</th>
              <th>Instructor</th>
              <th>Meeting</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(visibleEnrollments.length > 0 ? visibleEnrollments : enrollments).map((enrollment) => (
              <tr key={`print-${enrollment.id}`}>
                <td>{enrollment.section.course.code} - {enrollment.section.course.title}</td>
                <td>
                  {enrollment.section.sectionCode}
                  {enrollment.section.location ? ` @ ${enrollment.section.location}` : ""}
                </td>
                <td>{enrollment.section.instructorName}</td>
                <td>{meetingSummary(enrollment.section.meetingTimes)}</td>
                <td>{enrollmentStatusLabel(enrollment.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
