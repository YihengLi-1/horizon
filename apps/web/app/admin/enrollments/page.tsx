"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Enrollment = {
  id: string;
  status: string;
  finalGrade: string | null;
  student: {
    studentId: string | null;
    studentProfile?: { legalName?: string };
  };
  section: {
    sectionCode: string;
    course: { code: string; title: string };
  };
};

const STATUS_OPTIONS = ["ENROLLED", "WAITLISTED", "PENDING_APPROVAL", "DROPPED", "COMPLETED"];

export default function EnrollmentsPage() {
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

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<Enrollment[]>("/admin/enrollments");
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
    void load();
  }, []);

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
      await load();
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
      await load();
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

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
      const text = `${row.student.studentProfile?.legalName ?? ""} ${row.student.studentId ?? ""} ${row.section.course.code} ${row.section.sectionCode} ${row.status}`.toLowerCase();
      return text.includes(query);
    });
  }, [rows, search]);

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

    await load();
    clearSelection();
    setBulkSaving(false);

    if (failed.length > 0) {
      setNotice(`Bulk update complete: ${success} succeeded, ${failed.length} failed.`);
      return;
    }
    setNotice(`Bulk update complete: ${success} enrollment(s) moved to ${nextStatus}.`);
  };

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Academic Records</p>
            <h1 className="font-heading text-4xl font-bold text-white md:text-5xl">Enrollments & Grades</h1>
            <p className="text-sm text-blue-100/90 md:text-base">
              Adjust enrollment status and publish final grades for completed sections.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-blue-200/30 bg-white/10 text-blue-50">Total {rows.length}</span>
              <span className="campus-chip border-blue-200/30 bg-white/10 text-blue-50">
                ENROLLED {statusCounts.get("ENROLLED") ?? 0}
              </span>
              <span className="campus-chip border-blue-200/30 bg-white/10 text-blue-50">
                WAITLISTED {statusCounts.get("WAITLISTED") ?? 0}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center rounded-xl border border-white/40 bg-white/95 px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
          >
            Refresh
          </button>
        </div>
      </section>

      <section className="campus-toolbar">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
            <input
              className="campus-input"
              placeholder="Student, course code, section, status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
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
              Clear selection
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Selected in current filter: {selectedVisibleIds.length}
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
                <th className="px-4 py-3 font-semibold text-slate-700">Course</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Final Grade</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading enrollments...
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No enrollment records found.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
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
                      {row.section.course.code} - {row.section.sectionCode}
                      <p className="text-xs text-slate-500">{row.section.course.title}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="campus-select h-9"
                        value={statusState[row.id] || row.status}
                        onChange={(e) => setStatusState((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        className="campus-input h-9"
                        placeholder="A, B+, C..."
                        value={gradeState[row.id] || ""}
                        onChange={(e) => setGradeState((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void updateStatus(row.id)}
                          disabled={savingStatusId === row.id}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          {savingStatusId === row.id ? (
                            <>
                              <span className="size-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                              Saving
                            </>
                          ) : (
                            "Save status"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => void updateGrade(row.id)}
                          disabled={savingGradeId === row.id || !(gradeState[row.id] || "").trim()}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                        >
                          {savingGradeId === row.id ? (
                            <>
                              <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                              Saving
                            </>
                          ) : (
                            "Save grade"
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
