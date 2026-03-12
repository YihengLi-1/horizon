"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type MeetingTime = {
  weekday: number; // 0 = Mon … 6 = Sun
  startMinutes: number;
  endMinutes: number;
};

type SectionRow = {
  id: string;
  capacity: number;
  meetingTimes: MeetingTime[];
  enrollments: Array<{ status: string }>;
};

// Hour slots 7 – 21 (7 am to 9 pm)
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmt(h: number) {
  const suffix = h < 12 ? "am" : "pm";
  const display = h <= 12 ? h : h - 12;
  return `${display}${suffix}`;
}

// Returns true if a meeting covers any part of the given hour slot
function coversHour(mt: MeetingTime, hour: number): boolean {
  const slotStart = hour * 60;
  const slotEnd = slotStart + 60;
  return mt.startMinutes < slotEnd && mt.endMinutes > slotStart;
}

export default function TimeSlotHeatmap({ termId }: { termId?: string }) {
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = termId ? `?termId=${termId}` : "";
    apiFetch<SectionRow[]>(`/academics/sections${params}`)
      .then((data) => setSections(data ?? []))
      .catch(() => setSections([]))
      .finally(() => setLoading(false));
  }, [termId]);

  if (loading) {
    return <div className="h-48 animate-pulse rounded-xl bg-slate-100" />;
  }

  // Build grid: cell[day][hour] = { sectionCount, enrolledCount, totalCapacity }
  type Cell = { sectionCount: number; enrolledCount: number; totalCapacity: number };
  const grid: Cell[][] = DAYS.map(() =>
    HOURS.map(() => ({ sectionCount: 0, enrolledCount: 0, totalCapacity: 0 }))
  );

  for (const sec of sections) {
    const enrolled = sec.enrollments.filter(
      (e) => e.status === "ENROLLED" || e.status === "PENDING_APPROVAL"
    ).length;
    for (const mt of sec.meetingTimes) {
      const dayIdx = mt.weekday; // 0-6
      if (dayIdx < 0 || dayIdx >= 7) continue;
      for (let hi = 0; hi < HOURS.length; hi++) {
        if (coversHour(mt, HOURS[hi])) {
          grid[dayIdx][hi].sectionCount++;
          grid[dayIdx][hi].enrolledCount += enrolled;
          grid[dayIdx][hi].totalCapacity += sec.capacity;
        }
      }
    }
  }

  const maxSections = Math.max(...grid.flatMap((d) => d.map((c) => c.sectionCount)), 1);

  // Determine which days have any sections
  const activeDayIndices = DAYS.map((_, di) =>
    grid[di].some((c) => c.sectionCount > 0) ? di : -1
  ).filter((di) => di !== -1);
  const displayDays = activeDayIndices.length > 0 ? activeDayIndices : [0, 1, 2, 3, 4];

  function cellColor(count: number): string {
    if (count === 0) return "bg-slate-50 text-slate-300";
    const pct = count / maxSections;
    if (pct >= 0.85) return "bg-indigo-700 text-white";
    if (pct >= 0.65) return "bg-indigo-500 text-white";
    if (pct >= 0.45) return "bg-indigo-300 text-indigo-900";
    if (pct >= 0.25) return "bg-indigo-200 text-indigo-800";
    return "bg-indigo-100 text-indigo-700";
  }

  return (
    <div className="campus-card overflow-x-auto p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">Time-Slot Utilization Heatmap</p>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="h-3 w-5 rounded bg-indigo-100" />
          <span>Low</span>
          <span className="h-3 w-5 rounded bg-indigo-300" />
          <span className="h-3 w-5 rounded bg-indigo-500" />
          <span className="h-3 w-5 rounded bg-indigo-700" />
          <span>High</span>
        </div>
      </div>

      <div
        className="grid gap-0.5 text-center text-[10px]"
        style={{ gridTemplateColumns: `3.5rem repeat(${displayDays.length}, minmax(0, 1fr))` }}
      >
        {/* Header row */}
        <div />
        {displayDays.map((di) => (
          <div key={di} className="py-1 font-semibold text-slate-500">
            {DAYS[di]}
          </div>
        ))}

        {/* Data rows */}
        {HOURS.map((hour, hi) => (
          <>
            <div key={`h-${hour}`} className="flex items-center justify-end pr-2 text-[10px] text-slate-400">
              {fmt(hour)}
            </div>
            {displayDays.map((di) => {
              const cell = grid[di][hi];
              const pct =
                cell.totalCapacity > 0
                  ? Math.round((cell.enrolledCount / cell.totalCapacity) * 100)
                  : null;
              return (
                <div
                  key={`${di}-${hi}`}
                  title={
                    cell.sectionCount > 0
                      ? `${DAYS[di]} ${fmt(hour)}: ${cell.sectionCount} section(s)${pct !== null ? `, ${pct}% fill` : ""}`
                      : "No sections"
                  }
                  className={`flex h-7 cursor-default items-center justify-center rounded text-[10px] font-semibold transition-opacity hover:opacity-80 ${cellColor(cell.sectionCount)}`}
                >
                  {cell.sectionCount > 0 ? cell.sectionCount : ""}
                </div>
              );
            })}
          </>
        ))}
      </div>

      <p className="mt-2 text-[10px] text-slate-400">
        Cell value = number of sections meeting in that hour block. Hover for fill-rate detail.
      </p>
    </div>
  );
}
