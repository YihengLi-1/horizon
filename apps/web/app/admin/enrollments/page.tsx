"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  dropDeadline: string;
};

type Enrollment = {
  id: string;
  status: string;
  finalGrade: string | null;
  createdAt: string;
  student: {
    studentId: string | null;
    studentProfile?: { legalName?: string };
  };
  section: {
    sectionCode: string;
    course: { code: string; title: string; credits: number };
  };
  term?: {
    id: string;
    name: string;
  };
};

const STATUS_OPTIONS = ["ENROLLED", "WAITLISTED", "PENDING_APPROVAL", "DROPPED", "COMPLETED"];
const PAGE_SIZE = 50;

const STATUS_COLORS: Record<string, string> = {
  ENROLLED: "bg-emerald-100 text-emerald-800",
  WAITLISTED: "bg-amber-100 text-amber-800",
  PENDING_APPROVAL: "bg-blue-100 text-blue-800",
  DROPPED: "bg-red-100 text-red-800",
  COMPLETED: "bg-slate-100 text-slate-700",
};

function StatBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`flex flex-col items-center rounded-xl border px-4 py-3 ${color}`}>
      <span className="text-2xl font-bold">{count}</span>
      <span className="mt-0.5 text-xs font-semibold uppercase tracking-wide">{label}</span>
    </div>
  );
}

