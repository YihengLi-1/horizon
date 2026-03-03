"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type WaitlistRow = {
  id: string;
  waitlistPosition: number | null;
  student: {
    studentId: string | null;
    studentProfile?: { legalName?: string };
  };
  section: {
    id: string;
    sectionCode: string;
    course: { code: string; title: string };
  };
};

type PromoteResponse = {
  promotedCount: number;
  remainingWaitlistCount: number;
  availableSeatsBefore: number;
  availableSeatsAfter: number;
};

export default function WaitlistPage() {
  const [rows, setRows] = useState<WaitlistRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [promotingSectionId, setPromotingSectionId] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<WaitlistRow[]>("/admin/waitlist");
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load waitlist");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const promote = async (sectionId: string) => {
    try {
      setPromotingSectionId(sectionId);
      setError("");
      setNotice("");
      const response = await apiFetch<PromoteResponse>("/admin/waitlist/promote", {
        method: "POST",
        body: JSON.stringify({ sectionId, count: 1 })
      });
      setNotice(
        `Promoted ${response.promotedCount}. Remaining waitlist ${response.remainingWaitlistCount}. Seats before ${response.availableSeatsBefore}, after ${response.availableSeatsAfter}.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promote failed");
    } finally {
      setPromotingSectionId(null);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, WaitlistRow[]>();
    for (const row of rows) {
      const key = `${row.section.id}::${row.section.course.code}::${row.section.sectionCode}`;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .map(([key, list]) => {
        const [sectionId, courseCode, sectionCode] = key.split("::");
        return {
          sectionId,
          courseCode,
          sectionCode,
          items: list.sort((a, b) => (a.waitlistPosition ?? 9999) - (b.waitlistPosition ?? 9999))
        };
      })
      .sort((a, b) => {
        if (b.items.length !== a.items.length) return b.items.length - a.items.length;
        return `${a.courseCode}${a.sectionCode}`.localeCompare(`${b.courseCode}${b.sectionCode}`);
      });
  }, [rows]);

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Waitlist Queue</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">Waitlist</h1>
            <p className="text-sm text-slate-600 md:text-base">
              Review ordered waitlist positions and promote the next student when ENROLLED seats free up.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{rows.length} waitlisted enrollment(s)</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{grouped.length} section queue(s)</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
          >
            Refresh
          </button>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      <section className="space-y-4">
        {loading ? (
          <div className="campus-card px-4 py-8 text-center text-slate-500">Loading waitlist...</div>
        ) : grouped.length === 0 ? (
          <div className="campus-card px-4 py-10 text-center text-slate-500">No waitlist entries.</div>
        ) : (
          grouped.map((group) => (
            <article key={group.sectionId} className="campus-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    {group.courseCode} §{group.sectionCode}
                  </h2>
                  <p className="text-xs text-slate-500">{group.items.length} student(s) in queue</p>
                </div>
                <button
                  type="button"
                  onClick={() => void promote(group.sectionId)}
                  disabled={promotingSectionId === group.sectionId}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                >
                  {promotingSectionId === group.sectionId ? (
                    <>
                      <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Promoting
                    </>
                  ) : (
                    "Promote next"
                  )}
                </button>
              </div>
              <div className="overflow-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-2.5 font-semibold text-slate-700">Position</th>
                      <th className="px-4 py-2.5 font-semibold text-slate-700">Student</th>
                      <th className="px-4 py-2.5 font-semibold text-slate-700">Student ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40">
                        <td className="px-4 py-2.5 font-medium text-slate-900">#{row.waitlistPosition ?? "-"}</td>
                        <td className="px-4 py-2.5 text-slate-700">{row.student.studentProfile?.legalName || "-"}</td>
                        <td className="px-4 py-2.5 text-slate-700">{row.student.studentId || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
