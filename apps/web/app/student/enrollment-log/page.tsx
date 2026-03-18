"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type LogRow = {
  auditId: string;
  createdAt: string;
  action: string;
  courseCode: string;
  courseTitle: string;
  sectionCode: string;
  termName: string;
};

const ACTION_STYLE: (action: string) => { label: string; cls: string } = (action) => {
  const upper = action.toUpperCase();
  if (upper.includes("DROP")) return { label: "退课", cls: "border-red-200 bg-red-50 text-red-700" };
  if (upper.includes("WAITLIST")) return { label: "加入候补", cls: "border-amber-200 bg-amber-50 text-amber-700" };
  if (upper.includes("ENROLL") || upper.includes("REGISTER")) return { label: "选课", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  return { label: action, cls: "border-slate-200 bg-slate-50 text-slate-600" };
};

export default function EnrollmentLogPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    void apiFetch<LogRow[]>("/students/enrollment-log")
      .then((d) => setRows(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      const matchQ = !q || r.courseCode.toLowerCase().includes(q) || r.courseTitle.toLowerCase().includes(q) || r.termName.toLowerCase().includes(q);
      const matchAction = !actionFilter || r.action.toUpperCase().includes(actionFilter.toUpperCase());
      return matchQ && matchAction;
    });
  }, [rows, search, actionFilter]);

  const enrollCount = rows.filter((r) => r.action.toUpperCase().includes("ENROLL")).length;
  const dropCount = rows.filter((r) => r.action.toUpperCase().includes("DROP")).length;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">注册记录</p>
        <h1 className="campus-hero-title">选课操作日志</h1>
        <p className="campus-hero-subtitle">您的所有选课与退课操作记录</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">总操作数</p>
          <p className="campus-kpi-value">{loading ? "—" : rows.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">选课次数</p>
          <p className="campus-kpi-value text-emerald-600">{loading ? "—" : enrollCount}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">退课次数</p>
          <p className="campus-kpi-value text-red-500">{loading ? "—" : dropCount}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="campus-toolbar">
        <input
          className="campus-input max-w-xs"
          placeholder="搜索课程或学期…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="campus-select w-36" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
          <option value="">全部操作</option>
          <option value="ENROLL">选课</option>
          <option value="DROP">退课</option>
          <option value="WAITLIST">候补</option>
        </select>
      </div>

      <section className="campus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 text-left">时间</th>
                <th className="px-4 py-3 text-left">操作</th>
                <th className="px-4 py-3 text-left">课程</th>
                <th className="px-4 py-3 text-left">学期</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  {rows.length === 0 ? "暂无操作记录" : "无匹配结果"}
                </td></tr>
              ) : filtered.map((row) => {
                const { label, cls } = ACTION_STYLE(row.action);
                return (
                  <tr key={row.auditId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{row.courseCode}</p>
                      <p className="text-xs text-slate-500">{row.courseTitle}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{row.sectionCode}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{row.termName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 ? (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">共 {filtered.length} 条记录</p>
        ) : null}
      </section>
    </div>
  );
}