export default function EnrollmentsPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [rows, setRows] = useState<Enrollment[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  const [savingGradeId, setSavingGradeId] = useState<string | null>(null);
  const [gradeState, setGradeState] = useState<Record<string, string>>({});
  const [statusState, setStatusState] = useState<Record<string, string>>({});
  const [selectedById, setSelectedById] = useState<Record<string, boolean>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  // Press "/" to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "SELECT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Load terms for selector
  useEffect(() => {
    apiFetch<Term[]>("/admin/terms")
      .then((data) => {
        const sorted = [...data].sort(
          (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
        );
        setTerms(sorted);
      })
      .catch(() => { /* non-critical */ });
  }, []);

  const load = async (termId?: string) => {
    try {
      setLoading(true);
      setError("");
      const url = termId ? `/admin/enrollments?termId=${termId}` : "/admin/enrollments";
      const data = await apiFetch<Enrollment[]>(url);
      setRows(data);
      setGradeState(Object.fromEntries(data.map((item) => [item.id, item.finalGrade || ""])));
      setStatusState(Object.fromEntries(data.map((item) => [item.id, item.status])));
      setSelectedById((prev) => {
        const next: Record<string, boolean> = {};
        for (const item of data) {
          if (prev[item.id]) next[item.id] = true;
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load enrollments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(selectedTermId || undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTermId]);

  const updateStatus = async (id: string) => {
    const status = statusState[id];
    if (!status) return;
    try {
      setSavingStatusId(id);
      setError("");
      setNotice("");
      await apiFetch(`/admin/enrollments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setNotice("Enrollment status updated.");
      await load(selectedTermId || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setSavingStatusId(null);
    }
  };

  const updateGrade = async (id: string) => {
    const finalGrade = gradeState[id]?.trim();
    if (!finalGrade) return;
    try {
      setSavingGradeId(id);
      setError("");
      setNotice("");
      await apiFetch("/admin/enrollments/grade", {
        method: "POST",
        body: JSON.stringify({ enrollmentId: id, finalGrade })
      });
      setNotice("Final grade saved.");
      await load(selectedTermId || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grade update failed");
    } finally {
      setSavingGradeId(null);
    }
  };

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    return counts;
  }, [rows]);

  const totalCredits = useMemo(() => {
    return rows
      .filter((r) => r.status === "ENROLLED" || r.status === "COMPLETED")
      .reduce((sum, r) => sum + (r.section.course.credits ?? 0), 0);
  }, [rows]);

  const visibleRows = useMemo(() => {
    let filtered = rows;
    if (statusFilter) filtered = filtered.filter((r) => r.status === statusFilter);
    const query = search.trim().toLowerCase();
    if (!query) return filtered;
    return filtered.filter((row) => {
      const text = `${row.student.studentProfile?.legalName ?? ""} ${row.student.studentId ?? ""} ${row.section.course.code} ${row.section.sectionCode} ${row.status}`.toLowerCase();
      return text.includes(query);
    });
  }, [rows, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = visibleRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selectedVisibleIds = useMemo(
    () => visibleRows.map((row) => row.id).filter((id) => selectedById[id]),
    [visibleRows, selectedById]
  );
  const allVisibleSelected = visibleRows.length > 0 && selectedVisibleIds.length === visibleRows.length;

  const toggleSelectVisible = (checked: boolean) => {
    setSelectedById((prev) => {
      const next = { ...prev };
      for (const row of visibleRows) {
        if (checked) next[row.id] = true;
        else delete next[row.id];
      }
      return next;
    });
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedById((prev) => {
      const next = { ...prev };
      if (checked) next[id] = true;
      else delete next[id];
      return next;
    });
  };

  const clearSelection = () => setSelectedById({});

  const exportCsv = () => {
    const source = visibleRows.length > 0 ? visibleRows : rows;
    const headers = ["StudentID", "LegalName", "CourseCode", "CourseTitle", "SectionCode", "Credits", "Status", "FinalGrade", "Term"];
    const csvRows = [
      headers.join(","),
      ...source.map((row) => [
        row.student.studentId ?? "",
        `"${(row.student.studentProfile?.legalName ?? "").replace(/"/g, '""')}"`,
        row.section.course.code,
        `"${row.section.course.title.replace(/"/g, '""')}"`,
        row.section.sectionCode,
        row.section.course.credits ?? "",
        row.status,
        row.finalGrade ?? "",
        `"${(row.term?.name ?? "").replace(/"/g, '""')}"`
      ].join(","))
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const termSuffix = selectedTermId ? `-${terms.find((t) => t.id === selectedTermId)?.name ?? "term"}` : "";
    a.download = `enrollments${termSuffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const bulkSetStatus = async (nextStatus: string, allowedCurrentStatuses: string[]) => {
    if (selectedVisibleIds.length === 0) return;
    const allowed = new Set(allowedCurrentStatuses);
    const targetIds = selectedVisibleIds.filter((id) => {
      const current = statusState[id] ?? rows.find((row) => row.id === id)?.status ?? "";
      return allowed.has(current);
    });

    if (targetIds.length === 0) {
      setNotice("No selected records match this bulk action.");
      return;
    }

    setBulkSaving(true);
    setError("");
    setNotice("");

    let success = 0;
    const failed: string[] = [];

    for (const id of targetIds) {
      try {
        await apiFetch(`/admin/enrollments/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus })
        });
        success += 1;
      } catch (err) {
        const code = rows.find((row) => row.id === id)?.section.course.code ?? "Unknown";
        const section = rows.find((row) => row.id === id)?.section.sectionCode ?? "";
        failed.push(`${code} ${section}`.trim());
        if (!error) {
          setError(err instanceof Error ? err.message : "Bulk update failed");
        }
      }
    }

    await load(selectedTermId || undefined);
    clearSelection();
    setBulkSaving(false);

    if (failed.length > 0) {
      setNotice(`Bulk update complete: ${success} succeeded, ${failed.length} failed.`);
      return;
    }
    setNotice(`Bulk update complete: ${success} enrollment(s) moved to ${nextStatus}.`);
  };

  // Reset page on filter changes
  useEffect(() => { setPage(1); }, [search, statusFilter, selectedTermId]);

  const selectedTerm = terms.find((t) => t.id === selectedTermId);

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Academic Records</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">Enrollments & Grades</h1>
            <p className="text-sm text-slate-600 md:text-base">
              Adjust enrollment status and publish final grades for completed sections.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">Total {rows.length}</span>
              <span className="campus-chip border-emerald-200 bg-emerald-50 text-emerald-700">
                Enrolled {statusCounts.get("ENROLLED") ?? 0}
              </span>
              <span className="campus-chip border-amber-200 bg-amber-50 text-amber-700">
                Waitlisted {statusCounts.get("WAITLISTED") ?? 0}
              </span>
              {(statusCounts.get("COMPLETED") ?? 0) > 0 && (
                <span className="campus-chip border-slate-300 bg-slate-100 text-slate-600">
                  Completed {statusCounts.get("COMPLETED")}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={rows.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50"
            >
              ↓ Export CSV
            </button>
            <button
              type="button"
              onClick={() => void load(selectedTermId || undefined)}
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
            >
              Refresh
            </button>
          </div>
        </div>
      </section>

      {/* Term selector + summary */}
      <section className="campus-card p-5 md:p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Filter by Term
            </label>
            <select
              className="campus-select"
              value={selectedTermId}
              onChange={(e) => {
                setSelectedTermId(e.target.value);
                setSearch("");
                setStatusFilter("");
                clearSelection();
              }}
            >
              <option value="">All Terms</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          {selectedTerm && (
            <div className="text-sm text-slate-500">
              <span className="font-medium text-slate-700">{selectedTerm.name}</span>
              {" · "}
              {new Date(selectedTerm.startDate).toLocaleDateString()} – {new Date(selectedTerm.endDate).toLocaleDateString()}
              {" · Drop by "}
              {new Date(selectedTerm.dropDeadline).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Status breakdown stats */}
        {rows.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatBadge label="Enrolled" count={statusCounts.get("ENROLLED") ?? 0} color="border-emerald-200 bg-emerald-50 text-emerald-800" />
            <StatBadge label="Waitlisted" count={statusCounts.get("WAITLISTED") ?? 0} color="border-amber-200 bg-amber-50 text-amber-800" />
            <StatBadge label="Pending" count={statusCounts.get("PENDING_APPROVAL") ?? 0} color="border-blue-200 bg-blue-50 text-blue-800" />
            <StatBadge label="Completed" count={statusCounts.get("COMPLETED") ?? 0} color="border-slate-200 bg-slate-50 text-slate-700" />
            <StatBadge label="Dropped" count={statusCounts.get("DROPPED") ?? 0} color="border-red-200 bg-red-50 text-red-700" />
            <StatBadge label="Total Cr." count={totalCredits} color="border-violet-200 bg-violet-50 text-violet-800" />
          </div>
        )}
      </section>

      <section className="campus-toolbar">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
            <input
              ref={searchRef}
              className="campus-input"
              placeholder="Student name, ID, course code, section…  [/]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="flex flex-col">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
            <select
              className="campus-select h-10"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={() => void bulkSetStatus("ENROLLED", ["PENDING_APPROVAL"])}
              disabled={bulkSaving || selectedVisibleIds.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkSaving ? <span className="size-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" /> : null}
              Batch Approve
            </button>
            <button
              type="button"
              onClick={() => void bulkSetStatus("DROPPED", ["ENROLLED", "PENDING_APPROVAL", "WAITLISTED"])}
              disabled={bulkSaving || selectedVisibleIds.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkSaving ? <span className="size-3.5 animate-spin rounded-full border-2 border-red-300 border-t-red-700" /> : null}
              Batch Drop
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedVisibleIds.length === 0}
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Showing {visibleRows.length} of {rows.length} · Selected: {selectedVisibleIds.length}
        </p>
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      <section className="campus-card overflow-hidden">
        <div className="max-h-[600px] overflow-auto rounded-3xl">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) => toggleSelectVisible(event.target.checked)}
                    className="size-4 accent-slate-900"
                    aria-label="Select all visible enrollments"
                  />
                </th>
                <th className="px-4 py-3 font-semibold text-slate-700">Student</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Course / Section</th>
                {!selectedTermId && (
                  <th className="px-4 py-3 font-semibold text-slate-700">Term</th>
                )}
                <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Final Grade</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Loading enrollments...
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No enrollment records found.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/60">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedById[row.id])}
                        onChange={(event) => toggleRow(row.id, event.target.checked)}
                        className="size-4 accent-slate-900"
                        aria-label={`Select enrollment ${row.id}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      <p className="font-medium">{row.student.studentProfile?.legalName || "-"}</p>
                      <p className="text-xs text-slate-500">{row.student.studentId || "No ID"}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <p className="font-medium">{row.section.course.code} · {row.section.sectionCode}</p>
                      <p className="text-xs text-slate-500">{row.section.course.title}</p>
                    </td>
                    {!selectedTermId && (
                      <td className="px-4 py-3 text-xs text-slate-500">{row.term?.name ?? "—"}</td>
                    )}
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[statusState[row.id] ?? row.status] ?? "bg-slate-100 text-slate-700"}`}>
                        {statusState[row.id] ?? row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        className="campus-input h-9 w-24"
                        placeholder="A, B+…"
                        value={gradeState[row.id] || ""}
                        onChange={(e) => setGradeState((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <select
                          className="campus-select h-8 text-xs"
                          value={statusState[row.id] || row.status}
                          onChange={(e) => setStatusState((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void updateStatus(row.id)}
                          disabled={savingStatusId === row.id}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          {savingStatusId === row.id ? (
                            <span className="size-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                          ) : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void updateGrade(row.id)}
                          disabled={savingGradeId === row.id || !(gradeState[row.id] || "").trim()}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                        >
                          {savingGradeId === row.id ? (
                            <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          ) : "Grade"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {visibleRows.length > PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 text-sm text-slate-600">
            <p>
              Showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, visibleRows.length)} of {visibleRows.length} records
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="inline-flex h-8 min-w-[4rem] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Prev
              </button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) pageNum = i + 1;
                else if (safePage <= 4) pageNum = i + 1;
                else if (safePage >= totalPages - 3) pageNum = totalPages - 6 + i;
                else pageNum = safePage - 3 + i;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setPage(pageNum)}
                    className={`inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border px-2.5 font-medium transition ${
                      pageNum === safePage
                        ? "border-primary bg-primary text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="inline-flex h-8 min-w-[4rem] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
