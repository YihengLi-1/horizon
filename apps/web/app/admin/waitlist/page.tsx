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

type SectionMessage = {
  type: "success" | "error";
  text: string;
};

export default function WaitlistPage() {
  const [rows, setRows] = useState<WaitlistRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [promotingSectionId, setPromotingSectionId] = useState<string | null>(null);
  const [bulkPromoting, setBulkPromoting] = useState(false);
  const [bulkNotice, setBulkNotice] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [messageBySection, setMessageBySection] = useState<Record<string, SectionMessage>>({});
  const [search, setSearch] = useState("");

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
      setBulkNotice("");
      setBulkError("");
      setMessageBySection((prev) => { const n = { ...prev }; delete n[sectionId]; return n; });
      const response = await apiFetch<PromoteResponse>("/admin/waitlist/promote", {
        method: "POST",
        body: JSON.stringify({ sectionId, count: 1 })
      });
      setMessageBySection((prev) => ({
        ...prev,
        [sectionId]: {
          type: "success",
          text: `Promoted ${response.promotedCount}. Remaining: ${response.remainingWaitlistCount}. Seats: ${response.availableSeatsBefore}→${response.availableSeatsAfter}.`
        }
      }));
      await load();
    } catch (err) {
      setMessageBySection((prev) => ({
        ...prev,
        [sectionId]: { type: "error", text: err instanceof Error ? err.message : "Promote failed" }
      }));
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
        const title = list[0]?.section.course.title ?? "";
        return {
          sectionId,
          courseCode,
          sectionCode,
          title,
          items: list.sort((a, b) => (a.waitlistPosition ?? 9999) - (b.waitlistPosition ?? 9999))
        };
      })
      .sort((a, b) => {
        if (b.items.length !== a.items.length) return b.items.length - a.items.length;
        return `${a.courseCode}${a.sectionCode}`.localeCompare(`${b.courseCode}${b.sectionCode}`);
      });
  }, [rows]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return grouped;
    return grouped.filter((group) =>
      `${group.courseCode} ${group.sectionCode} ${group.title}`.toLowerCase().includes(q) ||
      group.items.some((item) =>
        `${item.student.studentProfile?.legalName ?? ""} ${item.student.studentId ?? ""}`.toLowerCase().includes(q)
      )
    );
  }, [grouped, search]);

  const totalWaitlisted = rows.length;

  const promoteAll = async () => {
    if (filteredGroups.length === 0) return;
    setBulkPromoting(true);
    setBulkNotice("");
    setBulkError("");
    setMessageBySection({});
    let totalPromoted = 0;
    let failures = 0;

    for (const group of filteredGroups) {
      try {
        const response = await apiFetch<PromoteResponse>("/admin/waitlist/promote", {
          method: "POST",
          body: JSON.stringify({ sectionId: group.sectionId, count: 1 })
        });
        totalPromoted += response.promotedCount;
        setMessageBySection((prev) => ({
          ...prev,
          [group.sectionId]: {
            type: "success",
            text: `Promoted ${response.promotedCount}. Remaining: ${response.remainingWaitlistCount}.`
          }
        }));
      } catch {
        failures += 1;
        setMessageBySection((prev) => ({
          ...prev,
          [group.sectionId]: { type: "error", text: "Promotion failed" }
        }));
      }
    }

    if (failures > 0) {
      setBulkError(`Promoted ${totalPromoted} across ${filteredGroups.length - failures} queue(s). ${failures} failed.`);
    } else {
      setBulkNotice(`Promoted ${totalPromoted} across ${filteredGroups.length} queue(s).`);
    }
    setBulkPromoting(false);
    await load();
  };

  const exportCsv = () => {
    const csvRows = [
      ["Position", "Student Name", "Student ID", "Course", "Section", "Course Title"],
      ...rows.map((row) => [
        row.waitlistPosition !== null ? String(row.waitlistPosition) : "",
        row.student.studentProfile?.legalName ?? "",
        row.student.studentId ?? "",
        row.section.course.code,
        row.section.sectionCode,
        row.section.course.title
      ])
    ];
    const csv = csvRows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{totalWaitlisted} waitlisted enrollment(s)</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{grouped.length} section queue(s)</span>
              {filteredGroups.length !== grouped.length ? (
                <span className="campus-chip border-blue-200 bg-blue-50 text-blue-700">{filteredGroups.length} visible</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void promoteAll()}
              disabled={bulkPromoting || filteredGroups.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkPromoting ? (
                <><span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />Promoting All</>
              ) : `Promote 1 from Each (${filteredGroups.length})`}
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={rows.length === 0}
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
            >
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="campus-toolbar">
        <label className="block max-w-sm">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
          <input
            className="campus-input"
            placeholder="Course, section, student name or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="mt-2 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
          >
            Clear search
          </button>
        ) : null}
      </section>

      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}
      {bulkError ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {bulkError}
        </div>
      ) : null}
      {bulkNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {bulkNotice}
        </div>
      ) : null}

      <section className="space-y-4">
        {loading ? (
          <div className="campus-card px-4 py-8 text-center text-slate-500">Loading waitlist...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="campus-card px-4 py-10 text-center text-slate-500">
            {grouped.length === 0 ? "No waitlist entries." : "No queues match your search."}
          </div>
        ) : (
          filteredGroups.map((group) => {
            const msg = messageBySection[group.sectionId];
            return (
              <article key={group.sectionId} className="campus-card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      {group.courseCode} §{group.sectionCode}
                    </h2>
                    <p className="text-xs text-slate-500">{group.title} · {group.items.length} student(s) in queue</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void promote(group.sectionId)}
                    disabled={promotingSectionId === group.sectionId || bulkPromoting}
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

                {msg ? (
                  <div
                    role={msg.type === "error" ? "alert" : "status"}
                    aria-live={msg.type === "error" ? "assertive" : "polite"}
                    className={`border-b px-4 py-2 text-sm ${msg.type === "success" ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-red-100 bg-red-50 text-red-800"}`}
                  >
                    {msg.text}
                  </div>
                ) : null}

                <p className="px-4 pt-3 text-xs text-slate-500 md:hidden">Tip: Swipe horizontally to view all columns.</p>
                <div className="overflow-auto">
                  <table className="min-w-[520px] w-full border-collapse text-sm">
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
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold ${row.waitlistPosition === 1 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                              #{row.waitlistPosition ?? "-"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-700">{row.student.studentProfile?.legalName || "-"}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{row.student.studentId || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
