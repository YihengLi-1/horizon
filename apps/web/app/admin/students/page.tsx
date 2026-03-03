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
  };
};

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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

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

  const onDelete = async (id: string) => {
    if (!confirm("Delete student?")) return;
    try {
      setError("");
      setNotice("");
      await apiFetch(`/students/${id}`, { method: "DELETE" });
      setNotice("Student deleted.");
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
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{visibleStudents.length} visible</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadStudents()}
            className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
          >
            Refresh
          </button>
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

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      <section className="campus-card overflow-hidden">
        <div className="max-h-[560px] overflow-auto rounded-3xl">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">Name</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Student ID</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Email</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Major</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Loading students...
                  </td>
                </tr>
              ) : visibleStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No students found.
                  </td>
                </tr>
              ) : (
                visibleStudents.map((student) => (
                  <tr key={student.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/60">
                    <td className="px-4 py-3 font-medium text-slate-900">{student.studentProfile?.legalName || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{student.studentId}</td>
                    <td className="px-4 py-3 text-slate-700">{student.email}</td>
                    <td className="px-4 py-3 text-slate-700">{student.studentProfile?.programMajor || "-"}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onDelete(student.id)}
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
