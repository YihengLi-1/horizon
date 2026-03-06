"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type Course = {
  id: string;
  code: string;
  title: string;
  credits: number;
  description?: string | null;
  prerequisiteLinks?: Array<{ prerequisiteCourse?: { id?: string; code?: string } }>;
};

type EditForm = {
  code: string;
  title: string;
  credits: number;
  description: string;
  prerequisiteCourseIds: string[];
};

const PAGE_SIZE = 50;

function getDept(code: string): string {
  const match = code.trim().toUpperCase().match(/^[A-Z]+/);
  return match?.[0] ?? "OTHER";
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [form, setForm] = useState({ code: "", title: "", credits: 3, description: "", prerequisiteCourseIds: [] as string[] });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterDept, setFilterDept] = useState("ALL");
  const [filterCredits, setFilterCredits] = useState("ALL");
  const [filterPrereq, setFilterPrereq] = useState("ALL"); // ALL | WITH | WITHOUT
  const [sortCol, setSortCol] = useState<"code" | "title" | "credits" | "prereqs">("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ code: "", title: "", credits: 3, description: "", prerequisiteCourseIds: [] });
  const [savingEdit, setSavingEdit] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<Course[]>("/admin/courses");
      setCourses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load courses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      setCreating(true);
      await apiFetch("/admin/courses", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          title: form.title,
          credits: Number(form.credits),
          description: form.description || null,
          prerequisiteCourseIds: form.prerequisiteCourseIds
        })
      });
      setForm({ code: "", title: "", credits: 3, description: "", prerequisiteCourseIds: [] });
      setNotice("Course created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (course: Course) => {
    setEditingId(course.id);
    setEditForm({
      code: course.code,
      title: course.title,
      credits: course.credits,
      description: course.description ?? "",
      prerequisiteCourseIds: (course.prerequisiteLinks ?? [])
        .map((link) => link.prerequisiteCourse?.id)
        .filter((id): id is string => Boolean(id))
    });
    setError("");
    setNotice("");
  };

  const cancelEdit = () => setEditingId(null);

  const onSaveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    setError("");
    setNotice("");
    try {
      setSavingEdit(true);
      await apiFetch(`/admin/courses/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          code: editForm.code,
          title: editForm.title,
          credits: Number(editForm.credits),
          description: editForm.description || null,
          prerequisiteCourseIds: editForm.prerequisiteCourseIds
        })
      });
      setEditingId(null);
      setNotice("Course updated successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingEdit(false);
    }
  };

  const onDelete = async (id: string, code: string) => {
    if (!confirm(`Delete course "${code}"? This cannot be undone.`)) return;
    try {
      setError("");
      setNotice("");
      await apiFetch(`/admin/courses/${id}`, { method: "DELETE" });
      setNotice(`Course "${code}" deleted.`);
      if (editingId === id) setEditingId(null);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      setError(message);
    }
  };

  const creditOptions = useMemo(
    () => Array.from(new Set(courses.map((c) => c.credits))).sort((a, b) => a - b),
    [courses]
  );

  const deptOptions = useMemo(
    () => Array.from(new Set(courses.map((c) => getDept(c.code)))).sort((a, b) => a.localeCompare(b)),
    [courses]
  );

  const stats = useMemo(() => {
    const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);
    const withPrereq   = courses.filter((c) => (c.prerequisiteLinks ?? []).length > 0).length;
    const byCredits    = creditOptions.map((cr) => ({ cr, count: courses.filter((c) => c.credits === cr).length }));
    return {
      total:      courses.length,
      avg:        courses.length > 0 ? (totalCredits / courses.length).toFixed(1) : "0.0",
      withPrereq,
      noPrereq:   courses.length - withPrereq,
      byCredits
    };
  }, [courses, creditOptions]);

  const visibleCourses = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let list = courses.filter((c) => {
      if (q && !`${c.code} ${c.title} ${c.description ?? ""}`.toLowerCase().includes(q)) return false;
      if (filterDept !== "ALL" && getDept(c.code) !== filterDept) return false;
      if (filterCredits !== "ALL" && c.credits !== Number(filterCredits)) return false;
      const hasPre = (c.prerequisiteLinks ?? []).length > 0;
      if (filterPrereq === "WITH"    && !hasPre) return false;
      if (filterPrereq === "WITHOUT" &&  hasPre) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortCol) {
        case "title":   return dir * a.title.localeCompare(b.title);
        case "credits": return dir * (a.credits - b.credits);
        case "prereqs": return dir * ((a.prerequisiteLinks?.length ?? 0) - (b.prerequisiteLinks?.length ?? 0));
        default:        return dir * a.code.localeCompare(b.code);
      }
    });

    return list;
  }, [courses, debouncedSearch, filterDept, filterCredits, filterPrereq, sortCol, sortDir]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, filterDept, filterCredits, filterPrereq, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(visibleCourses.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedCourses = visibleCourses.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportCsv = () => {
    const rows = [
      ["Code", "Title", "Credits", "Description", "Prerequisites"],
      ...visibleCourses.map((c) => [
        c.code,
        c.title,
        String(c.credits),
        c.description ?? "",
        (c.prerequisiteLinks ?? [])
          .map((link) => link.prerequisiteCourse?.code)
          .filter(Boolean)
          .join("; ")
      ])
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `courses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Catalog Management</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">Courses</h1>
            <p className="text-sm text-slate-600 md:text-base">
              Maintain course definitions, credit values, and prerequisite mappings for registration validation.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-emerald-300 bg-emerald-50 text-emerald-700">{stats.total} Courses</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-600">Avg {stats.avg} cr</span>
              {stats.withPrereq > 0 && (
                <span className="campus-chip border-blue-300 bg-blue-50 text-blue-700">{stats.withPrereq} with Prerequisites</span>
              )}
              {visibleCourses.length !== courses.length && (
                <span className="campus-chip border-amber-300 bg-amber-50 text-amber-700">{visibleCourses.length} visible</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={visibleCourses.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Courses</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.total}</p>
          <p className="text-[11px] text-slate-400">Avg {stats.avg} credits</p>
        </div>
        <div className="campus-kpi border-emerald-200 bg-emerald-50/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">No Prerequisites</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-900">{stats.noPrereq}</p>
          <p className="text-[11px] text-emerald-500">Open enrollment</p>
        </div>
        <div className="campus-kpi border-blue-200 bg-blue-50/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Has Prerequisites</p>
          <p className="mt-1 text-2xl font-semibold text-blue-900">{stats.withPrereq}</p>
          <p className="text-[11px] text-blue-500">Gated enrollment</p>
        </div>
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Credit Distribution</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {stats.byCredits.map(({ cr, count }) => (
              <span key={cr} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
                <span className="font-semibold">{cr}cr</span>
                <span className="text-slate-400">×{count}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="campus-card p-5 md:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">新增课程</h2>
          <button
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {showCreateForm ? "收起" : "展开"}
          </button>
        </div>
        {showCreateForm ? (
        <form className="grid gap-3 md:grid-cols-5" onSubmit={onCreate}>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Code</label>
            <input
              className="campus-input"
              placeholder="CS301"
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Title</label>
            <input
              className="campus-input"
              placeholder="Algorithms"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Credits</label>
            <input
              className="campus-input"
              type="number"
              min={1}
              value={form.credits}
              onChange={(e) => setForm((p) => ({ ...p, credits: Number(e.target.value) }))}
              required
            />
          </div>
          <div className="md:flex md:items-end">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Creating
                </>
              ) : (
                "Create course"
              )}
            </button>
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Description</label>
            <input
              className="campus-input"
              placeholder="Optional short catalog description"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Prerequisites</label>
            <select
              multiple
              className="campus-input min-h-[80px]"
              value={form.prerequisiteCourseIds}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                setForm((p) => ({ ...p, prerequisiteCourseIds: selected }));
              }}
            >
              {courses
                .filter((c) => c.code !== form.code)
                .sort((a, b) => a.code.localeCompare(b.code))
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
                ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">Hold Cmd/Ctrl to select multiple</p>
          </div>
        </form>
        ) : null}
      </section>

      {editingId ? (
        <section className="campus-card border-blue-200 bg-blue-50/60 p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-blue-900">Editing: {editForm.code}</h2>
            <button type="button" onClick={cancelEdit} className="text-sm font-medium text-blue-700 underline underline-offset-2">
              Cancel
            </button>
          </div>
          <form className="grid gap-3 md:grid-cols-5" onSubmit={onSaveEdit}>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Code</label>
              <input
                className="campus-input"
                value={editForm.code}
                onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value }))}
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Title</label>
              <input
                className="campus-input"
                value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Credits</label>
              <input
                className="campus-input"
                type="number"
                min={1}
                value={editForm.credits}
                onChange={(e) => setEditForm((p) => ({ ...p, credits: Number(e.target.value) }))}
                required
              />
            </div>
            <div className="md:flex md:items-end">
              <button
                type="submit"
                disabled={savingEdit}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingEdit ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Saving
                  </>
                ) : (
                  "Save changes"
                )}
              </button>
            </div>
            <div className="md:col-span-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Description</label>
              <input
                className="campus-input"
                placeholder="Optional short catalog description"
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Prerequisites</label>
              <select
                multiple
                className="campus-input min-h-[80px]"
                value={editForm.prerequisiteCourseIds}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                  setEditForm((p) => ({ ...p, prerequisiteCourseIds: selected }));
                }}
              >
                {courses
                  .filter((c) => c.id !== editingId)
                  .sort((a, b) => a.code.localeCompare(b.code))
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
                  ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">Hold Cmd/Ctrl to select multiple</p>
            </div>
          </form>
        </section>
      ) : null}

      <section className="campus-toolbar">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
            <input
              ref={searchRef}
              className="campus-input"
              placeholder="Code, title, description…  [/]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Dept</span>
            <select className="campus-select" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
              <option value="ALL">All depts</option>
              {deptOptions.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Credits</span>
            <select className="campus-select" value={filterCredits} onChange={(e) => setFilterCredits(e.target.value)}>
              <option value="ALL">All credits</option>
              {creditOptions.map((cr) => <option key={cr} value={cr}>{cr} cr</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Prerequisites</span>
            <select className="campus-select" value={filterPrereq} onChange={(e) => setFilterPrereq(e.target.value)}>
              <option value="ALL">All courses</option>
              <option value="WITHOUT">No prerequisites</option>
              <option value="WITH">Has prerequisites</option>
            </select>
          </label>
        </div>
        {(search || filterDept !== "ALL" || filterCredits !== "ALL" || filterPrereq !== "ALL") ? (
          <div className="mt-2 flex items-center gap-2">
            <p className="text-xs text-slate-500">{visibleCourses.length} of {courses.length} shown</p>
            <button
              type="button"
              onClick={() => { setSearch(""); setDebouncedSearch(""); setFilterDept("ALL"); setFilterCredits("ALL"); setFilterPrereq("ALL"); }}
              className="text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      <section className="campus-card overflow-hidden">
        <div className="max-h-[560px] overflow-auto rounded-3xl">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                {(["code", "title", "credits", "prereqs"] as const).map((col) => (
                  <th key={col} className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggleSort(col)}
                      className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors ${sortCol === col ? "text-slate-900" : "text-slate-400 hover:text-slate-700"}`}
                    >
                      {{ code: "Code", title: "Title", credits: "Credits", prereqs: "Prerequisites" }[col]}
                      <span className="text-[9px] leading-none">
                        {sortCol === col ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </button>
                  </th>
                ))}
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Loading courses...
                  </td>
                </tr>
              ) : visibleCourses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <p className="text-3xl">📚</p>
                    <p className="mt-2 text-sm font-medium text-slate-600">
                      {courses.length === 0 ? "No courses yet" : "No courses match your filters"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {courses.length === 0 ? "Use the form above to create the first course." : "Try clearing your search or filter."}
                    </p>
                  </td>
                </tr>
              ) : (
                pagedCourses.map((course) => (
                  <tr
                    key={course.id}
                    className={`border-b border-slate-100 hover:bg-slate-100/60 ${editingId === course.id ? "bg-blue-50/40 outline outline-1 outline-blue-200" : "odd:bg-white even:bg-slate-50/40"}`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-semibold text-slate-900">{course.code}</span>
                    </td>
                    <td
                      className="px-4 py-3 text-slate-700"
                      onDoubleClick={() => startEdit(course)}
                      title="Double-click to edit title"
                    >
                      <p className="font-medium">{course.title}</p>
                      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                        {getDept(course.code)}
                      </p>
                      {(course.prerequisiteLinks ?? []).length > 0 ? (
                        <p className="mt-1 text-xs text-slate-400">
                          先修: {(course.prerequisiteLinks ?? [])
                            .map((item) => item.prerequisiteCourse?.code)
                            .filter((code): code is string => Boolean(code))
                            .join(", ")}
                        </p>
                      ) : null}
                      {course.description ? <p className="mt-0.5 text-xs text-slate-400 line-clamp-1">{course.description}</p> : null}
                    </td>
                    <td
                      className="px-4 py-3"
                      onDoubleClick={() => startEdit(course)}
                      title="Double-click to edit credits"
                    >
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                        course.credits >= 4
                          ? "border-violet-200 bg-violet-50 text-violet-700"
                          : course.credits === 3
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      }`}>
                        {course.credits} cr
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const prereqCodes = (course.prerequisiteLinks ?? [])
                          .map((item) => item.prerequisiteCourse?.code)
                          .filter((code): code is string => Boolean(code));
                        if (prereqCodes.length === 0) {
                          return <span className="text-slate-300">No prereqs</span>;
                        }
                        return (
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            {prereqCodes.map((code, index) => (
                              <span key={code}>
                                {index > 0 ? <span className="mx-1 text-slate-300">→</span> : null}
                                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                                  {code}
                                </span>
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => editingId === course.id ? cancelEdit() : startEdit(course)}
                          className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          {editingId === course.id ? "Cancel" : "Edit"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(course.id, course.code)}
                          className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                        >
                          Delete
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
        {visibleCourses.length > PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 text-sm text-slate-600">
            <p>
              Showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, visibleCourses.length)} of {visibleCourses.length} courses
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
