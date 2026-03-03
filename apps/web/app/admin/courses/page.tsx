"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Course = {
  id: string;
  code: string;
  title: string;
  credits: number;
  prerequisiteLinks?: Array<{ prerequisiteCourse?: { code?: string } }>;
};

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [form, setForm] = useState({ code: "", title: "", credits: 3, description: "", prerequisiteCourseIds: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

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
            ? form.prerequisiteCourseIds
                .split(",")
                .map((id) => id.trim())
                .filter(Boolean)
            : []
        })
      });
      setForm({ code: "", title: "", credits: 3, description: "", prerequisiteCourseIds: "" });
      setNotice("Course created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete course?")) return;
    try {
      setError("");
      setNotice("");
      await apiFetch(`/admin/courses/${id}`, { method: "DELETE" });
      setNotice("Course deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const stats = useMemo(() => {
    const totalCredits = courses.reduce((sum, course) => sum + course.credits, 0);
    return { total: courses.length, avg: courses.length > 0 ? (totalCredits / courses.length).toFixed(1) : "0.0" };
  }, [courses]);

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
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{stats.total} course(s)</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">Avg credits {stats.avg}</span>
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

      <section className="campus-card p-5 md:p-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Create New Course</h2>
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
          <div className="md:col-span-1 md:flex md:items-end">
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
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Prerequisite course IDs</label>
            <input
              className="campus-input"
              placeholder="comma separated IDs"
              value={form.prerequisiteCourseIds}
              onChange={(e) => setForm((p) => ({ ...p, prerequisiteCourseIds: e.target.value }))}
            />
          </div>
        </form>
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      <section className="campus-card overflow-hidden">
        <div className="max-h-[560px] overflow-auto rounded-3xl">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">Code</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Title</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Credits</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Prerequisites</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Loading courses...
                  </td>
                </tr>
              ) : courses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No courses found.
                  </td>
                </tr>
              ) : (
                courses.map((course) => (
                  <tr key={course.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/60">
                    <td className="px-4 py-3 font-medium text-slate-900">{course.code}</td>
                    <td className="px-4 py-3 text-slate-700">{course.title}</td>
                    <td className="px-4 py-3 text-slate-700">{course.credits}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {(course.prerequisiteLinks ?? [])
                        .map((item) => item.prerequisiteCourse?.code)
                        .filter((code): code is string => Boolean(code))
                        .join(", ") || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onDelete(course.id)}
                        className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                      >
                        Delete
                      </button>
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
