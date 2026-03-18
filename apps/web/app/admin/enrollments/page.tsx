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
  waitlistPosition: number | null;
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

type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

const STATUS_OPTIONS = ["ENROLLED", "WAITLISTED", "PENDING_APPROVAL", "DROPPED", "COMPLETED"];
const GRADE_OPTIONS = ["", "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];
const PAGE_SIZE = 50;

const STATUS_COLORS: Record<string, string> = {
  ENROLLED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  WAITLISTED: "border-amber-200 bg-amber-50 text-amber-700",
  PENDING_APPROVAL: "border-blue-200 bg-blue-50 text-blue-700",
  PENDING: "border-blue-200 bg-blue-50 text-blue-700",
  PendingApproval: "border-blue-200 bg-blue-50 text-blue-700",
  DROPPED: "border-red-200 bg-red-50 text-red-700",
  COMPLETED: "border-slate-200 bg-slate-100 text-slate-700",
};

function StatBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`flex flex-col items-center rounded-xl border px-4 py-3 ${color}`}>
      <span className="text-2xl font-bold">{count}</span>
      <span className="mt-0.5 text-xs font-semibold uppercase tracking-wide">{label}</span>
    </div>
  );
}

function gradeBadgeClass(finalGrade: string | null | undefined): string | null {
  const normalized = finalGrade?.trim().toUpperCase();
  if (!normalized) return null;
  const letter = normalized[0];
  if (letter === "A") {
    return "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700";
  }
  if (letter === "B") {
    return "inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700";
  }
  if (letter === "C") {
    return "inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700";
  }
  if (letter === "D" || letter === "F") {
    return "inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700";
  }
  return "inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-bold text-slate-700";
}

