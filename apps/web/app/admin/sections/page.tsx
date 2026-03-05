"use client";

import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type Enrollment = {
  id: string;
  status: string;
};

type RosterEnrollment = {
  id: string;
  status: string;
  finalGrade: string | null;
  student: {
    email: string;
    studentId: string | null;
    studentProfile?: {
      legalName?: string;
    };
  };
};

type MeetingTime = {
  id: string;
  weekday: number;
  startMinutes: number;
  endMinutes: number;
};

type Section = {
  id: string;
  sectionCode: string;
  capacity: number;
  requireApproval: boolean;
  modality: string;
  instructorName: string;
  location: string | null;
  credits: number;
  term: { id: string; name: string };
  course: { id: string; code: string };
  ratings?: Array<{ rating: number }>;
  enrollments: Enrollment[];
  meetingTimes: MeetingTime[];
};

type SectionEditForm = {
  capacity: number;
  instructorName: string;
  location: string;
  requireApproval: boolean;
  modality: string;
};

type Term = { id: string; name: string };
type Course = { id: string; code: string; title: string };

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

type BulkPromoteSummary = {
  sectionsTouched: number;
  totalPromoted: number;
};

type NotifyResponse = {
  sent: number;
  failed: number;
  total: number;
};

type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
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

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function formatMeetingTimes(meetingTimes: MeetingTime[]): string {
  if (!meetingTimes || meetingTimes.length === 0) return "—";
  return meetingTimes
    .sort((a, b) => a.weekday - b.weekday || a.startMinutes - b.startMinutes)
    .map((mt) => `${WEEKDAY_SHORT[mt.weekday] ?? "?"} ${minutesToTime(mt.startMinutes)}–${minutesToTime(mt.endMinutes)}`)
    .join(", ");
}

function enrolledCount(section: Section): number {
  return section.enrollments.filter((item) => item.status === "ENROLLED").length;
}

function waitlistCount(section: Section): number {
  return section.enrollments.filter((item) => item.status === "WAITLISTED").length;
}

function availableSeats(section: Section): number {
  return Math.max(0, section.capacity - enrolledCount(section));
}

function promotableCount(section: Section): number {
  return Math.min(waitlistCount(section), availableSeats(section));
}

function avgRating(ratings: Array<{ rating: number }> | undefined): string {
  if (!ratings?.length) return "—";
  return `⭐ ${(ratings.reduce((sum, item) => sum + item.rating, 0) / ratings.length).toFixed(1)} (${ratings.length})`;
}

const PAGE_SIZE = 25;

