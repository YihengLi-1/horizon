"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ConfirmDialog } from "@/components/confirm-dialog";

type WaitlistRow = {
  id: string;
  waitlistPosition: number | null;
  createdAt: string;
  student: {
    studentId: string | null;
    studentProfile?: { legalName?: string };
  };
  section: {
    id: string;
    sectionCode: string;
    capacity: number;
    term?: { name: string };
    course: { code: string; title: string };
  };
};

type PromoteResponse = {
  promotedCount: number;
  remainingWaitlistCount: number;
  availableSeatsBefore: number;
  availableSeatsAfter: number;
};

type SectionMessage = {
  type: "success" | "error";
  text: string;
};

export default function WaitlistPage() {
  const [rows, setRows] = useState<WaitlistRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [promotingSectionId, setPromotingSectionId] = useState<string | null>(null);
  const [promoteCount, setPromoteCount] = useState(1);
  const [bulkPromoting, setBulkPromoting] = useState(false);
  const [bulkNotice, setBulkNotice] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [messageBySection, setMessageBySection] = useState<Record<string, SectionMessage>>({});
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("ALL");
  const searchRef = useRef<HTMLInputElement>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

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

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<WaitlistRow[]>("/admin/waitlist");
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载候补名单失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const promote = async (sectionId: string, count: number = promoteCount) => {
    try {
      setPromotingSectionId(sectionId);
      setBulkNotice("");
      setBulkError("");
      setMessageBySection((prev) => { const n = { ...prev }; delete n[sectionId]; return n; });
      const response = await apiFetch<PromoteResponse>("/admin/waitlist/promote", {
        method: "POST",
        body: JSON.stringify({ sectionId, count })
      });
      setMessageBySection((prev) => ({
        ...prev,
        [sectionId]: {
          type: "success",
          text: `已晋升 ${response.promotedCount} 人，剩余候补 ${response.remainingWaitlistCount}，余位 ${response.availableSeatsBefore}→${response.availableSeatsAfter}`
        }
      }));
      await load();
    } catch (err) {
      setMessageBySection((prev) => ({
        ...prev,
        [sectionId]: { type: "error", text: err instanceof Error ? err.message : "晋升失败" }
      }));
    } finally {
      setPromotingSectionId(null);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, WaitlistRow[]>();
    for (const row of rows) {
      const key = `${row.section.id}::${row.section.course.code}::${row.section.sectionCode}`;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .map(([key, list]) => {
        const [sectionId, courseCode, sectionCode] = key.split("::");
        const title = list[0]?.section.course.title ?? "";
        return {
          sectionId,
          courseCode,
          sectionCode,
          title,
          items: list.sort((a, b) => (a.waitlistPosition ?? 9999) - (b.waitlistPosition ?? 9999))
        };
      })
      .sort((a, b) => {
        if (b.items.length !== a.items.length) return b.items.length - a.items.length;
        return `${a.courseCode}${a.sectionCode}`.localeCompare(`${b.courseCode}${b.sectionCode}`);
      });
  }, [rows]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return grouped.filter((group) => {
      const matchesSection = sectionFilter === "ALL" || group.sectionId === sectionFilter;
      const matchesSearch =
        !q ||
        `${group.courseCode} ${group.sectionCode} ${group.title}`.toLowerCase().includes(q) ||
        group.items.some((item) =>
          `${item.student.studentProfile?.legalName ?? ""} ${item.student.studentId ?? ""}`.toLowerCase().includes(q)
        );
      return matchesSection && matchesSearch;
    });
  }, [grouped, search, sectionFilter]);

  const totalWaitlisted = rows.length;
  const avgQueueDepth = grouped.length > 0
    ? (totalWaitlisted / grouped.length).toFixed(1)
    : "0.0";
  const longestQueue = grouped.length > 0
    ? Math.max(...grouped.map((g) => g.items.length))
    : 0;

  const promoteAll = async () => {
    if (filteredGroups.length === 0) return;
    setBulkPromoting(true);
    setBulkNotice("");
    setBulkError("");
    setMessageBySection({});
    let totalPromoted = 0;
    let failures = 0;

    for (const group of filteredGroups) {
      try {
        const response = await apiFetch<PromoteResponse>("/admin/waitlist/promote", {
          method: "POST",
          body: JSON.stringify({ sectionId: group.sectionId, count: 1 })
        });
        totalPromoted += response.promotedCount;
        setMessageBySection((prev) => ({
          ...prev,
          [group.sectionId]: {
            type: "success",
            text: `已晋升 ${response.promotedCount} 人，剩余候补 ${response.remainingWaitlistCount}`
          }
        }));
      } catch {
        failures += 1;
        setMessageBySection((prev) => ({
          ...prev,
          [group.sectionId]: { type: "error", text: "晋升失败" }
        }));
      }
    }

    if (failures > 0) {
      setBulkError(`已晋升 ${totalPromoted} 人，涉及 ${filteredGroups.length - failures} 个队列，${failures} 个队列失败。`);
    } else {
      setBulkNotice(`已批量晋升 ${totalPromoted} 人，涉及 ${filteredGroups.length} 个队列。`);
    }
    setBulkPromoting(false);
    await load();
  };

  const exportCsv = () => {
    const csvRows = [
      ["排队位置", "学生姓名", "学号", "课程代码", "班级", "课程名称"],
      ...rows.map((row) => [
        row.waitlistPosition !== null ? String(row.waitlistPosition) : "",
        row.student.studentProfile?.legalName ?? "",
        row.student.studentId ?? "",
        row.section.course.code,
        row.section.sectionCode,
        row.section.course.title
      ])
    ];
    const csv = csvRows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">候补队列</p>
            <h1 className="campus-title">候补名单</h1>
            <p className="campus-subtitle">按顺序查看候补队列，当已注册席位空出时将下一位学生晋升。</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-amber-300 bg-amber-50 text-amber-700">{totalWaitlisted} 人候补</span>
              <span className="campus-chip border-blue-300 bg-blue-50 text-blue-700">{grouped.length} 个候补队列</span>
              {longestQueue >= 5 && (
                <span className="campus-chip border-red-300 bg-red-50 text-red-700">⚠ 最长队列：{longestQueue}</span>
              )}
              {filteredGroups.length !== grouped.length ? (
                <span className="campus-chip border-slate-300 bg-slate-50 text-slate-500">显示 {filteredGroups.length} 个</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setConfirmState({
                title: "批量晋升候补",
                message: `确认将 ${filteredGroups.length} 个候补队列各晋升 1 人？此操作将立即生效，不可撤销。`,
                onConfirm: () => { setConfirmState(null); void promoteAll(); },
              })}
              disabled={bulkPromoting || filteredGroups.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkPromoting ? (
                <><span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />晋升全部</>
              ) : `每队晋升 1 人（共 ${filteredGroups.length} 队）`}
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={rows.length === 0}
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              CSV 导出
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
            >
              刷新
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="campus-kpi border-amber-200 bg-amber-50/60">
          <p className="text-xs font-semibold text-amber-700">候补总数</p>
          <p className="campus-kpi-value text-amber-900">{totalWaitlisted}</p>
          <p className="text-[11px] text-amber-500">覆盖所有教学班</p>
        </div>
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold text-slate-500">有候补队列的班级</p>
          <p className="campus-kpi-value">{grouped.length}</p>
        </div>
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold text-slate-500">平均队列深度</p>
          <p className="campus-kpi-value">{avgQueueDepth}</p>
          <p className="text-[11px] text-slate-400">人/班</p>
        </div>
        <div className={`campus-kpi ${longestQueue >= 5 ? "border-red-200 bg-red-50/60" : "border-slate-200"}`}>
          <p className={`text-xs font-semibold ${longestQueue >= 5 ? "text-red-600" : "text-slate-500"}`}>
            最长队列
          </p>
          <p className={`campus-kpi-value ${longestQueue >= 5 ? "text-red-800" : "text-slate-900"}`}>
            {longestQueue}
          </p>
          <p className="text-[11px] text-slate-400">最深队列中的学生人数</p>
        </div>
      </section>

      <section className="campus-toolbar">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-48">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">搜索</span>
            <input
              ref={searchRef}
              className="campus-input"
              placeholder="课程、班级、学生姓名或学号…  [/]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">
              晋升人数
            </label>
            <select
              className="campus-select w-32"
              value={promoteCount}
              onChange={(e) => setPromoteCount(Number(e.target.value))}
            >
              <option value={1}>1 人</option>
              <option value={2}>2 人</option>
              <option value={3}>3 人</option>
              <option value={5}>5 人</option>
              <option value={10}>10 人</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">
              班级筛选
            </label>
            <select
              className="campus-select w-48"
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
            >
              <option value="ALL">全部班级</option>
              {grouped.map((group) => (
                <option key={group.sectionId} value={group.sectionId}>
                  {group.courseCode} §{group.sectionCode}
                </option>
              ))}
            </select>
          </div>
        </div>
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="mt-2 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
          >
            清除搜索
          </button>
        ) : null}
        {sectionFilter !== "ALL" ? (
          <button
            type="button"
            onClick={() => setSectionFilter("ALL")}
            className="mt-2 ml-3 text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
          >
            清除班级筛选
          </button>
        ) : null}
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
      {bulkError ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {bulkError}
        </div>
      ) : null}
      {bulkNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {bulkNotice}
        </div>
      ) : null}

      <section className="space-y-4">
        {loading ? (
          <div className="campus-card px-4 py-8 text-center text-slate-500">加载候补名单中…</div>
        ) : filteredGroups.length === 0 ? (
          <div className="campus-card px-5 py-12 text-center">
            <p className="text-3xl">{grouped.length === 0 ? "✅" : "🔍"}</p>
            <p className="mt-3 text-base font-semibold text-slate-700">
              {grouped.length === 0 ? "一切正常 — 暂无候补" : "没有匹配的候补队列"}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {grouped.length === 0
                ? "所有学生均已在读，或无待处理候补。"
                : "请调整搜索词以查找目标队列。"}
            </p>
          </div>
        ) : (
          filteredGroups.map((group) => {
            const msg = messageBySection[group.sectionId];
            return (
              <article key={group.sectionId} className="campus-card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-heading text-lg font-semibold text-slate-900">
                        {group.courseCode} §{group.sectionCode}
                      </h2>
                      {group.items[0]?.section.term?.name ? (
                        <span className="campus-chip border-slate-300 bg-white text-slate-600 text-[11px]">
                          {group.items[0].section.term.name}
                        </span>
                      ) : null}
                      <span className={`campus-chip text-[11px] ${group.items.length >= 5 ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                        {group.items.length} 在候补中
                      </span>
                      {group.items[0]?.section.capacity ? (
                        <span className="campus-chip border-slate-200 bg-white text-slate-500 text-[11px]">
                          容量 {group.items[0].section.capacity}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{group.title}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {group.items[0]?.section.capacity ? (
                      <div className="hidden sm:flex flex-col items-end gap-0.5">
                        <p className="text-[10px] text-slate-400">候补/容量</p>
                        <div className="flex items-center gap-1.5">
                          <div className="w-20 overflow-hidden rounded-full bg-slate-200" style={{ height: 5 }}>
                            <div
                              className={`h-full rounded-full ${
                                group.items.length / group.items[0].section.capacity >= 0.5
                                  ? "bg-red-500"
                                  : group.items.length / group.items[0].section.capacity >= 0.25
                                  ? "bg-amber-400"
                                  : "bg-slate-400"
                              }`}
                              style={{ width: `${Math.min(100, Math.round((group.items.length / group.items[0].section.capacity) * 100))}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-medium text-slate-500">
                            {group.items.length}/{group.items[0].section.capacity}
                          </span>
                        </div>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void promote(group.sectionId, promoteCount)}
                      disabled={promotingSectionId === group.sectionId || bulkPromoting}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                    >
                      {promotingSectionId === group.sectionId ? (
                        <>
                          <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          晋升中
                        </>
                      ) : (
                        `晋升 ${promoteCount} 人`
                      )}
                    </button>
                  </div>
                </div>

                {msg ? (
                  <div
                    role={msg.type === "error" ? "alert" : "status"}
                    aria-live={msg.type === "error" ? "assertive" : "polite"}
                    className={`border-b px-4 py-2 text-sm ${msg.type === "success" ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-red-100 bg-red-50 text-red-800"}`}
                  >
                    {msg.text}
                  </div>
                ) : null}

                <p className="px-4 pt-3 text-xs text-slate-500 md:hidden">提示：横向滑动可查看所有列。</p>
                <div className="overflow-auto">
                  <table className="min-w-[560px] w-full border-collapse text-sm">
                    <thead className="bg-slate-50 text-left">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-2 text-xs font-semibold text-slate-500">排队位置</th>
                        <th className="px-4 py-2 text-xs font-semibold text-slate-500">学生</th>
                        <th className="px-4 py-2 text-xs font-semibold text-slate-500">学号</th>
                        <th className="px-4 py-2 text-xs font-semibold text-slate-500">等待自</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((row) => {
                        const isNext = row.waitlistPosition === 1;
                        const daysSince = row.createdAt
                          ? Math.floor((Date.now() - new Date(row.createdAt).getTime()) / 86_400_000)
                          : null;
                        return (
                          <tr key={row.id} className={`border-b border-slate-100 ${isNext ? "bg-emerald-50/50" : "odd:bg-white even:bg-slate-50/30"}`}>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex h-7 min-w-[28px] items-center justify-center rounded-full px-2 text-xs font-semibold ${
                                isNext ? "bg-emerald-200 text-emerald-900" : "bg-slate-100 text-slate-700"
                              }`}>
                                #{row.waitlistPosition ?? "—"}
                              </span>
                              {isNext ? <span className="ml-1.5 text-[10px] font-semibold text-emerald-700">下一位</span> : null}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-slate-800">{row.student.studentProfile?.legalName || "—"}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{row.student.studentId || "—"}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-500">
                              {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}
                              {daysSince !== null ? (
                                <span className={`ml-1.5 ${daysSince > 14 ? "text-amber-600 font-medium" : "text-slate-400"}`}>
                                  （{daysSince}天）
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })
        )}
      </section>
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