export default function EnrollmentsPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [rows, setRows] = useState<Enrollment[]>([]);
  const [total, setTotal] = useState(0);
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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

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

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (selectedTermId) params.set("termId", selectedTermId);
      if (statusFilter) params.set("status", statusFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);

      const result = await apiFetch<PaginatedResponse<Enrollment>>(`/admin/enrollments?${params.toString()}`);
      setRows(result.data);
      setTotal(result.total);
      setGradeState(Object.fromEntries(result.data.map((item) => [item.id, item.finalGrade || ""])));
      setStatusState(Object.fromEntries(result.data.map((item) => [item.id, item.status])));
      setSelectedById((prev) => {
        const next: Record<string, boolean> = {};
        for (const item of result.data) {
          if (prev[item.id]) next[item.id] = true;
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册记录加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTermId, statusFilter, debouncedSearch, page]);

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
      setNotice("注册状态已更新。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "状态更新失败");
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
      setNotice("最终成绩已保存。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "成绩更新失败");
    } finally {
      setSavingGradeId(null);
    }
  };

  const forceDrop = async (id: string) => {
    if (!window.confirm("确认强制退课？")) return;
    try {
      setSavingStatusId(id);
      setError("");
      setNotice("");
      await apiFetch(`/admin/enrollments/${id}`, {
        method: "DELETE"
      });
      setNotice("已强制退课。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "强制退课失败");
    } finally {
      setSavingStatusId(null);
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

  const visibleRows = rows;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = visibleRows;
  const pendingVisibleRows = useMemo(
    () => visibleRows.filter((row) => (statusState[row.id] ?? row.status) === "PENDING_APPROVAL"),
    [statusState, visibleRows]
  );

  const selectedPendingIds = useMemo(
    () => pendingVisibleRows.map((row) => row.id).filter((id) => selectedById[id]),
    [pendingVisibleRows, selectedById]
  );
  const allVisibleSelected = pendingVisibleRows.length > 0 && selectedPendingIds.length === pendingVisibleRows.length;

  const toggleSelectVisible = (checked: boolean) => {
    setSelectedById((prev) => {
      const next = { ...prev };
      for (const row of pendingVisibleRows) {
        if (checked) next[row.id] = true;
        else delete next[row.id];
      }
      return next;
    });
  };

  const toggleRow = (id: string, checked: boolean) => {
    const row = rows.find((item) => item.id === id);
    if ((statusState[id] ?? row?.status) !== "PENDING_APPROVAL") return;
    setSelectedById((prev) => {
      const next = { ...prev };
      if (checked) next[id] = true;
      else delete next[id];
      return next;
    });
  };

  const clearSelection = () => setSelectedById({});

  const bulkApproveSelected = async () => {
    if (selectedPendingIds.length === 0) return;
    try {
      setBulkSaving(true);
      setError("");
      setNotice("");
      const result = await apiFetch<{ approved: number }>("/admin/enrollments/bulk-approve", {
        method: "POST",
        body: JSON.stringify({ ids: selectedPendingIds })
      });
      setNotice(`Approved ${result.approved} pending enrollment(s).`);
      await load();
      clearSelection();
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量审批失败");
    } finally {
      setBulkSaving(false);
    }
  };

  const exportCsv = () => {
    const source = rows;
    const headers = ["学号", "姓名", "课程代码", "课程名称", "班级代码", "学分", "状态", "成绩", "学期"];
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
    if (selectedPendingIds.length === 0) return;
    const allowed = new Set(allowedCurrentStatuses);
    const targetIds = selectedPendingIds.filter((id) => {
      const current = statusState[id] ?? rows.find((row) => row.id === id)?.status ?? "";
      return allowed.has(current);
    });

    if (targetIds.length === 0) {
      setNotice("所选记录不符合此批量操作条件。");
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
        const code = rows.find((row) => row.id === id)?.section.course.code ?? "未知";
        const section = rows.find((row) => row.id === id)?.section.sectionCode ?? "";
        failed.push(`${code} ${section}`.trim());
        if (!error) {
          setError(err instanceof Error ? err.message : "批量更新失败");
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

  // Keep page in range after totals change
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  // Reset page on server-side filter changes
  useEffect(() => {
    setPage(1);
  }, [selectedTermId, statusFilter, debouncedSearch]);

  const selectedTerm = terms.find((t) => t.id === selectedTermId);
  const hasActiveFilters = Boolean(selectedTermId || statusFilter || debouncedSearch);

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">学籍管理</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">报名与成绩</h1>
            <p className="text-sm text-slate-600 md:text-base">
              调整注册状态、录入并发布已结课教学班的最终成绩。
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-emerald-300 bg-emerald-50 text-emerald-700">共 {total} 条</span>
              {(statusCounts.get("ENROLLED") ?? 0) > 0 && (
                <span className="campus-chip border-emerald-300 bg-emerald-50 text-emerald-700">
                  Enrolled {statusCounts.get("ENROLLED")}
                </span>
              )}
              {(statusCounts.get("WAITLISTED") ?? 0) > 0 && (
                <span className="campus-chip border-amber-300 bg-amber-50 text-amber-700">
                  Waitlisted {statusCounts.get("WAITLISTED")}
                </span>
              )}
              {(statusCounts.get("PENDING_APPROVAL") ?? 0) > 0 && (
                <span className="campus-chip border-blue-300 bg-blue-50 text-blue-700">
                  Pending approval {statusCounts.get("PENDING_APPROVAL")}
                </span>
              )}
              <span className="campus-chip border-slate-300 bg-slate-100 text-slate-700">显示 {rows.length} 条</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={rows.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50"
            >
              ↓ CSV 导出
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

      {/* Term selector + summary */}
      <section className="campus-card p-5 md:p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              按学期筛选
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
              <option value="">全部学期</option>
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
        {total > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatBadge label="在读" count={statusCounts.get("ENROLLED") ?? 0} color="border-emerald-200 bg-emerald-50 text-emerald-800" />
            <StatBadge label="候补" count={statusCounts.get("WAITLISTED") ?? 0} color="border-amber-200 bg-amber-50 text-amber-800" />
            <StatBadge label="待审批" count={statusCounts.get("PENDING_APPROVAL") ?? 0} color="border-blue-200 bg-blue-50 text-blue-800" />
            <StatBadge label="已结课" count={statusCounts.get("COMPLETED") ?? 0} color="border-slate-200 bg-slate-50 text-slate-700" />
            <StatBadge label="已退课" count={statusCounts.get("DROPPED") ?? 0} color="border-red-200 bg-red-50 text-red-700" />
            <StatBadge label="总学分" count={totalCredits} color="border-violet-200 bg-violet-50 text-violet-800" />
          </div>
        )}
      </section>

      <section className="campus-toolbar">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">搜索</span>
            <input
              ref={searchRef}
              className="campus-input"
              placeholder="学生姓名、学号、课程代码、班级…  [/]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="flex flex-col">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">状态</span>
            <select
              className="campus-select h-10"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">全部状态</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={() => toggleSelectVisible(true)}
              disabled={bulkSaving || pendingVisibleRows.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Select All Pending
            </button>
            <button
              type="button"
              onClick={() => void bulkApproveSelected()}
              disabled={bulkSaving || selectedPendingIds.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkSaving ? <span className="size-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" /> : null}
              Approve Selected
            </button>
            <button
              type="button"
              onClick={() => void bulkSetStatus("DROPPED", ["ENROLLED", "PENDING_APPROVAL", "WAITLISTED"])}
              disabled={bulkSaving || selectedPendingIds.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bulkSaving ? <span className="size-3.5 animate-spin rounded-full border-2 border-red-300 border-t-red-700" /> : null}
              Batch Drop
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedPendingIds.length === 0}
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Showing {rows.length} of {total} · Pending selected: {selectedPendingIds.length}
        </p>
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      <section className="campus-card overflow-hidden">
        <div className="max-h-[600px] overflow-auto rounded-3xl">
          <table className="hidden w-full border-collapse text-sm md:table">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) => toggleSelectVisible(event.target.checked)}
                    disabled={pendingVisibleRows.length === 0}
                    className="size-4 accent-slate-900"
                    aria-label="全选当前待审批注册"
                  />
                </th>
                <th className="px-4 py-3 font-semibold text-slate-700">学生</th>
                <th className="px-4 py-3 font-semibold text-slate-700">课程 / 教学班</th>
                {!selectedTermId && (
                  <th className="px-4 py-3 font-semibold text-slate-700">学期</th>
                )}
                <th className="px-4 py-3 font-semibold text-slate-700">状态</th>
                <th className="px-4 py-3 font-semibold text-slate-700">最终成绩</th>
                <th className="px-4 py-3 font-semibold text-slate-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    加载注册数据中...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <p className="text-3xl">📋</p>
                    <p className="mt-2 text-sm font-medium text-slate-600">
                      {hasActiveFilters ? "没有符合筛选条件的注册记录" : "暂无注册记录"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {hasActiveFilters
                        ? "请尝试调整搜索或筛选条件。"
                        : "学生注册后，报名记录将在此显示。"}
                    </p>
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
                        disabled={(statusState[row.id] ?? row.status) !== "PENDING_APPROVAL"}
                        className="size-4 accent-slate-900"
                        aria-label={`选中注册记录 ${row.id}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      <p className="font-medium">{row.student.studentProfile?.legalName || "-"}</p>
                      <p className="text-xs text-slate-500">{row.student.studentId || "无学号"}</p>
                      <p className="text-[10px] text-slate-400">{new Date(row.createdAt).toLocaleDateString()}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <p className="font-medium">{row.section.course.code} · {row.section.sectionCode}</p>
                      <p className="text-xs text-slate-500">{row.section.course.title}</p>
                      <p className="text-xs text-slate-400">{row.section.course.credits} cr</p>
                    </td>
                    {!selectedTermId && (
                      <td className="px-4 py-3 text-xs text-slate-500">{row.term?.name ?? "—"}</td>
                    )}
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[statusState[row.id] ?? row.status] ?? "border-slate-200 bg-slate-100 text-slate-700"}`}>
                        {statusState[row.id] ?? row.status}
                      </span>
                      {(statusState[row.id] ?? row.status) === "WAITLISTED" && row.waitlistPosition !== null && (
                        <p className="mt-0.5 text-[10px] text-amber-700">#{row.waitlistPosition} in queue</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-2">
                        {gradeBadgeClass(row.finalGrade) ? (
                          <span className={gradeBadgeClass(row.finalGrade) || ""}>
                            {row.finalGrade?.trim().toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                        <select
                          className="campus-select h-9 w-24 text-xs"
                          value={gradeState[row.id] || ""}
                          onChange={(e) => setGradeState((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        >
                          {GRADE_OPTIONS.map((grade) => (
                            <option key={grade || "blank"} value={grade}>
                              {grade || "—"}
                            </option>
                          ))}
                        </select>
                      </div>
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
                          ) : "保存"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void updateGrade(row.id)}
                          disabled={savingGradeId === row.id || !(gradeState[row.id] || "").trim()}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                        >
                          {savingGradeId === row.id ? (
                            <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          ) : "录入成绩"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void forceDrop(row.id)}
                          disabled={savingStatusId === row.id || row.status === "DROPPED"}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                        >
                          {savingStatusId === row.id ? (
                            <span className="size-3.5 animate-spin rounded-full border-2 border-red-300 border-t-red-700" />
                          ) : "强制退课"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-4 md:hidden">
          {loading ? (
            <div className="campus-card p-4 text-sm text-slate-500">加载注册数据中...</div>
          ) : rows.length === 0 ? (
            <div className="campus-card p-4 text-sm text-slate-500">
              {hasActiveFilters ? "没有符合筛选条件的注册记录。" : "暂无注册记录。"}
            </div>
          ) : (
            pagedRows.map((row) => (
              <div key={row.id} className="campus-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {row.student.studentProfile?.legalName || "-"}
                    </p>
                    <p className="text-xs text-slate-500">{row.student.studentId || "无学号"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.section.course.code} · {row.section.sectionCode}
                    </p>
                    {!selectedTermId ? (
                      <p className="text-[11px] text-slate-400">{row.term?.name ?? "—"}</p>
                    ) : null}
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedById[row.id])}
                    onChange={(event) => toggleRow(row.id, event.target.checked)}
                    disabled={(statusState[row.id] ?? row.status) !== "PENDING_APPROVAL"}
                    className="mt-1 size-4 accent-slate-900"
                    aria-label={`选中注册记录 ${row.id}`}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[statusState[row.id] ?? row.status] ?? "border-slate-200 bg-slate-100 text-slate-700"}`}>
                    {statusState[row.id] ?? row.status}
                  </span>
                  {gradeBadgeClass(row.finalGrade) ? (
                    <span className={gradeBadgeClass(row.finalGrade) || ""}>
                      {row.finalGrade?.trim().toUpperCase()}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300">暂无成绩</span>
                  )}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <select
                    className="campus-select h-9 text-xs"
                    value={statusState[row.id] || row.status}
                    onChange={(e) => setStatusState((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <select
                    className="campus-select h-9 text-sm"
                    value={gradeState[row.id] || ""}
                    onChange={(e) => setGradeState((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  >
                    {GRADE_OPTIONS.map((grade) => (
                      <option key={grade || "blank"} value={grade}>
                        {grade || "—"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void updateStatus(row.id)}
                    disabled={savingStatusId === row.id}
                    className="flex-1 rounded-lg border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {savingStatusId === row.id ? "保存中…" : "保存状态"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateGrade(row.id)}
                    disabled={savingGradeId === row.id || !(gradeState[row.id] || "").trim()}
                    className="flex-1 rounded-lg bg-primary py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {savingGradeId === row.id ? "保存中…" : "保存成绩"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void forceDrop(row.id)}
                    disabled={savingStatusId === row.id || row.status === "DROPPED"}
                    className="flex-1 rounded-lg border border-red-200 bg-red-50 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                  >
                    {savingStatusId === row.id ? "退课中…" : "强制退课"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 text-sm text-slate-600">
            <p>
              Showing {total === 0 ? 0 : ((safePage - 1) * PAGE_SIZE) + 1}–{Math.min((safePage - 1) * PAGE_SIZE + rows.length, total)} of {total} records
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