export default function AdminSectionsPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [pageError, setPageError] = useState("");
  const [countsBySection, setCountsBySection] = useState<Record<string, number>>({});
  const [loadingBySection, setLoadingBySection] = useState<Record<string, boolean>>({});
  const [messageBySection, setMessageBySection] = useState<Record<string, RowMessage>>({});
  const [bulkMessage, setBulkMessage] = useState<RowMessage | null>(null);
  const [page, setPage] = useState(1);
  const [bulkPromoting, setBulkPromoting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [termFilter, setTermFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [filterWaitlistOnly, setFilterWaitlistOnly] = useState(false);
  const [filterActionOnly, setFilterActionOnly] = useState(false);
  const [sortActionFirst, setSortActionFirst] = useState(true);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    termId: "",
    courseId: "",
    sectionCode: "",
    modality: "ON_CAMPUS",
    capacity: 30,
    credits: 3,
    instructorName: "",
    location: "",
    requireApproval: false
  });
  const [createMeetingTimes, setCreateMeetingTimes] = useState<Array<{ weekday: number; startTime: string; endTime: string }>>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SectionEditForm>({ capacity: 30, instructorName: "", location: "", requireApproval: false, modality: "ON_CAMPUS" });
  const [editMeetingTimes, setEditMeetingTimes] = useState<Array<{ weekday: number; startTime: string; endTime: string }>>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingRosterId, setExportingRosterId] = useState<string | null>(null);
  const [notifyingSectionId, setNotifyingSectionId] = useState<string | null>(null);
  const [notifyForm, setNotifyForm] = useState({ subject: "", message: "" });
  const [notifySending, setNotifySending] = useState(false);
  const [editingCapacity, setEditingCapacity] = useState<{ id: string; val: number } | null>(null);

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
      const target = `${section.term.name} ${section.course.code} ${section.sectionCode} ${section.instructorName} ${section.location ?? ""}`.toLowerCase();
      if (!target.includes(q)) return false;
      return true;
    });
  }, [sections, search, termFilter]);

  const visibleSections = useMemo(() => {
    const rows = filteredSections.filter((section) => {
      const waitlisted = waitlistCount(section);
      const seats = availableSeats(section);
      if (filterWaitlistOnly && waitlisted === 0) return false;
      if (filterActionOnly && !(waitlisted > 0 && seats > 0)) return false;
      return true;
    });

    if (sortActionFirst) {
      rows.sort((a, b) => {
        const actionableA = waitlistCount(a) > 0 && availableSeats(a) > 0 ? 1 : 0;
        const actionableB = waitlistCount(b) > 0 && availableSeats(b) > 0 ? 1 : 0;
        if (actionableA !== actionableB) return actionableB - actionableA;
        if (a.term.name !== b.term.name) return a.term.name.localeCompare(b.term.name);
        if (a.course.code !== b.course.code) return a.course.code.localeCompare(b.course.code);
        return a.sectionCode.localeCompare(b.sectionCode);
      });
    }

    return rows;
  }, [filteredSections, filterWaitlistOnly, filterActionOnly, sortActionFirst]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [termFilter, search, filterWaitlistOnly, filterActionOnly, sortActionFirst]);

  const totalPages = Math.max(1, Math.ceil(visibleSections.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedSections = visibleSections.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const actionableSections = useMemo(
    () => visibleSections.filter((section) => waitlistCount(section) > 0 && availableSeats(section) > 0),
    [visibleSections]
  );

  const overview = useMemo(() => {
    let totalCapacity = 0;
    let enrolled = 0;
    let waitlisted = 0;
    for (const section of visibleSections) {
      totalCapacity += section.capacity;
      enrolled += enrolledCount(section);
      waitlisted += waitlistCount(section);
    }
    const utilization = totalCapacity > 0 ? Math.round((enrolled / totalCapacity) * 100) : 0;
    return {
      sections: visibleSections.length,
      totalCapacity,
      enrolled,
      waitlisted,
      utilization
    };
  }, [visibleSections]);

  const highPressureSections = useMemo(
    () =>
      [...visibleSections]
        .filter((section) => waitlistCount(section) > 0)
        .sort((a, b) => {
          const pressureA = waitlistCount(a) - availableSeats(a);
          const pressureB = waitlistCount(b) - availableSeats(b);
          if (pressureA !== pressureB) return pressureB - pressureA;
          return waitlistCount(b) - waitlistCount(a);
        })
        .slice(0, 8),
    [visibleSections]
  );

  const recommendedPromotionTotal = useMemo(
    () => actionableSections.reduce((sum, section) => sum + promotableCount(section), 0),
    [actionableSections]
  );

  const loadSections = async () => {
    try {
      setLoading(true);
      setPageError("");
      const data = await apiFetch<Section[]>("/admin/sections");
      setSections(data);
      setCountsBySection((prev) => {
        const next: Record<string, number> = {};
        for (const section of data) {
          const recommended = Math.max(1, promotableCount(section));
          next[section.id] = prev[section.id] && prev[section.id] > 0 ? prev[section.id] : recommended;
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
    void apiFetch<Term[]>("/admin/terms").then(setTerms).catch(() => {});
    void apiFetch<Course[]>("/admin/courses").then(setCourses).catch(() => {});
  }, []);

  const timeToMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };

  const onCreateSection = async (event: FormEvent) => {
    event.preventDefault();
    setCreateError("");
    setCreateSuccess("");
    try {
      setCreating(true);
      await apiFetch("/admin/sections", {
        method: "POST",
        body: JSON.stringify({
          termId: createForm.termId,
          courseId: createForm.courseId,
          sectionCode: createForm.sectionCode,
          modality: createForm.modality,
          capacity: Number(createForm.capacity),
          credits: Number(createForm.credits),
          instructorName: createForm.instructorName,
          location: createForm.location || null,
          requireApproval: createForm.requireApproval,
          meetingTimes: createMeetingTimes.map((mt) => ({
            weekday: mt.weekday,
            startMinutes: timeToMinutes(mt.startTime),
            endMinutes: timeToMinutes(mt.endTime)
          }))
        })
      });
      setCreateSuccess("Section created successfully.");
      setCreateForm({ termId: "", courseId: "", sectionCode: "", modality: "ON_CAMPUS", capacity: 30, credits: 3, instructorName: "", location: "", requireApproval: false });
      setCreateMeetingTimes([]);
      await loadSections();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

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

  const promote = async (sectionId: string, explicitCount?: number) => {
    const count = explicitCount ?? Math.max(1, Math.floor(countsBySection[sectionId] || 1));

    setBulkMessage(null);
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

  const promoteRecommended = async (section: Section) => {
    const recommended = Math.max(1, promotableCount(section));
    await promote(section.id, recommended);
  };

  const promoteActionableSections = async () => {
    const queue = actionableSections
      .map((section) => ({ section, count: promotableCount(section) }))
      .filter((item) => item.count > 0);

    if (queue.length === 0) {
      setBulkMessage({ type: "error", text: "No actionable sections with promotable seats." });
      return;
    }

    setBulkPromoting(true);
    setBulkMessage(null);
    try {
      let summary: BulkPromoteSummary = { sectionsTouched: 0, totalPromoted: 0 };
      const failedSections: string[] = [];

      for (const item of queue) {
        setLoadingBySection((prev) => ({ ...prev, [item.section.id]: true }));
        try {
          const result = await apiFetch<PromoteResponse>("/admin/waitlist/promote", {
            method: "POST",
            body: JSON.stringify({ sectionId: item.section.id, count: item.count })
          });

          if (result.promotedCount > 0) {
            summary = {
              sectionsTouched: summary.sectionsTouched + 1,
              totalPromoted: summary.totalPromoted + result.promotedCount
            };
          }

          setMessageBySection((prev) => ({
            ...prev,
            [item.section.id]: {
              type: "success",
              text: `Promoted ${result.promotedCount}. Remaining waitlist ${result.remainingWaitlistCount}. Seats before ${result.availableSeatsBefore}, after ${result.availableSeatsAfter}.`
            }
          }));
        } catch (error) {
          failedSections.push(`${item.section.course.code} §${item.section.sectionCode}`);
          setMessageBySection((prev) => ({
            ...prev,
            [item.section.id]: {
              type: "error",
              text: error instanceof Error ? error.message : "Promotion failed"
            }
          }));
        } finally {
          setLoadingBySection((prev) => ({ ...prev, [item.section.id]: false }));
        }
      }

      if (failedSections.length > 0) {
        setBulkMessage({
          type: "error",
          text: `Promoted ${summary.totalPromoted} across ${summary.sectionsTouched} section(s). Failed: ${failedSections.join(", ")}.`
        });
      } else {
        setBulkMessage({
          type: "success",
          text: `Promoted ${summary.totalPromoted} across ${summary.sectionsTouched} section(s).`
        });
      }

      await loadSections();
    } finally {
      setBulkPromoting(false);
    }
  };

  const startEdit = (section: Section) => {
    setEditingId(section.id);
    setEditForm({
      capacity: section.capacity,
      instructorName: section.instructorName,
      location: section.location ?? "",
      requireApproval: section.requireApproval,
      modality: section.modality
    });
    setEditMeetingTimes(
      (section.meetingTimes ?? []).map((mt) => ({
        weekday: mt.weekday,
        startTime: minutesToTime(mt.startMinutes),
        endTime: minutesToTime(mt.endMinutes)
      }))
    );
    setCreateError("");
    setCreateSuccess("");
    setBulkMessage(null);
  };

  const cancelEdit = () => setEditingId(null);

  const onSaveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    setCreateError("");
    setCreateSuccess("");
    try {
      setSavingEdit(true);
      await apiFetch(`/admin/sections/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          capacity: Number(editForm.capacity),
          instructorName: editForm.instructorName,
          location: editForm.location || null,
          requireApproval: editForm.requireApproval,
          modality: editForm.modality,
          meetingTimes: editMeetingTimes.map((mt) => ({
            weekday: mt.weekday,
            startMinutes: timeToMinutes(mt.startTime),
            endMinutes: timeToMinutes(mt.endTime)
          }))
        })
      });
      setEditingId(null);
      setCreateSuccess("Section updated successfully.");
      await loadSections();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingEdit(false);
    }
  };

  const onDeleteSection = async (id: string, code: string) => {
    if (!window.confirm(`Delete section "${code}"? This will remove all associated enrollments and cannot be undone.`)) return;
    setCreateError("");
    setCreateSuccess("");
    try {
      setDeletingId(id);
      await apiFetch(`/admin/sections/${id}`, { method: "DELETE" });
      setCreateSuccess(`Section "${code}" deleted.`);
      if (editingId === id) setEditingId(null);
      await loadSections();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Term", "Course", "Section", "Modality", "Capacity", "Enrolled", "Waitlisted", "Available", "Instructor", "Location", "Req Approval", "Schedule"],
      ...visibleSections.map((s) => [
        s.term.name,
        s.course.code,
        s.sectionCode,
        s.modality,
        String(s.capacity),
        String(enrolledCount(s)),
        String(waitlistCount(s)),
        String(availableSeats(s)),
        s.instructorName,
        s.location ?? "",
        s.requireApproval ? "Yes" : "No",
        formatMeetingTimes(s.meetingTimes)
      ])
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sections-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportRoster = async (section: Section) => {
    setMessageBySection((prev) => {
      const next = { ...prev };
      delete next[section.id];
      return next;
    });

    try {
      setExportingRosterId(section.id);

      const records: RosterEnrollment[] = [];
      let currentPage = 1;
      let totalPages = 1;

      while (currentPage <= totalPages) {
        const params = new URLSearchParams({
          sectionId: section.id,
          page: String(currentPage),
          pageSize: "200"
        });
        const result = await apiFetch<PaginatedResponse<RosterEnrollment>>(`/admin/enrollments?${params.toString()}`);
        records.push(...result.data);
        totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
        currentPage += 1;
      }

      const rows = [
        ["Student Name", "Student ID", "Email", "Status", "Grade"],
        ...records.map((entry) => [
          entry.student.studentProfile?.legalName ?? "",
          entry.student.studentId ?? "",
          entry.student.email ?? "",
          entry.status ?? "",
          entry.finalGrade ?? ""
        ])
      ];

      const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `roster-${section.course.code ?? "section"}-${section.sectionCode}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);

      setMessageBySection((prev) => ({
        ...prev,
        [section.id]: {
          type: "success",
          text: `Exported ${records.length} roster row${records.length === 1 ? "" : "s"} for ${section.course.code} §${section.sectionCode}.`
        }
      }));
    } catch (error) {
      setMessageBySection((prev) => ({
        ...prev,
        [section.id]: {
          type: "error",
          text: error instanceof Error ? error.message : "Roster export failed"
        }
      }));
    } finally {
      setExportingRosterId(null);
    }
  };

  const openNotify = (sectionId: string) => {
    setNotifyingSectionId(sectionId);
    setNotifyForm({ subject: "", message: "" });
    setMessageBySection((prev) => {
      const next = { ...prev };
      delete next[sectionId];
      return next;
    });
  };

  const sendSectionNotification = async (section: Section) => {
    if (!notifyForm.subject.trim() || !notifyForm.message.trim()) return;

    setNotifySending(true);
    try {
      const result = await apiFetch<NotifyResponse>(`/admin/sections/${section.id}/notify`, {
        method: "POST",
        body: JSON.stringify({
          subject: notifyForm.subject.trim(),
          message: notifyForm.message.trim()
        }),
        headers: { "Content-Type": "application/json" }
      });
      window.alert(`Sent to ${result.sent} student(s).`);
      setNotifyingSectionId(null);
      setNotifyForm({ subject: "", message: "" });
      setMessageBySection((prev) => ({
        ...prev,
        [section.id]: {
          type: result.failed > 0 ? "error" : "success",
          text:
            result.failed > 0
              ? `Notification sent to ${result.sent} student(s); ${result.failed} failed.`
              : `Notification sent to ${result.sent} enrolled student(s).`
        }
      }));
    } catch (error) {
      setMessageBySection((prev) => ({
        ...prev,
        [section.id]: {
          type: "error",
          text: error instanceof Error ? error.message : "Notification failed"
        }
      }));
    } finally {
      setNotifySending(false);
    }
  };

  const saveCapacityEdit = async (sectionId: string, value: number) => {
    try {
      await apiFetch(`/admin/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacity: value })
      });
      setEditingCapacity(null);
      await loadSections();
    } catch (error) {
      setMessageBySection((prev) => ({
        ...prev,
        [sectionId]: {
          type: "error",
          text: error instanceof Error ? error.message : "Capacity update failed"
        }
      }));
      setEditingCapacity(null);
    }
  };

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Enrollment Operations</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-[2.65rem]">Sections Management</h1>
            <p className="text-sm text-slate-600 md:text-base">
              Monitor seat utilization, track waitlist pressure, and promote students into open ENROLLED seats.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{overview.sections} visible sections</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{overview.waitlisted} waitlisted</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{actionableSections.length} actionable</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={visibleSections.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void loadSections()}
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <MetricCard label="Visible Sections" value={overview.sections} tone="slate" />
        <MetricCard label="Enrolled" value={overview.enrolled} tone="emerald" />
        <MetricCard label="Waitlisted" value={overview.waitlisted} tone="amber" />
        <MetricCard label="Action Queue" value={actionableSections.length} tone="blue" />
        <MetricCard label="Total Capacity" value={overview.totalCapacity} tone="slate" />
        <MetricCard label="Utilization" value={`${overview.utilization}%`} tone="blue" />
      </section>

      <section className="campus-toolbar">
        <div className="grid gap-3 md:grid-cols-[260px_minmax(0,1fr)]">
          <label className="block">
            <span className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-slate-100 text-[10px]">T</span>
              Term
            </span>
            <select
              className="campus-select"
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
                ref={searchRef}
                className="campus-input pl-8"
                placeholder="Filter by term, course, section, or instructor  [/]"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setFilterWaitlistOnly((prev) => !prev)}
            className={`inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium transition ${
              filterWaitlistOnly
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Waitlist Only
          </button>
          <button
            type="button"
            onClick={() => setFilterActionOnly((prev) => !prev)}
            className={`inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium transition ${
              filterActionOnly
                ? "border-blue-300 bg-blue-50 text-blue-800"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Needs Promotion Action
          </button>
          <button
            type="button"
            onClick={() => setSortActionFirst((prev) => !prev)}
            className={`inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium transition ${
              sortActionFirst
                ? "border-slate-400 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Actionable First
          </button>
          {(termFilter !== "ALL" || search.trim() || filterWaitlistOnly || filterActionOnly || !sortActionFirst) ? (
            <button
              type="button"
              onClick={() => {
                setTermFilter("ALL");
                setSearch("");
                setFilterWaitlistOnly(false);
                setFilterActionOnly(false);
                setSortActionFirst(true);
              }}
              className="inline-flex h-9 items-center rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Clear Filters
            </button>
          ) : null}
        </div>
      </section>

      <section className="campus-card p-4 md:p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Create New Section</h2>
        <form className="grid gap-2 md:grid-cols-4" onSubmit={onCreateSection}>
          <label className="block">
            <span className="sr-only">Term</span>
            <select
              required
              aria-label="Term"
              value={createForm.termId}
              onChange={(e) => setCreateForm((p) => ({ ...p, termId: e.target.value }))}
              className="campus-select"
            >
              <option value="">Select Term</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Course</span>
            <select
              required
              aria-label="Course"
              value={createForm.courseId}
              onChange={(e) => setCreateForm((p) => ({ ...p, courseId: e.target.value }))}
              className="campus-select"
            >
              <option value="">Select Course</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Section code</span>
            <input
              required
              aria-label="Section code"
              placeholder="Section Code (e.g. A)"
              value={createForm.sectionCode}
              onChange={(e) => setCreateForm((p) => ({ ...p, sectionCode: e.target.value }))}
              className="campus-input"
            />
          </label>
          <label className="block">
            <span className="sr-only">Modality</span>
            <select
              aria-label="Modality"
              value={createForm.modality}
              onChange={(e) => setCreateForm((p) => ({ ...p, modality: e.target.value }))}
              className="campus-select"
            >
              <option value="ON_CAMPUS">On Campus</option>
              <option value="ONLINE">Online</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Capacity</span>
            <input
              required
              aria-label="Capacity"
              type="number"
              min={1}
              placeholder="Capacity"
              value={createForm.capacity}
              onChange={(e) => setCreateForm((p) => ({ ...p, capacity: Number(e.target.value) }))}
              className="campus-input"
            />
          </label>
          <label className="block">
            <span className="sr-only">Credits</span>
            <input
              required
              aria-label="Credits"
              type="number"
              min={1}
              placeholder="Credits"
              value={createForm.credits}
              onChange={(e) => setCreateForm((p) => ({ ...p, credits: Number(e.target.value) }))}
              className="campus-input"
            />
          </label>
          <label className="block">
            <span className="sr-only">Instructor name</span>
            <input
              required
              aria-label="Instructor name"
              placeholder="Instructor Name"
              value={createForm.instructorName}
              onChange={(e) => setCreateForm((p) => ({ ...p, instructorName: e.target.value }))}
              className="campus-input"
            />
          </label>
          <label className="block">
            <span className="sr-only">Location</span>
            <input
              aria-label="Location"
              placeholder="Location (optional)"
              value={createForm.location}
              onChange={(e) => setCreateForm((p) => ({ ...p, location: e.target.value }))}
              className="campus-input"
            />
          </label>
          <div className="flex items-center col-span-full md:col-span-2">
            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-100 transition">
              <input
                type="checkbox"
                className="size-4 accent-slate-900"
                checked={createForm.requireApproval}
                onChange={(e) => setCreateForm((p) => ({ ...p, requireApproval: e.target.checked }))}
              />
              Requires instructor approval
            </label>
          </div>
          <div className="col-span-full space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meeting Times</span>
              <button
                type="button"
                onClick={() => setCreateMeetingTimes((prev) => [...prev, { weekday: 1, startTime: "09:00", endTime: "10:00" }])}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                + Add time
              </button>
            </div>
            {createMeetingTimes.map((mt, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Weekday for meeting time ${idx + 1}`}
                  value={mt.weekday}
                  onChange={(e) => setCreateMeetingTimes((prev) => prev.map((item, i) => i === idx ? { ...item, weekday: Number(e.target.value) } : item))}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value={1}>Mon</option>
                  <option value={2}>Tue</option>
                  <option value={3}>Wed</option>
                  <option value={4}>Thu</option>
                  <option value={5}>Fri</option>
                  <option value={6}>Sat</option>
                  <option value={0}>Sun</option>
                </select>
                <input
                  type="time"
                  aria-label={`Start time for meeting time ${idx + 1}`}
                  value={mt.startTime}
                  onChange={(e) => setCreateMeetingTimes((prev) => prev.map((item, i) => i === idx ? { ...item, startTime: e.target.value } : item))}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-xs text-slate-400">to</span>
                <input
                  type="time"
                  aria-label={`End time for meeting time ${idx + 1}`}
                  value={mt.endTime}
                  onChange={(e) => setCreateMeetingTimes((prev) => prev.map((item, i) => i === idx ? { ...item, endTime: e.target.value } : item))}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  aria-label={`Remove meeting time ${idx + 1}`}
                  onClick={() => setCreateMeetingTimes((prev) => prev.filter((_, i) => i !== idx))}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-xs text-red-600 transition hover:bg-red-100"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="submit"
            disabled={creating}
            className="col-span-full inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 md:col-span-1"
          >
            {creating ? (
              <><span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Creating…</>
            ) : "Create Section"}
          </button>
        </form>
        {createError ? <Alert type="error" message={createError} /> : null}
        {createSuccess ? <Alert type="success" message={createSuccess} /> : null}
      </section>

      {editingId ? (
        <section className="campus-card border-blue-200 bg-blue-50/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-blue-900">
              Editing: {sections.find((s) => s.id === editingId)?.course.code} §{sections.find((s) => s.id === editingId)?.sectionCode}
            </h2>
            <button type="button" onClick={cancelEdit} className="text-sm font-medium text-blue-700 underline underline-offset-2">Cancel</button>
          </div>
          <form className="grid gap-3 md:grid-cols-4" onSubmit={(e) => void onSaveEdit(e)}>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Modality</label>
              <select
                className="campus-select"
                value={editForm.modality}
                onChange={(e) => setEditForm((p) => ({ ...p, modality: e.target.value }))}
              >
                <option value="ON_CAMPUS">On Campus</option>
                <option value="ONLINE">Online</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Capacity</label>
              <input
                type="number"
                min={1}
                required
                className="campus-input"
                value={editForm.capacity}
                onChange={(e) => setEditForm((p) => ({ ...p, capacity: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Instructor</label>
              <input
                required
                className="campus-input"
                value={editForm.instructorName}
                onChange={(e) => setEditForm((p) => ({ ...p, instructorName: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Location</label>
              <input
                className="campus-input"
                placeholder="Optional"
                value={editForm.location}
                onChange={(e) => setEditForm((p) => ({ ...p, location: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2 md:col-span-2">
              <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="size-4 accent-slate-900"
                  checked={editForm.requireApproval}
                  onChange={(e) => setEditForm((p) => ({ ...p, requireApproval: e.target.checked }))}
                />
                Requires instructor approval
              </label>
            </div>
            <div className="col-span-full space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meeting Times</span>
                <button
                  type="button"
                  onClick={() => setEditMeetingTimes((prev) => [...prev, { weekday: 1, startTime: "09:00", endTime: "10:00" }])}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  + Add time
                </button>
              </div>
              {editMeetingTimes.map((mt, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Weekday for edit meeting time ${idx + 1}`}
                    value={mt.weekday}
                    onChange={(e) => setEditMeetingTimes((prev) => prev.map((item, i) => i === idx ? { ...item, weekday: Number(e.target.value) } : item))}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value={1}>Mon</option>
                    <option value={2}>Tue</option>
                    <option value={3}>Wed</option>
                    <option value={4}>Thu</option>
                    <option value={5}>Fri</option>
                    <option value={6}>Sat</option>
                    <option value={0}>Sun</option>
                  </select>
                  <input
                    type="time"
                    aria-label={`Start time for edit meeting time ${idx + 1}`}
                    value={mt.startTime}
                    onChange={(e) => setEditMeetingTimes((prev) => prev.map((item, i) => i === idx ? { ...item, startTime: e.target.value } : item))}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <span className="text-xs text-slate-400">to</span>
                  <input
                    type="time"
                    aria-label={`End time for edit meeting time ${idx + 1}`}
                    value={mt.endTime}
                    onChange={(e) => setEditMeetingTimes((prev) => prev.map((item, i) => i === idx ? { ...item, endTime: e.target.value } : item))}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    aria-label={`Remove edit meeting time ${idx + 1}`}
                    onClick={() => setEditMeetingTimes((prev) => prev.filter((_, i) => i !== idx))}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-xs text-red-600 transition hover:bg-red-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="md:col-span-2 md:flex md:items-end">
              <button
                type="submit"
                disabled={savingEdit}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
              >
                {savingEdit ? (
                  <><span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Saving…</>
                ) : "Save changes"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {pageError ? <Alert type="error" message={pageError} /> : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="campus-card p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-900">
                Promotion Control
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Actionable queue where waitlisted students can be moved into ENROLLED seats.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Recommended moves</p>
              <p className="text-2xl font-semibold text-slate-900">{recommendedPromotionTotal}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void promoteActionableSections()}
              disabled={bulkPromoting || actionableSections.length === 0}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkPromoting ? (
                <>
                  <span className="size-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700" />
                  Promoting Queue
                </>
              ) : (
                "Promote All Actionable"
              )}
            </button>
            <span className="text-xs text-slate-600">
              {actionableSections.length > 0
                ? `${actionableSections.length} section(s) ready now`
                : "No sections currently eligible for promotion."}
            </span>
          </div>

          {bulkMessage ? (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                bulkMessage.type === "success"
                  ? "border-emerald-300 bg-white text-emerald-900"
                  : "border-red-300 bg-red-50 text-red-800"
              }`}
            >
              {bulkMessage.text}
            </div>
          ) : null}

          <ul className="mt-4 space-y-2">
            {actionableSections.slice(0, 6).map((section) => (
              <li
                key={`queue-${section.id}`}
                className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_auto_auto]"
              >
                <span className="font-medium text-slate-800">
                  {section.term.name} · {section.course.code} §{section.sectionCode}
                </span>
                <span className="text-xs text-slate-600">
                  Promote {promotableCount(section)} · Waitlist {waitlistCount(section)} · Seats {availableSeats(section)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void promoteRecommended(section)}
                    disabled={loadingBySection[section.id]}
                    className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingBySection[section.id] ? "Working..." : "Promote now"}
                  </button>
                  <a
                    href={`#section-row-${section.id}`}
                    className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 no-underline transition hover:bg-slate-50"
                  >
                    Jump
                  </a>
                </div>
              </li>
            ))}
            {actionableSections.length === 0 ? (
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-700">
                Waitlist queue is currently balanced. Keep monitoring pressure watchlist for upcoming bottlenecks.
              </li>
            ) : null}
          </ul>
        </div>

        <div className="campus-card p-4 md:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-900">Capacity Pressure Watchlist</h2>
          <p className="mt-1 text-sm text-slate-600">
            Highest pressure sections ranked by <span className="font-medium">waitlist minus open seats</span>.
          </p>

          <ul className="mt-4 space-y-2">
            {highPressureSections.map((section) => {
              const seats = availableSeats(section);
              const waitlisted = waitlistCount(section);
              const pressure = waitlisted - seats;
              const pressureTone =
                pressure >= 4
                  ? "border-red-200 bg-red-50 text-red-700"
                  : pressure > 0
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700";

              return (
                <li key={`pressure-${section.id}`} className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {section.course.code} §{section.sectionCode}
                      </p>
                      <p className="text-xs text-slate-600">{section.term.name}</p>
                    </div>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${pressureTone}`}>
                      Pressure {pressure >= 0 ? `+${pressure}` : pressure}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                    <span>Waitlist {waitlisted}</span>
                    <span>Seats {seats}</span>
                  </div>
                  <div className="mt-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${
                          enrolledCount(section) / section.capacity >= 0.9 ? "bg-red-500"
                          : enrolledCount(section) / section.capacity >= 0.7 ? "bg-amber-400"
                          : "bg-emerald-400"
                        }`}
                        style={{ width: `${Math.min(100, section.capacity > 0 ? Math.round((enrolledCount(section) / section.capacity) * 100) : 0)}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {enrolledCount(section)}/{section.capacity} enrolled
                    </p>
                  </div>
                </li>
              );
            })}
            {highPressureSections.length === 0 ? (
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
                No waitlist pressure detected in current filters.
              </li>
            ) : null}
          </ul>
        </div>
      </section>

      <section className="campus-card overflow-hidden">
        <div className="max-h-[520px] overflow-auto rounded-xl">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">Term</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Course</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Section</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Schedule</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Flags</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Capacity</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Enrolled</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Waitlist</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Available</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Rating</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Promote</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? [1, 2, 3, 4].map((row) => (
                    <tr key={row} className="border-b border-slate-100">
                      <td colSpan={12} className="px-4 py-4">
                        <div className="animate-pulse space-y-2">
                          <div className="h-4 w-1/4 rounded bg-slate-200" />
                          <div className="h-4 w-1/2 rounded bg-slate-100" />
                        </div>
                      </td>
                    </tr>
                  ))
                : null}

              {!loading &&
                pagedSections.map((section) => {
                  const enrolled = enrolledCount(section);
                  const waitlisted = waitlistCount(section);
                  const seats = availableSeats(section);
                  const rowMessage = messageBySection[section.id];
                  const actionable = waitlisted > 0 && seats > 0;

                  return (
                    <Fragment key={section.id}>
                      <tr
                        id={`section-row-${section.id}`}
                        className={`border-b border-slate-100 align-top hover:bg-slate-100/60 ${
                          editingId === section.id ? "bg-blue-50/40 outline outline-1 outline-blue-200" :
                          actionable ? "bg-emerald-50/50" : "odd:bg-white even:bg-slate-50/40"
                        }`}
                      >
                        <td className="px-4 py-3 text-slate-700">{section.term.name}</td>
                        <td className="px-4 py-3">
                          <p className="text-slate-900">{section.course.code}</p>
                          <p className="text-xs text-slate-400">{section.instructorName}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-700">{section.sectionCode}</p>
                          {section.location ? <p className="text-xs text-slate-400">{section.location}</p> : null}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{formatMeetingTimes(section.meetingTimes)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                              section.modality === "ONLINE"
                                ? "border-violet-200 bg-violet-50 text-violet-700"
                                : section.modality === "HYBRID"
                                  ? "border-teal-200 bg-teal-50 text-teal-700"
                                  : "border-slate-200 bg-slate-50 text-slate-600"
                            }`}>
                              {section.modality === "ON_CAMPUS" ? "On Campus" : section.modality === "ONLINE" ? "Online" : "Hybrid"}
                            </span>
                            {section.requireApproval ? (
                              <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                                Approval
                              </span>
                            ) : null}
                            {waitlisted > 0 && seats > 0 ? (
                              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                Can promote
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {editingCapacity?.id === section.id ? (
                            <input
                              type="number"
                              min={1}
                              className="w-16 rounded border border-blue-300 px-1 text-sm"
                              value={editingCapacity.val}
                              onChange={(event) =>
                                setEditingCapacity((current) => (current ? { ...current, val: Number(event.target.value) } : null))
                              }
                              onBlur={() => void saveCapacityEdit(section.id, editingCapacity.val)}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") setEditingCapacity(null);
                                if (event.key === "Enter") {
                                  event.currentTarget.blur();
                                }
                              }}
                              autoFocus
                            />
                          ) : (
                            <span
                              onDoubleClick={() => setEditingCapacity({ id: section.id, val: section.capacity })}
                              className="cursor-pointer text-sm text-slate-700 hover:underline decoration-dotted"
                              title="Double-click to edit"
                            >
                              {enrolled}/{section.capacity}
                            </span>
                          )}
                          <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full transition-all ${
                                enrolled / section.capacity >= 0.9
                                  ? "bg-red-500"
                                  : enrolled / section.capacity >= 0.7
                                    ? "bg-amber-400"
                                    : "bg-emerald-400"
                              }`}
                              style={{ width: `${Math.min(100, section.capacity > 0 ? Math.round((enrolled / section.capacity) * 100) : 0)}%` }}
                            />
                          </div>
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {section.capacity > 0 ? Math.round((enrolled / section.capacity) * 100) : 0}% full
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            ENROLLED {enrolled}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                            WAITLISTED {waitlisted}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {seats} seats
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">{avgRating(section.ratings)}</td>
                        <td className="px-4 py-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={1}
                                aria-label={`Promotion count for ${section.course.code} section ${section.sectionCode}`}
                                value={countsBySection[section.id] ?? 1}
                                onChange={(event) => setRowCount(section.id, event.target.value)}
                                className="h-10 w-20 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                              />
                              <button
                                type="button"
                                onClick={() => promote(section.id)}
                                disabled={loadingBySection[section.id] || promotableCount(section) === 0}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
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
                            <p className="text-[11px] text-slate-500">
                              Recommended: {promotableCount(section)}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => openNotify(section.id)}
                              className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100"
                            >
                              📢 Notify
                            </button>
                            <button
                              type="button"
                              disabled={exportingRosterId === section.id}
                              onClick={() => void exportRoster(section)}
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                            >
                              {exportingRosterId === section.id ? "Exporting..." : "📋 Roster"}
                            </button>
                            <button
                              type="button"
                              onClick={() => editingId === section.id ? cancelEdit() : startEdit(section)}
                              className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                              {editingId === section.id ? "Cancel" : "Edit"}
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === section.id}
                              onClick={() => void onDeleteSection(section.id, `${section.course.code} §${section.sectionCode}`)}
                              className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                            >
                              {deletingId === section.id ? "…" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {notifyingSectionId === section.id ? (
                        <tr className="border-b border-slate-100 bg-white">
                          <td colSpan={12} className="px-4 pb-4">
                            <div className="mt-2 flex flex-col gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
                              <input
                                placeholder="Subject"
                                value={notifyForm.subject}
                                onChange={(event) => setNotifyForm((form) => ({ ...form, subject: event.target.value }))}
                                className="campus-input text-sm"
                              />
                              <textarea
                                placeholder="Message"
                                rows={3}
                                value={notifyForm.message}
                                onChange={(event) => setNotifyForm((form) => ({ ...form, message: event.target.value }))}
                                className="campus-input text-sm"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={notifySending || !notifyForm.subject.trim() || !notifyForm.message.trim()}
                                  onClick={() => void sendSectionNotification(section)}
                                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                >
                                  {notifySending ? "Sending…" : "Send"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setNotifyingSectionId(null)}
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {rowMessage ? (
                        <tr className="border-b border-slate-100 bg-white">
                          <td colSpan={12} className="px-4 pb-4">
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

              {!loading && visibleSections.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-slate-500">
                    No sections found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {visibleSections.length > PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 text-sm text-slate-600">
            <p>
              Showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, visibleSections.length)} of {visibleSections.length} sections
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

function MetricCard({
  label,
  value,
  tone
}: {
  label: string;
  value: string | number;
  tone: "slate" | "emerald" | "amber" | "blue";
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "blue"
          ? "border-blue-200 bg-blue-50 text-blue-900"
          : "border-slate-200 bg-white text-slate-900";

  return (
    <div className={`campus-kpi ${cls}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
