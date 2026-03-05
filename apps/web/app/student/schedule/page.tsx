"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { enrollmentStatusLabel } from "@/lib/labels";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_INDEXES = [1, 2, 3, 4, 5]; // Mon–Fri
const DAY_START = 8 * 60;
const DAY_END = 18 * 60;
const HOUR_H = 56;
const SCHEDULE_H = ((DAY_END - DAY_START) / 60) * HOUR_H;

type Term = {
  id: string;
  name: string;
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

export default function SchedulePage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [error, setError] = useState("");
  const [dropError, setDropError] = useState<Record<string, string>>({});
  const [dropping, setDropping] = useState<Record<string, boolean>>({});
  const [loadingTerms, setLoadingTerms] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [showEnrolled, setShowEnrolled] = useState(true);
  const [showPending, setShowPending] = useState(true);
  const [showWaitlisted, setShowWaitlisted] = useState(true);
  const [showMobileWeekView, setShowMobileWeekView] = useState(false);

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

  // Week grid blocks
  const blocksByDay = useMemo(() => {
    const map = new Map<number, Array<{ key: string; code: string; section: string; time: string; top: number; height: number; status: string; label: string }>>();
    for (const day of DAY_INDEXES) map.set(day, []);

    for (const enrollment of visibleEnrollments) {
      for (let i = 0; i < enrollment.section.meetingTimes.length; i++) {
        const mt = enrollment.section.meetingTimes[i];
        if (!map.has(mt.weekday)) continue;
        if (mt.endMinutes <= DAY_START || mt.startMinutes >= DAY_END) continue;
        const cs = Math.max(mt.startMinutes, DAY_START);
        const ce = Math.min(mt.endMinutes, DAY_END);
        const baseLabel = `${enrollment.section.course.code} §${enrollment.section.sectionCode}`;
        const label = enrollment.status === "PENDING_APPROVAL" ? `[Pending Approval] ${baseLabel}` : baseLabel;
        map.get(mt.weekday)!.push({
          key: `${enrollment.id}-${i}`,
          code: enrollment.section.course.code,
          section: enrollment.section.sectionCode,
          time: `${fmt(mt.startMinutes)}–${fmt(mt.endMinutes)}`,
          top: ((cs - DAY_START) / 60) * HOUR_H,
          height: Math.max(((ce - cs) / 60) * HOUR_H, 20),
          status: enrollment.status,
          label
        });
      }
    }
    return map;
  }, [visibleEnrollments]);

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let m = DAY_START; m <= DAY_END; m += 60) marks.push(m);
    return marks;
  }, []);

  const mobileAgenda = useMemo(
    () =>
      DAY_INDEXES.map((day) => {
        const blocks = [...(blocksByDay.get(day) ?? [])].sort((a, b) => a.top - b.top);
        return { day, blocks };
      }).filter((group) => group.blocks.length > 0),
    [blocksByDay]
  );

  const blockColor = (status: string) =>
    status === "WAITLISTED"
      ? "border-amber-300 bg-amber-100 text-amber-900"
      : status === "PENDING_APPROVAL"
        ? "border-blue-300 bg-blue-100 text-blue-900"
        : "border-emerald-300 bg-emerald-100 text-emerald-900";

  const dropDaysLeft = activeTerm && !dropDeadlinePassed ? daysUntil(activeTerm.dropDeadline) : 0;

  return (
    <div className="campus-page">
      <section className="campus-hero">
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
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
          <div className={`rounded-xl border px-4 py-3 text-sm ${dropDaysLeft <= 3 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
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

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="campus-card p-4">
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

      {/* List view with drop buttons */}
      <section className="campus-card overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Section List</h2>
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

      {/* Week grid */}
      <section className="campus-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Week View (Mon-Fri, 08:00-18:00)</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-emerald-700">{enrollmentStatusLabel("ENROLLED")}</span>
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-blue-700">{enrollmentStatusLabel("PENDING_APPROVAL")}</span>
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-amber-700">{enrollmentStatusLabel("WAITLISTED")}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowMobileWeekView((prev) => !prev)}
            aria-expanded={showMobileWeekView}
            className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 md:hidden"
          >
            {showMobileWeekView ? "Hide mobile agenda" : "Show mobile agenda"}
          </button>
        </div>
        <div className="space-y-3 md:hidden">
          {!showMobileWeekView ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              Mobile agenda is collapsed by default to reduce page density. Use the toggle above to expand.
            </p>
          ) : loadingSchedule ? (
            <p role="status" aria-live="polite" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              Loading week view…
            </p>
          ) : mobileAgenda.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              <p>
                {visibleEnrollments.length === 0
                  ? enrollments.length === 0
                    ? "No schedule items available for this term."
                    : "No meeting blocks for the selected statuses."
                  : "No meeting blocks in Mon-Fri 08:00-18:00 for current filters."}
              </p>
              {hasStatusFiltersApplied ? (
                <button
                  type="button"
                  onClick={resetStatusFilters}
                  className="mt-2 inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Show all statuses
                </button>
              ) : null}
            </div>
          ) : (
            mobileAgenda.map((group) => (
              <div key={group.day} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{WEEKDAY[group.day]}</p>
                <ul className="mt-2 space-y-2">
                  {group.blocks.map((block) => (
                    <li key={`mobile-${block.key}`} className={`rounded-lg border px-2.5 py-2 text-xs ${blockColor(block.status)}`}>
                      <p className="font-semibold">{block.code} §{block.section}</p>
                      <p className="mt-0.5 opacity-85">{block.time}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <div className="grid min-w-[640px] grid-cols-[64px_repeat(5,minmax(0,1fr))]">
            {/* Header row */}
            <div className="border-b border-slate-200 bg-slate-50" />
            {DAY_INDEXES.map((day) => (
              <div key={`h-${day}`} className="border-b border-l border-slate-200 bg-slate-50 py-2 text-center text-xs font-semibold text-slate-600">
                {WEEKDAY[day]}
              </div>
            ))}

            {/* Time column */}
            <div className="relative border-r border-slate-200 bg-slate-50" style={{ height: `${SCHEDULE_H}px` }}>
              {hourMarks.slice(0, -1).map((mark) => (
                <div
                  key={mark}
                  className="absolute left-1 text-[11px] text-slate-500"
                  style={{ top: `${Math.max(0, ((mark - DAY_START) / 60) * HOUR_H - 6)}px` }}
                >
                  {fmt(mark)}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {DAY_INDEXES.map((day) => (
              <div key={`col-${day}`} className="relative border-l border-slate-200" style={{ height: `${SCHEDULE_H}px` }}>
                {hourMarks.map((mark) => (
                  <div
                    key={`line-${day}-${mark}`}
                    className="absolute left-0 right-0 border-t border-slate-100"
                    style={{ top: `${((mark - DAY_START) / 60) * HOUR_H}px` }}
                  />
                ))}
                {(blocksByDay.get(day) ?? []).map((block) => (
                  <div
                    key={block.key}
                    className={`absolute left-1 right-1 overflow-hidden rounded border px-1.5 py-1 text-[11px] leading-tight ${blockColor(block.status)}`}
                    style={{ top: `${block.top}px`, height: `${block.height}px` }}
                    title={`${block.label} · ${block.time}`}
                  >
                    <div className="font-semibold">{block.status === "PENDING_APPROVAL" ? `[Pending Approval] ${block.code}` : block.code}</div>
                    <div className="opacity-80">§{block.section}</div>
                    <div className="opacity-70">{block.time}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
