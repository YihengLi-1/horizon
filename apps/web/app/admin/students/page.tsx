"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Student = {
  id: string;
  email: string;
  studentId: string;
  studentProfile?: {
    legalName?: string;
    programMajor?: string;
    enrollmentStatus?: string;
    academicStatus?: string;
  };
};

type EditForm = {
  email: string;
  studentId: string;
  legalName: string;
  programMajor: string;
  enrollmentStatus: string;
  academicStatus: string;
};

const ENROLLMENT_STATUSES = ["New", "Continuing", "Returning", "Graduated", "Withdrawn"];
const ACADEMIC_STATUSES = ["Active", "Probation", "Suspended", "Graduated"];
const PAGE_SIZE = 50;

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState({
    legalName: "",
    studentId: "",
    email: "",
    password: "Student123!",
    role: "STUDENT"
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    email: "", studentId: "", legalName: "", programMajor: "",
    enrollmentStatus: "New", academicStatus: "Active"
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const loadStudents = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<Student[]>("/students");
      setStudents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStudents();
  }, []);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      setCreating(true);
      await apiFetch("/students", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setForm({ legalName: "", studentId: "", email: "", password: "Student123!", role: "STUDENT" });
      setNotice("Student created.");
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (student: Student) => {
    setEditingId(student.id);
    setEditForm({
      email: student.email,
      studentId: student.studentId,
      legalName: student.studentProfile?.legalName ?? "",
      programMajor: student.studentProfile?.programMajor ?? "",
      enrollmentStatus: student.studentProfile?.enrollmentStatus ?? "New",
      academicStatus: student.studentProfile?.academicStatus ?? "Active"
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
      await apiFetch(`/students/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          email: editForm.email,
          studentId: editForm.studentId,
          legalName: editForm.legalName,
          programMajor: editForm.programMajor,
          enrollmentStatus: editForm.enrollmentStatus,
          academicStatus: editForm.academicStatus
        })
      });
      setEditingId(null);
      setNotice("Student updated.");
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingEdit(false);
    }
  };

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Delete student "${name}"? This cannot be undone.`)) return;
    try {
      setError("");
      setNotice("");
      await apiFetch(`/students/${id}`, { method: "DELETE" });
      setNotice(`Student "${name}" deleted.`);
      if (editingId === id) setEditingId(null);
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => {
      const text = `${student.studentProfile?.legalName ?? ""} ${student.studentId ?? ""} ${student.email ?? ""} ${student.studentProfile?.programMajor ?? ""}`.toLowerCase();
      return text.includes(query);
    });
  }, [students, search]);

  // Reset page when search changes
  useEffect(() => { setPage(1); }, [search]);

  const totalPages = Math.max(1, Math.ceil(visibleStudents.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedStudents = visibleStudents.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportCsv = () => {
    const rows = [
      ["Legal Name", "Student ID", "Email", "Major", "Enrollment Status", "Academic Status"],
      ...visibleStudents.map((s) => [
        s.studentProfile?.legalName ?? "",
        s.studentId,
        s.email,
        s.studentProfile?.programMajor ?? "",
        s.studentProfile?.enrollmentStatus ?? "",
        s.studentProfile?.academicStatus ?? ""
      ])
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `students-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Student Records</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">Students</h1>
            <p className="text-sm text-slate-600 md:text-base">
              Manage core student accounts used for portal access and registration operations.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{students.length} total</span>
              {search ? <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{visibleStudents.length} visible</span> : null}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={visibleStudents.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void loadStudents()}
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
            >
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="campus-card p-5 md:p-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Create Student Account</h2>
        <form className="grid gap-3 md:grid-cols-5" onSubmit={onCreate}>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Legal name</label>
            <input
              className="campus-input"
              placeholder="Alice Chen"
              value={form.legalName}
              onChange={(e) => setForm((p) => ({ ...p, legalName: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Student ID</label>
            <input
              className="campus-input"
              placeholder="S4001"
              value={form.studentId}
              onChange={(e) => setForm((p) => ({ ...p, studentId: e.target.value }))}
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
            <input
              className="campus-input"
              type="email"
              placeholder="student@example.edu"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Initial password</label>
            <input
              className="campus-input"
              type="password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              required
            />
          </div>
          <div className="md:col-span-5 md:flex md:justify-end">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Creating
                </>
              ) : (
                "Add student"
              )}
            </button>
          </div>
        </form>
      </section>

      {editingId ? (
        <section className="campus-card border-blue-200 bg-blue-50/60 p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-blue-900">Editing: {editForm.legalName || editForm.email}</h2>
            <button type="button" onClick={cancelEdit} className="text-sm font-medium text-blue-700 underline underline-offset-2">
              Cancel
            </button>
          </div>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={onSaveEdit}>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Legal name</label>
              <input
                className="campus-input"
                value={editForm.legalName}
                onChange={(e) => setEditForm((p) => ({ ...p, legalName: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Student ID</label>
              <input
                className="campus-input"
                value={editForm.studentId}
                onChange={(e) => setEditForm((p) => ({ ...p, studentId: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
              <input
                className="campus-input"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Program / Major</label>
              <input
                className="campus-input"
                placeholder="Computer Science"
                value={editForm.programMajor}
                onChange={(e) => setEditForm((p) => ({ ...p, programMajor: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Enrollment status</label>
              <select
                className="campus-select"
                value={editForm.enrollmentStatus}
                onChange={(e) => setEditForm((p) => ({ ...p, enrollmentStatus: e.target.value }))}
              >
                {ENROLLMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Academic status</label>
              <select
                className="campus-select"
                value={editForm.academicStatus}
                onChange={(e) => setEditForm((p) => ({ ...p, academicStatus: e.target.value }))}
              >
                {ACADEMIC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="md:col-span-3 md:flex md:justify-end">
              <button
                type="submit"
                disabled={savingEdit}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
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
          </form>
        </section>
      ) : null}

      <section className="campus-toolbar">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
          <input
            className="campus-input"
            placeholder="Name, Student ID, email, major..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
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
      {notice ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      ) : null}

      <section className="campus-card overflow-hidden">
        <p className="px-4 pt-4 text-xs text-slate-500 md:hidden">Tip: Swipe horizontally to view all columns.</p>
        <div className="max-h-[560px] overflow-auto rounded-3xl">
          <table className="min-w-[760px] w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">Name</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Student ID</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Email</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Major</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading students...
                  </td>
                </tr>
              ) : visibleStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No students found.
                  </td>
                </tr>
              ) : (
                pagedStudents.map((student) => (
                  <tr
                    key={student.id}
                    className={`border-b border-slate-100 hover:bg-slate-100/60 ${editingId === student.id ? "bg-blue-50/40 outline outline-1 outline-blue-200" : "odd:bg-white even:bg-slate-50/40"}`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{student.studentProfile?.legalName || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{student.studentId}</td>
                    <td className="px-4 py-3 text-slate-700">{student.email}</td>
                    <td className="px-4 py-3 text-slate-700">{student.studentProfile?.programMajor || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <span className="block text-xs text-slate-600">{student.studentProfile?.enrollmentStatus || "-"}</span>
                        <span className={`block text-xs font-semibold ${student.studentProfile?.academicStatus === "Probation" ? "text-amber-700" : student.studentProfile?.academicStatus === "Suspended" ? "text-red-700" : "text-emerald-700"}`}>
                          {student.studentProfile?.academicStatus || "-"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => editingId === student.id ? cancelEdit() : startEdit(student)}
                          className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          {editingId === student.id ? "Cancel" : "Edit"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(student.id, student.studentProfile?.legalName ?? student.email)}
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
        {visibleStudents.length > PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 text-sm text-slate-600">
            <p>
              Showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, visibleStudents.length)} of {visibleStudents.length} students
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
