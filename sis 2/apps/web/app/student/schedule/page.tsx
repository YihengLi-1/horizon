"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayIndexes = [1, 2, 3, 4, 5];
const dayStartMinutes = 8 * 60;
const dayEndMinutes = 18 * 60;
const hourHeight = 56;
const scheduleHeight = ((dayEndMinutes - dayStartMinutes) / 60) * hourHeight;

type Term = { id: string; name: string };

type MeetingTime = {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
};

type ScheduleEnrollment = {
  id: string;
  status: string;
  section: {
    sectionCode: string;
    course: { code: string; title: string };
    meetingTimes: MeetingTime[];
  };
};

function formatTime(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function formatMeetingSummary(meetingTimes: MeetingTime[]): string {
  if (!meetingTimes.length) return "No meeting time";
  return meetingTimes
    .map((meeting) => {
      const day = weekdayLabels[meeting.weekday] ?? String(meeting.weekday);
      return `${day} ${formatTime(meeting.startMinutes)}-${formatTime(meeting.endMinutes)}`;
    })
    .join(", ");
}

export default function SchedulePage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [enrollments, setEnrollments] = useState<ScheduleEnrollment[]>([]);
  const [error, setError] = useState("");
  const [loadingTerms, setLoadingTerms] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  const updateUrlTerm = (nextTermId: string) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("termId", nextTermId);
    window.history.replaceState({}, "", url.toString());
  };

  const loadSchedule = async (id: string) => {
    if (!id) {
      setEnrollments([]);
      return;
    }

    try {
      setLoadingSchedule(true);
      setError("");
      const data = await apiFetch<ScheduleEnrollment[]>(`/registration/schedule?termId=${id}`);
      setEnrollments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule");
    } finally {
      setLoadingSchedule(false);
    }
  };

  useEffect(() => {
    async function loadTermsAndSchedule() {
      try {
        setLoadingTerms(true);
        setError("");
        const termData = await apiFetch<Term[]>("/academics/terms");
        setTerms(termData);

        const queryTermId =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("termId") ?? "" : "";
        const validQueryTermId =
          queryTermId && termData.some((term) => term.id === queryTermId) ? queryTermId : "";
        const fallbackTermId = termData[0]?.id ?? "";
        const initialTermId = validQueryTermId || fallbackTermId;

        setTermId(initialTermId);

        if (initialTermId) {
          updateUrlTerm(initialTermId);
          await loadSchedule(initialTermId);
        } else {
          setEnrollments([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load terms");
      } finally {
        setLoadingTerms(false);
      }
    }

    void loadTermsAndSchedule();
  }, []);

  const onTermChange = async (nextTermId: string) => {
    setTermId(nextTermId);
    updateUrlTerm(nextTermId);
    await loadSchedule(nextTermId);
  };

  const scheduleBlocksByDay = useMemo(() => {
    const blocks = new Map<number, Array<{ key: string; label: string; time: string; top: number; height: number }>>();
    for (const day of dayIndexes) {
      blocks.set(day, []);
    }

    for (const enrollment of enrollments) {
      for (let i = 0; i < enrollment.section.meetingTimes.length; i += 1) {
        const meeting = enrollment.section.meetingTimes[i];
        if (!blocks.has(meeting.weekday)) continue;

        if (meeting.endMinutes <= dayStartMinutes || meeting.startMinutes >= dayEndMinutes) continue;

        const clampedStart = Math.max(meeting.startMinutes, dayStartMinutes);
        const clampedEnd = Math.min(meeting.endMinutes, dayEndMinutes);
        const top = ((clampedStart - dayStartMinutes) / 60) * hourHeight;
        const height = ((clampedEnd - clampedStart) / 60) * hourHeight;

        blocks.get(meeting.weekday)?.push({
          key: `${enrollment.id}-${i}`,
          label: `${enrollment.status === "PENDING_APPROVAL" ? "[Pending] " : ""}${enrollment.section.course.code} ${enrollment.section.sectionCode}`,
          time: `${formatTime(meeting.startMinutes)}-${formatTime(meeting.endMinutes)}`,
          top,
          height: Math.max(height, 20)
        });
      }
    }

    return blocks;
  }, [enrollments]);

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let minutes = dayStartMinutes; minutes <= dayEndMinutes; minutes += 60) {
      marks.push(minutes);
    }
    return marks;
  }, []);

  return (
    <div className="rounded-xl border bg-white p-4">
      <h1 className="text-xl font-semibold">Schedule</h1>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">Term</label>
        <div>
          <select
            className="rounded border px-2 py-1 text-sm"
            value={termId}
            onChange={(event) => void onTermChange(event.target.value)}
            disabled={loadingTerms || terms.length === 0}
          >
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {loadingTerms ? <p className="mt-3 text-sm text-gray-600">Loading terms...</p> : null}
      {loadingSchedule ? <p className="mt-3 text-sm text-gray-600">Loading schedule...</p> : null}

      <div className="mt-6">
        <h2 className="text-base font-semibold">List View</h2>
        <div className="mt-2 overflow-x-auto rounded border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-3 py-2 font-medium text-gray-700">Course</th>
                <th className="px-3 py-2 font-medium text-gray-700">Section</th>
                <th className="px-3 py-2 font-medium text-gray-700">Meetings</th>
              </tr>
            </thead>
            <tbody>
              {!loadingSchedule && enrollments.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-gray-600">
                    No schedule items.
                  </td>
                </tr>
              ) : null}

              {enrollments.map((enrollment) => (
                <tr key={enrollment.id} className="border-b">
                  <td className="px-3 py-2">
                    {enrollment.section.course.code} - {enrollment.section.course.title}
                  </td>
                  <td className="px-3 py-2">
                    {enrollment.section.sectionCode}
                    {enrollment.status === "PENDING_APPROVAL" ? " (Pending)" : ""}
                  </td>
                  <td className="px-3 py-2">{formatMeetingSummary(enrollment.section.meetingTimes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-base font-semibold">Week Grid</h2>
        <div className="mt-2 overflow-x-auto rounded border">
          <div className="grid min-w-[680px] grid-cols-[72px_repeat(5,minmax(0,1fr))]">
            <div className="border-b bg-gray-50" />
            {dayIndexes.map((day) => (
              <div key={`head-${day}`} className="border-b border-l bg-gray-50 px-2 py-2 text-center text-sm font-medium">
                {weekdayLabels[day]}
              </div>
            ))}

            <div className="relative border-r bg-gray-50" style={{ height: `${scheduleHeight}px` }}>
              {hourMarks.slice(0, -1).map((mark) => {
                const top = ((mark - dayStartMinutes) / 60) * hourHeight;
                return (
                  <div
                    key={`label-${mark}`}
                    className="absolute left-1 text-[11px] text-gray-500"
                    style={{ top: `${Math.max(0, top - 8)}px` }}
                  >
                    {formatTime(mark)}
                  </div>
                );
              })}
            </div>

            {dayIndexes.map((day) => (
              <div key={`day-${day}`} className="relative border-l" style={{ height: `${scheduleHeight}px` }}>
                {hourMarks.map((mark) => {
                  const top = ((mark - dayStartMinutes) / 60) * hourHeight;
                  return (
                    <div
                      key={`line-${day}-${mark}`}
                      className="absolute left-0 right-0 border-t border-gray-100"
                      style={{ top: `${top}px` }}
                    />
                  );
                })}

                {(scheduleBlocksByDay.get(day) ?? []).map((block) => (
                  <div
                    key={block.key}
                    className="absolute left-1 right-1 overflow-hidden rounded border border-blue-300 bg-blue-100 px-1 py-0.5 text-[11px] leading-tight text-blue-900"
                    style={{ top: `${block.top}px`, height: `${block.height}px` }}
                  >
                    <div className="font-medium">{block.label}</div>
                    <div>{block.time}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
