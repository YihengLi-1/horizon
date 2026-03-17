"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type Student = {
  id: string;
  email: string;
  studentId: string;
  gpa?: number | null;
  role?: string;
  lastLoginAt?: string | null;
  loginAttempts?: number;
  lockedUntil?: string | null;
  studentProfile?: {
    legalName?: string;
    programMajor?: string;
    enrollmentStatus?: string;
    academicStatus?: string;
  };
  enrollments?: Array<{
    id: string;
    status: string;
    finalGrade?: string | null;
    section?: {
      course?: {
        code?: string;
      };
    };
  }>;
};

type StudentListResponse =
  | Student[]
  | {
      items?: Student[];
      data?: Student[];
      total?: number;
      page?: number;
      pageSize?: number;
      totalPages?: number;
    };

type EditForm = {
  email: string;
  studentId: string;
  legalName: string;
  programMajor: string;
  enrollmentStatus: string;
  academicStatus: string;
};

type NotificationLogItem = {
  id: number;
  type: string;
  subject: string;
  sentAt: string;
};

type StudentNoteItem = {
  id: string;
  content: string;
  flag: string | null;
  createdAt: string;
  admin: { email: string };
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    email: "", studentId: "", legalName: "", programMajor: "",
    enrollmentStatus: "New", academicStatus: "Active"
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [roleSaving, setRoleSaving] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "grades" | "security" | "notifications" | "notes" | "tags">("profile");
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [notificationLog, setNotificationLog] = useState<NotificationLogItem[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [studentNotes, setStudentNotes] = useState<StudentNoteItem[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [studentTagsMap, setStudentTagsMap] = useState<Record<string, string[]>>({});
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [detailTags, setDetailTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [savingTags, setSavingTags] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteFlag, setNewNoteFlag] = useState("");

  const loadTagsForStudents = async (list: Student[]) => {
    const entries = await Promise.all(
      list.map(async (student) => {
        try {
          const result = await apiFetch<{ studentId: string; tags: string[] }>(`/admin/students/${student.id}/tags`);
          return [student.id, result.tags ?? []] as const;
        } catch {
          return [student.id, []] as const;
        }
      })
    );
    setStudentTagsMap(Object.fromEntries(entries));
  };

  const loadStudents = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<StudentListResponse>("/students");
      const list = Array.isArray(data) ? data : data.items ?? data.data ?? [];
      setStudents(list);
      void loadTagsForStudents(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStudents();
  }, []);

  useEffect(() => {
    void apiFetch<string[]>("/admin/student-tags/available")
      .then((data) => setAvailableTags(data ?? []))
      .catch(() => setAvailableTags([]));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setLeaderboardOpen(window.localStorage.getItem("admin_gpa_open") === "true");
  }, []);

  useEffect(() => {
    if (activeTab !== "notifications" || !detailStudent) return;
    let alive = true;
    setNotificationLoading(true);
    void apiFetch<{ data?: NotificationLogItem[] } | NotificationLogItem[]>(
      `/admin/notification-log?userId=${encodeURIComponent(detailStudent.id)}`
    )
      .then((payload) => {
        if (!alive) return;
        const rows = Array.isArray(payload) ? payload : payload.data ?? [];
        setNotificationLog(rows.slice(0, 20));
      })
      .catch(() => {
        if (alive) setNotificationLog([]);
      })
      .finally(() => {
        if (alive) setNotificationLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [activeTab, detailStudent]);

  // Load student notes
  useEffect(() => {
    if (activeTab !== "notes" || !detailStudent) return;
    let alive = true;
    setNotesLoading(true);
    void apiFetch<StudentNoteItem[]>(`/admin/students/${detailStudent.id}/notes`)
      .then((data) => { if (alive) setStudentNotes(data); })
      .catch(() => { if (alive) setStudentNotes([]); })
      .finally(() => { if (alive) setNotesLoading(false); });
    return () => { alive = false; };
  }, [activeTab, detailStudent]);

  useEffect(() => {
    if (activeTab !== "tags" || !detailStudent) return;
    let alive = true;
    setTagsLoading(true);
    void apiFetch<{ studentId: string; tags: string[] }>(`/admin/students/${detailStudent.id}/tags`)
      .then((data) => {
        if (!alive) return;
        setDetailTags(data.tags ?? []);
      })
      .catch(() => {
        if (alive) setDetailTags([]);
      })
      .finally(() => {
        if (alive) setTagsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [activeTab, detailStudent]);

  const addNote = async () => {
    if (!detailStudent || !newNoteContent.trim()) return;
    try {
      const note = await apiFetch<StudentNoteItem>(`/admin/students/${detailStudent.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: newNoteContent.trim(), flag: newNoteFlag || undefined })
      });
      setStudentNotes((prev) => [note, ...prev]);
      setNewNoteContent("");
      setNewNoteFlag("");
    } catch { /* ignore */ }
  };

  const deleteNote = async (noteId: string) => {
    if (!detailStudent) return;
    try {
      await apiFetch(`/admin/students/${detailStudent.id}/notes/${noteId}`, { method: "DELETE" });
      setStudentNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch { /* ignore */ }
  };

  const persistTags = async (nextTags: string[]) => {
    if (!detailStudent) return;
    try {
      setSavingTags(true);
      const result = await apiFetch<{ studentId: string; tags: string[] }>(`/admin/students/${detailStudent.id}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: nextTags })
      });
      setDetailTags(result.tags ?? []);
      setStudentTagsMap((prev) => ({ ...prev, [detailStudent.id]: result.tags ?? [] }));
      setAvailableTags((prev) => [...new Set([...prev, ...(result.tags ?? [])])].sort((a, b) => a.localeCompare(b)));
      setTagDraft("");
      setNotice("Student tags updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tags");
    } finally {
      setSavingTags(false);
    }
  };

  const addTag = async () => {
    const next = tagDraft.trim();
    if (!next || detailTags.includes(next)) return;
    await persistTags([...detailTags, next]);
  };

  const removeTag = async (tag: string) => {
    await persistTags(detailTags.filter((item) => item !== tag));
  };

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
      setSavingId(editingId);
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
      setSavingId(null);
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

  const openDetails = async (id: string) => {
    try {
      setDetailLoadingId(id);
      setActiveTab("profile");
      setStudentNotes([]);
      setDetailTags(studentTagsMap[id] ?? []);
      setTagDraft("");
      setNewNoteContent("");
      setNewNoteFlag("");
      const [student, loginHistory] = await Promise.all([
        apiFetch<Student>(`/students/${id}`),
        apiFetch<Pick<Student, "lastLoginAt" | "loginAttempts" | "lockedUntil" | "role">>(`/admin/users/${id}/login-history`)
      ]);
      setDetailStudent({ ...student, ...loginHistory });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load student details");
    } finally {
      setDetailLoadingId(null);
    }
  };

  const updateRole = async (role: "STUDENT" | "ADMIN") => {
    if (!detailStudent) return;
    try {
      setRoleSaving(true);
      setError("");
      setNotice("");
      await apiFetch(`/admin/users/${detailStudent.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role })
      });
      setDetailStudent((prev) => (prev ? { ...prev, role } : prev));
      setNotice(`Role updated to ${role}.`);
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setRoleSaving(false);
    }
  };

  const unlockAccount = async () => {
    if (!detailStudent) return;
    try {
      setUnlocking(true);
      setError("");
      setNotice("");
      await apiFetch("/auth/unlock-account", {
        method: "POST",
        body: JSON.stringify({ userId: detailStudent.id })
      });
      setDetailStudent((prev) =>
        prev
          ? {
              ...prev,
              loginAttempts: 0,
              lockedUntil: null
            }
          : prev
      );
      setNotice("Account unlocked.");
      await loadStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlock account");
    } finally {
      setUnlocking(false);
    }
  };

  const [filterAcademic, setFilterAcademic] = useState("");
  const [filterEnrollment, setFilterEnrollment] = useState("");

  const studentStats = useMemo(() => {
    const active = students.filter((s) => s.studentProfile?.academicStatus === "Active").length;
    const probation = students.filter((s) => s.studentProfile?.academicStatus === "Probation").length;
    const suspended = students.filter((s) => s.studentProfile?.academicStatus === "Suspended").length;
    const graduated = students.filter((s) => s.studentProfile?.academicStatus === "Graduated").length;
    return { active, probation, suspended, graduated };
  }, [students]);

  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((student) => {
      if (query) {
        const text = `${student.studentProfile?.legalName ?? ""} ${student.studentId ?? ""} ${student.email ?? ""} ${student.studentProfile?.programMajor ?? ""}`.toLowerCase();
        if (!text.includes(query)) return false;
      }
      if (filterAcademic && student.studentProfile?.academicStatus !== filterAcademic) return false;
      if (filterEnrollment && student.studentProfile?.enrollmentStatus !== filterEnrollment) return false;
      return true;
    });
  }, [students, search, filterAcademic, filterEnrollment]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, filterAcademic, filterEnrollment]);

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

  const topStudents = useMemo(
    () =>
      [...(students ?? [])]
        .filter((student) => student.gpa != null)
        .sort((a, b) => (b.gpa ?? 0) - (a.gpa ?? 0))
        .slice(0, 5),
    [students]
  );
  const detailLocked =
    detailStudent?.lockedUntil != null && new Date(detailStudent.lockedUntil).getTime() > Date.now();

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Student Records</p>
            <h1 className="campus-title">Students</h1>
            <p className="text-sm text-slate-600 md:text-base">
              Manage core student accounts used for portal access and registration operations.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip chip-blue">{students.length} total</span>
              {search ? <span className="campus-chip chip-purple">{visibleStudents.length} visible</span> : null}
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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">Total Students</p>
          <p className="campus-kpi-value">{students.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label text-emerald-700">Active</p>
          <p className="campus-kpi-value text-emerald-700">{studentStats.active}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label text-amber-700">On Probation</p>
          <p className="campus-kpi-value text-amber-700">{studentStats.probation}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label text-red-700">Suspended</p>
          <p className="campus-kpi-value text-red-700">{studentStats.suspended}</p>
        </div>
      </section>

      <details
        className="campus-card p-4"
        open={leaderboardOpen}
        onToggle={(event) => {
          const nextOpen = (event.currentTarget as HTMLDetailsElement).open;
          setLeaderboardOpen(nextOpen);
          window.localStorage.setItem("admin_gpa_open", String(nextOpen));
        }}
      >
        <summary className="cursor-pointer select-none text-sm font-semibold text-slate-700">🏆 Top 5 by GPA</summary>
        <div className="mt-3 space-y-2">
          {topStudents.length === 0 ? (
            <p className="text-sm text-slate-400">No GPA data available.</p>
          ) : (
            topStudents.map((student, index) => (
              <div key={student.id} className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                    index === 0 ? "bg-amber-400" : index === 1 ? "bg-slate-400" : index === 2 ? "bg-orange-600" : "bg-slate-300"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-slate-700">
                  {student.studentProfile?.legalName ?? student.email}
                </span>
                <span
                  className={`text-sm font-bold ${
                    (student.gpa ?? 0) >= 3.7 ? "text-emerald-600" : (student.gpa ?? 0) >= 3 ? "text-blue-600" : "text-amber-600"
                  }`}
                >
                  {student.gpa?.toFixed(2)}
                </span>
              </div>
            ))
          )}
        </div>
      </details>

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
                disabled={savingId === editingId}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingId === editingId ? (
                  <>
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                    Save
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
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
            <input
              ref={searchRef}
              className="campus-input"
              placeholder="Name, Student ID, email, major…  [/]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Academic Status</span>
            <select
              className="campus-select"
              value={filterAcademic}
              onChange={(e) => setFilterAcademic(e.target.value)}
            >
              <option value="">All statuses</option>
              {ACADEMIC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Enrollment Status</span>
            <select
              className="campus-select"
              value={filterEnrollment}
              onChange={(e) => setFilterEnrollment(e.target.value)}
            >
              <option value="">All statuses</option>
              {ENROLLMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          {(search || filterAcademic || filterEnrollment) ? (
            <button
              type="button"
              onClick={() => { setSearch(""); setFilterAcademic(""); setFilterEnrollment(""); }}
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Clear
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Showing {visibleStudents.length} of {students.length} students
          {visibleStudents.length !== pagedStudents.length ? ` (page ${safePage} of ${totalPages})` : ""}
        </p>
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
        <div className="overflow-x-auto -mx-4 px-4">
        <div className="max-h-[560px] overflow-auto rounded-3xl">
          <table role="grid" aria-label="学生列表" className="campus-table hidden min-w-[760px] md:table">
            <thead className="sticky top-0 z-10">
              <tr role="row">
                <th scope="col">Name</th>
                <th scope="col">Student ID</th>
                <th scope="col">Email</th>
                <th scope="col">Major</th>
                <th scope="col">Tags</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Loading students...
                  </td>
                </tr>
              ) : visibleStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No students found.
                  </td>
                </tr>
              ) : (
                pagedStudents.map((student) => (
                  <tr
                    role="row"
                    key={student.id}
                    className={`border-b border-slate-100 hover:bg-slate-100/60 ${editingId === student.id ? "bg-blue-50/40 outline outline-1 outline-blue-200" : "odd:bg-white even:bg-slate-50/40"}`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{student.studentProfile?.legalName || "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{student.studentId}</td>
                    <td className="px-4 py-3 text-slate-700">{student.email}</td>
                    <td className="px-4 py-3 text-slate-700">{student.studentProfile?.programMajor || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(studentTagsMap[student.id] ?? []).slice(0, 3).map((tag) => (
                          <span key={tag} className="campus-chip chip-purple text-[11px]">
                            {tag}
                          </span>
                        ))}
                        {(studentTagsMap[student.id] ?? []).length > 3 ? (
                          <span className="campus-chip chip-blue text-[11px]">
                            +{(studentTagsMap[student.id] ?? []).length - 3}
                          </span>
                        ) : null}
                        {(studentTagsMap[student.id] ?? []).length === 0 ? <span className="text-xs text-slate-400">—</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <span className="block text-xs text-slate-600">{student.studentProfile?.enrollmentStatus || "-"}</span>
                        {student.studentProfile?.academicStatus ? (
                          <span className={`campus-chip text-[11px] ${
                            student.studentProfile.academicStatus === "Probation" ? "chip-amber"
                            : student.studentProfile.academicStatus === "Suspended" ? "chip-red"
                            : student.studentProfile.academicStatus === "Graduated" ? "chip-purple"
                            : "chip-emerald"
                          }`}>
                            {student.studentProfile.academicStatus}
                          </span>
                        ) : <span className="text-xs text-slate-400">-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={detailLoadingId === student.id}
                          onClick={() => void openDetails(student.id)}
                          className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          {detailLoadingId === student.id ? "Loading…" : "Details"}
                        </button>
                        <button
                          type="button"
                          disabled={savingId === student.id}
                          onClick={() => editingId === student.id ? cancelEdit() : startEdit(student)}
                          className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          {savingId === student.id ? (
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                          ) : editingId === student.id ? "Cancel" : "Edit"}
                        </button>
                        <button
                          type="button"
                          disabled={savingId === student.id}
                          onClick={() => onDelete(student.id, student.studentProfile?.legalName ?? student.email)}
                          className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
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
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {loading ? (
            <div className="campus-card p-4 text-sm text-slate-500">Loading students...</div>
          ) : visibleStudents.length === 0 ? (
            <div className="campus-card p-4 text-sm text-slate-500">No students found.</div>
          ) : (
            pagedStudents.map((student) => (
              <div key={student.id} className="campus-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {student.studentProfile?.legalName ?? "—"}
                    </p>
                    <p className="break-all text-xs text-slate-500">{student.email}</p>
                    <p className="mt-1 font-mono text-xs text-slate-400">{student.studentId ?? "—"}</p>
                  </div>
                  <span
                    className={`campus-chip text-xs ${
                      (student.gpa ?? 0) >= 3.7
                        ? "chip-emerald"
                        : (student.gpa ?? 0) >= 3
                          ? "chip-blue"
                          : "chip-purple"
                    }`}
                  >
                    GPA {student.gpa?.toFixed(2) ?? "—"}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void openDetails(student.id)}
                    className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={() => (editingId === student.id ? cancelEdit() : startEdit(student))}
                    className="flex-1 rounded-lg border border-blue-200 bg-blue-50 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  >
                    {editingId === student.id ? "Cancel" : "Edit"}
                  </button>
                </div>
                {(studentTagsMap[student.id] ?? []).length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(studentTagsMap[student.id] ?? []).slice(0, 3).map((tag) => (
                      <span key={tag} className="campus-chip chip-purple text-[11px]">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
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

      {detailStudent ? (
        <div className="fixed inset-0 z-50 flex" onClick={() => setDetailStudent(null)}>
          <div className="flex-1 bg-black/30" />
          <div
            className="relative h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
                {detailStudent.studentProfile?.legalName ?? "Student"}
              </p>
              <button onClick={() => setDetailStudent(null)} className="text-xl text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            <div className="space-y-5 p-6">
              <div className="mb-4 flex border-b border-slate-100 dark:border-slate-700">
                {(["profile", "grades", "security", "notifications", "notes", "tags"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                      activeTab === tab ? "border-b-2 border-blue-500 text-blue-600" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {activeTab === "profile" ? (
                <>
                  <div className="campus-card space-y-2 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-400">Profile</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-slate-500">Email</p>
                        <p className="break-all font-medium text-slate-800 dark:text-slate-100">{detailStudent.email}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Student ID</p>
                        <p className="font-mono font-medium text-slate-800 dark:text-slate-100">{detailStudent.studentId ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">GPA</p>
                        <p
                          className={`font-bold ${
                            (detailStudent.gpa ?? 0) >= 3.7 ? "text-emerald-600" : (detailStudent.gpa ?? 0) >= 3 ? "text-blue-600" : "text-amber-600"
                          }`}
                        >
                          {detailStudent.gpa?.toFixed(2) ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Role</p>
                        <p className="font-medium text-slate-800 dark:text-slate-100">{detailStudent.role ?? "STUDENT"}</p>
                      </div>
                    </div>
                  </div>

                  {detailStudent.enrollments?.length ? (
                    <div className="campus-card p-4">
                      <p className="mb-3 text-xs font-semibold uppercase text-slate-400">
                        Enrollments ({detailStudent.enrollments.length})
                      </p>
                      <div className="space-y-2">
                        {detailStudent.enrollments.map((enrollment) => (
                          <div key={enrollment.id} className="flex items-center justify-between text-sm">
                            <span className="font-mono text-xs font-semibold text-slate-600">
                              {enrollment.section?.course?.code ?? "—"}
                            </span>
                            <span
                            className={`campus-chip text-xs ${
                                enrollment.status === "ENROLLED"
                                  ? "chip-emerald"
                                  : enrollment.status === "WAITLISTED"
                                    ? "chip-amber"
                                    : "chip-purple"
                              }`}
                            >
                              {enrollment.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="border-t border-slate-100 pt-4 dark:border-slate-700">
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Role Management</p>
                    <div className="flex gap-2">
                      {(["STUDENT", "ADMIN"] as const).map((role) => (
                        <button
                          key={role}
                          type="button"
                          disabled={roleSaving}
                          onClick={() => void updateRole(role)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            detailStudent.role === role
                              ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          } disabled:opacity-50`}
                        >
                          {roleSaving && detailStudent.role !== role ? "Updating…" : role}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : activeTab === "grades" ? (
                <div className="space-y-2">
                  {(detailStudent.enrollments ?? []).filter((enrollment) => enrollment.finalGrade).length === 0 ? (
                    <p className="text-sm text-slate-400">No grades recorded.</p>
                  ) : (
                    (detailStudent.enrollments ?? [])
                      .filter((enrollment) => enrollment.finalGrade)
                      .map((enrollment) => (
                        <div key={enrollment.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-700">
                          <span className="font-mono text-xs font-semibold text-slate-600">
                            {enrollment.section?.course?.code ?? "—"}
                          </span>
                          <span
                            className={`text-lg font-bold ${
                              enrollment.finalGrade === "A" || enrollment.finalGrade === "A+"
                                ? "text-emerald-600"
                                : enrollment.finalGrade === "B"
                                  ? "text-blue-600"
                                  : enrollment.finalGrade === "C"
                                    ? "text-amber-600"
                                    : "text-red-600"
                            }`}
                          >
                            {enrollment.finalGrade}
                          </span>
                        </div>
                      ))
                  )}
                </div>
              ) : activeTab === "security" ? (
                <div className="space-y-4">
                  <div className="campus-card space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase text-slate-400">Security Info</p>
                      {detailLocked ? (
                        <span className="campus-chip chip-amber">Locked</span>
                      ) : (
                        <span className="campus-chip chip-emerald">Normal</span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-slate-500">Last Login</p>
                        <p className="font-medium text-slate-800 dark:text-slate-100">
                          {detailStudent.lastLoginAt ? new Date(detailStudent.lastLoginAt).toLocaleString() : "Never"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Failed Attempts</p>
                        <p className="font-medium text-slate-800 dark:text-slate-100">{detailStudent.loginAttempts ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Locked Until</p>
                        <p className="font-medium text-slate-800 dark:text-slate-100">
                          {detailStudent.lockedUntil ? new Date(detailStudent.lockedUntil).toLocaleString() : "Not locked"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Role</p>
                        <p className="font-medium text-slate-800 dark:text-slate-100">{detailStudent.role ?? "STUDENT"}</p>
                      </div>
                    </div>
                    {detailLocked ? (
                      <button
                        type="button"
                        disabled={unlocking}
                        onClick={() => void unlockAccount()}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 px-4 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                      >
                        {unlocking ? "Unlocking…" : "Unlock Account"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : activeTab === "notifications" ? (
                <div className="space-y-3">
                  {notificationLoading ? (
                    <p className="text-sm text-slate-400">Loading notification log…</p>
                  ) : notificationLog.length === 0 ? (
                    <p className="text-sm text-slate-400">No notification records yet.</p>
                  ) : (
                    notificationLog.map((item) => (
                      <div key={item.id} className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-700">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.subject || "—"}</p>
                            <p className="mt-1 text-xs text-slate-400">{new Date(item.sentAt).toLocaleString()}</p>
                          </div>
                          <span
                            className={`campus-chip text-xs ${
                              item.type === "email"
                                ? "chip-blue"
                                : "chip-purple"
                            }`}
                          >
                            {item.type}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : activeTab === "notes" ? (
                /* Notes tab */
                <div className="space-y-3">
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                    <p className="text-xs font-semibold uppercase text-slate-500">添加备注</p>
                    <textarea
                      className="campus-input w-full min-h-[72px] resize-y text-sm"
                      placeholder="输入备注内容…"
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <select
                        className="campus-select text-xs flex-1"
                        value={newNoteFlag}
                        onChange={(e) => setNewNoteFlag(e.target.value)}
                      >
                        <option value="">无标签</option>
                        <option value="urgent">🔴 紧急</option>
                        <option value="academic">📚 学业</option>
                        <option value="financial">💰 财务</option>
                        <option value="positive">✅ 正面</option>
                      </select>
                      <button
                        type="button"
                        disabled={!newNoteContent.trim()}
                        onClick={() => void addNote()}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                      >
                        添加
                      </button>
                    </div>
                  </div>
                  {notesLoading ? (
                    <p className="text-sm text-slate-400">加载中…</p>
                  ) : studentNotes.length === 0 ? (
                    <p className="text-sm text-slate-400">暂无备注</p>
                  ) : (
                    studentNotes.map((note) => {
                      const flagColors: Record<string, string> = {
                        urgent: "border-red-200 bg-red-50",
                        academic: "border-indigo-200 bg-indigo-50",
                        financial: "border-amber-200 bg-amber-50",
                        positive: "border-emerald-200 bg-emerald-50"
                      };
                      const flagLabels: Record<string, string> = {
                        urgent: "🔴 紧急",
                        academic: "📚 学业",
                        financial: "💰 财务",
                        positive: "✅ 正面"
                      };
                      return (
                        <div key={note.id} className={`rounded-lg border px-3 py-2 ${note.flag ? (flagColors[note.flag] ?? "border-slate-100 bg-white") : "border-slate-100 bg-white"} dark:border-slate-700 dark:bg-slate-800`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {note.flag && (
                                <span className="mb-1 inline-block text-xs font-semibold text-slate-600">{flagLabels[note.flag] ?? note.flag}</span>
                              )}
                              <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{note.content}</p>
                              <p className="mt-1 text-xs text-slate-400">
                                {note.admin.email} · {new Date(note.createdAt).toLocaleString()}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void deleteNote(note.id)}
                              className="text-slate-300 hover:text-red-500 text-sm"
                              title="删除备注"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="campus-card p-4">
                    <p className="text-xs font-semibold uppercase text-slate-400">Student Tags</p>
                    <p className="mt-1 text-sm text-slate-500">使用标签为学生标记风险、项目、特殊关注点或运营状态。</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {tagsLoading ? (
                        <span className="text-sm text-slate-400">加载中…</span>
                      ) : detailTags.length === 0 ? (
                        <span className="text-sm text-slate-400">还没有标签</span>
                      ) : (
                        detailTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => void removeTag(tag)}
                            disabled={savingTags}
                            className="campus-chip chip-purple"
                          >
                            {tag} ×
                          </button>
                        ))
                      )}
                    </div>

                    <div className="mt-4 flex gap-2">
                      <input
                        className="campus-input flex-1"
                        placeholder="输入标签后回车"
                        value={tagDraft}
                        onChange={(event) => setTagDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void addTag();
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={!tagDraft.trim() || savingTags}
                        onClick={() => void addTag()}
                        className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {savingTags ? "保存中…" : "添加"}
                      </button>
                    </div>

                    {availableTags.length > 0 ? (
                      <div className="mt-4">
                        <p className="mb-2 text-xs font-semibold uppercase text-slate-400">常用标签</p>
                        <div className="flex flex-wrap gap-2">
                          {availableTags.slice(0, 12).map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setTagDraft(tag)}
                              className="campus-chip chip-blue"
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
