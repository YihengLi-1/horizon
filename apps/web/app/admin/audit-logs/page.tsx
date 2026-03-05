"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type AuditLog = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor?: {
    email?: string;
    studentId?: string | null;
  } | null;
};

type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

const ACTION_COLORS: Record<string, string> = {
  login: "border-blue-200 bg-blue-50 text-blue-700",
  admin_crud: "border-slate-200 bg-slate-100 text-slate-700",
  grade_update: "border-emerald-200 bg-emerald-50 text-emerald-700",
  promote_waitlist: "border-amber-200 bg-amber-50 text-amber-700",
  registration_submit: "border-violet-200 bg-violet-50 text-violet-700",
  drop: "border-red-200 bg-red-50 text-red-700",
  password_change: "border-orange-200 bg-orange-50 text-orange-700",
};

const PAGE_SIZE = 50;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Press "/" to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        document.activeElement?.tagName !== "SELECT"
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (actionFilter) params.set("action", actionFilter);
      if (entityFilter) params.set("entityType", entityFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);

      const data = await apiFetch<PaginatedResponse<AuditLog>>(`/admin/audit-logs?${params.toString()}`);
      setLogs(data.data);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, actionFilter, entityFilter, debouncedSearch]);

  // Reset page on filter changes
  useEffect(() => {
    setPage(1);
  }, [actionFilter, entityFilter, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageStart = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const pageEnd = total === 0 ? 0 : Math.min((safePage - 1) * PAGE_SIZE + logs.length, total);

  const actions = useMemo(() => Array.from(new Set(logs.map((l) => l.action))).sort(), [logs]);
  const entityTypes = useMemo(() => Array.from(new Set(logs.map((l) => l.entityType))).sort(), [logs]);

  const exportCsv = () => {
    const rows = [
      ["Timestamp", "Actor", "Action", "Entity Type", "Entity ID"],
      ...logs.map((log) => [
        new Date(log.createdAt).toISOString(),
        log.actor?.email || log.actor?.studentId || "system",
        log.action,
        log.entityType,
        log.entityId ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-page-${safePage}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Operational Visibility</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">Audit Logs</h1>
            <p className="text-sm text-slate-600 md:text-base">
              Track user actions and administrative operations across authentication, enrollment, grading, and waitlist workflows.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{total} matched events</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">Page {safePage} / {totalPages}</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">
                As of {new Date().toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={logs.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export CSV (Page)
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

      <section className="campus-toolbar">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
            <input
              ref={searchRef}
              className="campus-input"
              placeholder="Actor, action, entity ID...  [/]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Action type</span>
            <select className="campus-select" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">All actions</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Entity type</span>
            <select className="campus-select" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="">All entities</option>
              {entityTypes.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
        </div>
        {(search || actionFilter || entityFilter) ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setActionFilter("");
              setEntityFilter("");
              setPage(1);
            }}
            className="mt-2 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
          >
            Clear filters
          </button>
        ) : null}
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="campus-card overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200 text-left">
              <th className="px-4 py-3 font-semibold text-slate-700">Time</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Actor</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Action</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Entity</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Entity ID</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading audit logs...</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  No logs match current filters.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/60">
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <p>{new Date(log.createdAt).toLocaleDateString()}</p>
                    <p className="text-slate-400">{new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{log.actor?.email || log.actor?.studentId || "system"}</td>
                  <td className="px-4 py-3 text-slate-800">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ACTION_COLORS[log.action] ?? "border-slate-200 bg-slate-50 text-slate-700"}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{log.entityType}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{log.entityId ? log.entityId.slice(0, 8) + "..." : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              Showing <span className="font-medium text-slate-700">{pageStart}–{pageEnd}</span> of{" "}
              <span className="font-medium text-slate-700">{total}</span> events
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ‹
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const half = 3;
                let start = Math.max(1, safePage - half);
                const end = Math.min(totalPages, start + 6);
                start = Math.max(1, end - 6);
                const p = start + i;
                if (p > totalPages) return null;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-semibold transition ${
                      p === safePage
                        ? "border-slate-800 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
