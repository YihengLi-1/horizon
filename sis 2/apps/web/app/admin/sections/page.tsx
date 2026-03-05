"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Enrollment = {
  id: string;
  status: string;
};

type Section = {
  id: string;
  sectionCode: string;
  capacity: number;
  term: { name: string };
  course: { code: string };
  enrollments: Enrollment[];
};

type PromoteResponse = {
  promoted: Array<{
    enrollmentId: string;
    studentId: string;
    sectionId: string;
  }>;
  promotedCount: number;
  remainingWaitlistCount: number;
  availableSeatsBefore: number;
  availableSeatsAfter: number;
};

type RowMessage = {
  type: "success" | "error";
  text: string;
};

function Alert({ type, message }: { type: "success" | "error" | "info"; message: string }) {
  const styles =
    type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : type === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{message}</div>;
}

export default function AdminSectionsPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [pageError, setPageError] = useState("");
  const [countsBySection, setCountsBySection] = useState<Record<string, number>>({});
  const [loadingBySection, setLoadingBySection] = useState<Record<string, boolean>>({});
  const [messageBySection, setMessageBySection] = useState<Record<string, RowMessage>>({});
  const [loading, setLoading] = useState(false);
  const [termFilter, setTermFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const sectionIds = useMemo(() => sections.map((section) => section.id), [sections]);
  const termOptions = useMemo(
    () => Array.from(new Set(sections.map((section) => section.term.name))).sort((a, b) => a.localeCompare(b)),
    [sections]
  );

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sections.filter((section) => {
      if (termFilter !== "ALL" && section.term.name !== termFilter) return false;
      if (!q) return true;
      const target = `${section.term.name} ${section.course.code} ${section.sectionCode}`.toLowerCase();
      return target.includes(q);
    });
  }, [sections, search, termFilter]);

  const loadSections = async () => {
    try {
      setLoading(true);
      setPageError("");
      const data = await apiFetch<Section[]>("/admin/sections");
      setSections(data);
      setCountsBySection((prev) => {
        const next: Record<string, number> = {};
        for (const section of data) {
          next[section.id] = prev[section.id] && prev[section.id] > 0 ? prev[section.id] : 1;
        }
        return next;
      });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to load sections");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSections();
  }, []);

  useEffect(() => {
    setMessageBySection((prev) => {
      const next: Record<string, RowMessage> = {};
      for (const id of sectionIds) {
        if (prev[id]) next[id] = prev[id];
      }
      return next;
    });
  }, [sectionIds]);

  const setRowCount = (sectionId: string, value: string) => {
    const numeric = Number(value);
    setCountsBySection((prev) => ({
      ...prev,
      [sectionId]: Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 1
    }));
  };

  const promote = async (sectionId: string) => {
    const count = Math.max(1, Math.floor(countsBySection[sectionId] || 1));

    setLoadingBySection((prev) => ({ ...prev, [sectionId]: true }));
    setMessageBySection((prev) => {
      const next = { ...prev };
      delete next[sectionId];
      return next;
    });

    try {
      const result = await apiFetch<PromoteResponse>("/admin/waitlist/promote", {
        method: "POST",
        body: JSON.stringify({ sectionId, count })
      });

      setMessageBySection((prev) => ({
        ...prev,
        [sectionId]: {
          type: "success",
          text: `Promoted ${result.promotedCount}. Remaining waitlist ${result.remainingWaitlistCount}. Seats before ${result.availableSeatsBefore}, after ${result.availableSeatsAfter}.`
        }
      }));

      await loadSections();
    } catch (error) {
      setMessageBySection((prev) => ({
        ...prev,
        [sectionId]: {
          type: "error",
          text: error instanceof Error ? error.message : "Promotion failed"
        }
      }));
    } finally {
      setLoadingBySection((prev) => ({ ...prev, [sectionId]: false }));
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sections Management</h1>
          <p className="mt-1 text-sm text-slate-600">Monitor capacity and promote students from waitlist into available seats.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadSections()}
          className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Refresh
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="grid gap-3 md:grid-cols-[260px_minmax(0,1fr)]">
          <label className="block">
            <span className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-slate-100 text-[10px]">T</span>
              Term
            </span>
            <select
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              value={termFilter}
              onChange={(event) => setTermFilter(event.target.value)}
            >
              <option value="ALL">All terms</option>
              {termOptions.map((termName) => (
                <option key={termName} value={termName}>
                  {termName}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-slate-100 text-[10px]">S</span>
              Search
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">⌕</span>
              <input
                className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                placeholder="Filter by term, course code, or section"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </label>
        </div>
      </section>

      {pageError ? <Alert type="error" message={pageError} /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="max-h-[520px] overflow-auto rounded-2xl">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">Term</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Course</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Section</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Capacity</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Enrolled</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Waitlist</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Available</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Promote</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? [1, 2, 3, 4].map((row) => (
                    <tr key={row} className="border-b border-slate-100">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="animate-pulse space-y-2">
                          <div className="h-4 w-1/4 rounded bg-slate-200" />
                          <div className="h-4 w-1/2 rounded bg-slate-100" />
                        </div>
                      </td>
                    </tr>
                  ))
                : null}

              {!loading &&
                filteredSections.map((section) => {
                  const enrolledCount = section.enrollments.filter((item) => item.status === "ENROLLED").length;
                  const waitlistCount = section.enrollments.filter((item) => item.status === "WAITLISTED").length;
                  const availableSeats = Math.max(0, section.capacity - enrolledCount);
                  const rowMessage = messageBySection[section.id];

                  return (
                    <Fragment key={section.id}>
                      <tr className="border-b border-slate-100 align-top odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/60">
                        <td className="px-4 py-3 text-slate-700">{section.term.name}</td>
                        <td className="px-4 py-3 text-slate-900">{section.course.code}</td>
                        <td className="px-4 py-3 text-slate-700">{section.sectionCode}</td>
                        <td className="px-4 py-3 text-slate-700">{section.capacity}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            ENROLLED {enrolledCount}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            WAITLISTED {waitlistCount}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {availableSeats} seats
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              value={countsBySection[section.id] ?? 1}
                              onChange={(event) => setRowCount(section.id, event.target.value)}
                              className="h-10 w-20 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                            />
                            <button
                              type="button"
                              onClick={() => promote(section.id)}
                              disabled={loadingBySection[section.id]}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {loadingBySection[section.id] ? (
                                <>
                                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                                  Promoting
                                </>
                              ) : (
                                "Promote"
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {rowMessage ? (
                        <tr className="border-b border-slate-100 bg-white">
                          <td colSpan={8} className="px-4 pb-4">
                            <div
                              className={`rounded-lg border px-3 py-2 text-sm ${
                                rowMessage.type === "success"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                  : "border-red-200 bg-red-50 text-red-800"
                              }`}
                            >
                              {rowMessage.text}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}

              {!loading && filteredSections.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    No sections found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
