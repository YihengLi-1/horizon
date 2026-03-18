"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import AuditExportButton from "./AuditExportButton";

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

const PAGE_SIZE = 50;

function actionTone(action: string): string {
  const normalized = action.toUpperCase();
  if (normalized.includes("LOGIN") || normalized.includes("LOGOUT")) return "border-slate-200 bg-slate-50 text-slate-700";
  if (normalized.includes("CREATE")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized.includes("UPDATE")) return "border-blue-200 bg-blue-50 text-blue-700";
  if (normalized.includes("DELETE")) return "border-red-200 bg-red-50 text-red-700";
  if (normalized.includes("NOTIFY")) return "border-violet-200 bg-violet-50 text-violet-700";
  if (normalized.includes("ENROLL") || normalized.includes("DROP") || normalized.includes("WAITLIST") || normalized.includes("REGISTRATION")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function AuditLogsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actionFilter, setActionFilter] = useState(searchParams.get("action") ?? "");
  const [entityFilter, setEntityFilter] = useState("");
  const [page, setPage] = useState(1);
  const [todayLabel, setTodayLabel] = useState("");
  const [integrityResult, setIntegrityResult] = useState<{ ok: boolean; checked: number; brokenAtId?: string; reason?: string } | null>(null);
  const [integrityChecking, setIntegrityChecking] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setTodayLabel(new Date().toLocaleDateString("zh-CN"));
  }, []);

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
      setError(err instanceof Error ? err.message : "加载审计日志失败");
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

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (actionFilter) params.set("action", actionFilter);
    else params.delete("action");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [actionFilter, pathname, router, searchParams]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageStart = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const pageEnd = total === 0 ? 0 : Math.min((safePage - 1) * PAGE_SIZE + logs.length, total);

  const actions = useMemo(() => Array.from(new Set(logs.map((l) => l.action))).sort(), [logs]);
  const entityTypes = useMemo(() => Array.from(new Set(logs.map((l) => l.entityType))).sort(), [logs]);

  const pageStats = useMemo(() => {
    const actorSet = new Set<string>();
    const actionCount = new Map<string, number>();
    for (const log of logs) {
      const actor = log.actor?.email || log.actor?.studentId || "system";
      actorSet.add(actor);
      actionCount.set(log.action, (actionCount.get(log.action) ?? 0) + 1);
    }
    const topAction = [...actionCount.entries()].sort((a, b) => b[1] - a[1])[0];
    return { uniqueActors: actorSet.size, topAction: topAction?.[0] ?? "-" };
  }, [logs]);

  return (
    <div className="campus-page dark:bg-gray-900">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">运营可视化</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">审计日志</h1>
            <p className="text-sm text-slate-600 md:text-base">
              记录用户操作与管理行为，涵盖登录、注册、成绩录入、候补等全流程审计轨迹。
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{total} 条匹配</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">第 {safePage} / {totalPages} 页</span>
              {todayLabel ? (
                <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">
                  截至 {todayLabel}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2">
            <AuditExportButton
              rows={logs.map((log) => ({
                createdAt: new Date(log.createdAt).toISOString(),
                action: log.action,
                entityType: log.entityType,
                entityId: log.entityId ?? "",
                actorLabel: log.actor?.email || log.actor?.studentId || "system"
              }))}
            />
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
            >
              刷新
            </button>
            <button
              type="button"
              disabled={integrityChecking}
              onClick={async () => {
                setIntegrityChecking(true);
                setIntegrityResult(null);
                try {
                  const r = await apiFetch<{ ok: boolean; checked: number; brokenAtId?: string; reason?: string }>("/admin/audit-logs/integrity");
                  setIntegrityResult(r);
                } catch {
                  setIntegrityResult({ ok: false, checked: 0, reason: "请求失败" });
                } finally {
                  setIntegrityChecking(false);
                }
              }}
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white disabled:opacity-50"
            >
              {integrityChecking ? "验证中…" : "验证完整性"}
            </button>
          </div>
        </div>
      </section>

      {integrityResult ? (
        <section className={`rounded-xl border px-4 py-3 text-sm ${integrityResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {integrityResult.ok
            ? `✓ 哈希链完整，已验证 ${integrityResult.checked} 条记录。`
            : `✗ 完整性校验失败：${integrityResult.reason ?? "未知错误"}${integrityResult.brokenAtId ? `（ID: ${integrityResult.brokenAtId}）` : ""}`}
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="campus-kpi border-slate-200 bg-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">匹配记录</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{total.toLocaleString()}</p>
        </div>
        <div className="campus-kpi border-slate-200 bg-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">本页</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{logs.length}</p>
          <p className="mt-0.5 text-xs text-slate-500">第 {safePage} / {totalPages} 页</p>
        </div>
        <div className="campus-kpi border-blue-200 bg-blue-50/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">唯一操作者</p>
          <p className="mt-1 text-2xl font-semibold text-blue-900">{pageStats.uniqueActors}</p>
          <p className="mt-0.5 text-xs text-blue-600">本页</p>
        </div>
        <div className="campus-kpi border-violet-200 bg-violet-50/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">最频繁操作</p>
          <p className="mt-1 truncate text-lg font-semibold text-violet-900">{pageStats.topAction}</p>
          <p className="mt-0.5 text-xs text-violet-600">本页最多</p>
        </div>
      </section>

      <section className="campus-toolbar">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">搜索</span>
            <input
              ref={searchRef}
              className="campus-input"
              placeholder="操作者、操作类型、实体ID...  [/]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">操作类型</span>
            <select className="campus-select" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">全部操作</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">实体类型</span>
            <select className="campus-select" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="">全部实体</option>
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
            清除筛选
          </button>
        ) : null}
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="campus-card overflow-hidden dark:border-gray-700">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 dark:bg-gray-800">
            <tr className="border-b border-slate-200 text-left">
              <th className="px-4 py-3 font-semibold text-slate-700 dark:border-gray-700 dark:text-gray-100">时间</th>
              <th className="px-4 py-3 font-semibold text-slate-700 dark:border-gray-700 dark:text-gray-100">操作者</th>
              <th className="px-4 py-3 font-semibold text-slate-700 dark:border-gray-700 dark:text-gray-100">操作</th>
              <th className="px-4 py-3 font-semibold text-slate-700 dark:border-gray-700 dark:text-gray-100">实体类型</th>
              <th className="px-4 py-3 font-semibold text-slate-700 dark:border-gray-700 dark:text-gray-100">实体ID</th>
            </tr>
          </thead>
          <tbody>
              {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">加载审计日志中...</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <p className="text-3xl">📋</p>
                  <p className="mt-2 text-sm font-medium text-slate-600">暂无审计日志</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {actionFilter || entityFilter || debouncedSearch
                      ? "请调整搜索词或筛选条件。"
                      : "用户操作后，审计记录将在此显示。"}
                  </p>
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
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${actionTone(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{log.entityType}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500" title={log.entityId ?? undefined}>{log.entityId ? log.entityId.slice(0, 8) + "…" : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {!loading && total > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              共 <span className="font-medium text-slate-700">{total}</span> 条记录，显示第{" "}
              <span className="font-medium text-slate-700">{pageStart}–{pageEnd}</span> 条
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
