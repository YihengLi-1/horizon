"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type TermOffering = {
  termId: string;
  termName: string;
  sectionId: string;
  sectionCode: string;
  instructorName: string;
  capacity: number;
  enrolled: number;
  utilizationPct: number;
  avgRating: number | null;
};

type CourseHistory = {
  courseId: string;
  courseCode: string;
  courseTitle: string;
  credits: number;
  termCount: number;
  avgUtilization: number;
  offerings: TermOffering[];
};

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function OfferingHistoryPage() {
  const [rows, setRows] = useState<CourseHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    void apiFetch<CourseHistory[]>("/admin/course-offering-history")
      .then((d) => setRows(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => !q || r.courseCode.toLowerCase().includes(q) || r.courseTitle.toLowerCase().includes(q));
  }, [rows, search]);

  const detail = rows.find((r) => r.courseId === selected);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  void toggle; // used for future expansion

  function exportCsv() {
    downloadCsv("offering-history.csv", [
      ["课程代码", "课程名称", "学分", "开设学期数", "平均利用率"],
      ...filtered.map((r) => [r.courseCode, r.courseTitle, String(r.credits), String(r.termCount), `${r.avgUtilization}%`]),
    ]);
  }

  function exportDetailCsv(d: CourseHistory) {
    downloadCsv(`offering-${d.courseCode}.csv`, [
      ["学期", "教学班", "教师", "容量", "注册", "利用率", "评分"],
      ...d.offerings.map((o) => [
        o.termName, o.sectionCode, o.instructorName || "",
        String(o.capacity), String(o.enrolled), `${o.utilizationPct}%`,
        o.avgRating != null ? o.avgRating.toFixed(1) : "",
      ]),
    ]);
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">课程管理</p>
        <h1 className="campus-title">课程开设历史</h1>
        <p className="campus-subtitle">查看各课程历年开设记录、利用率与评分趋势</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">开设课程总数</p>
          <p className="campus-kpi-value">{loading ? "—" : rows.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">总开课次数</p>
          <p className="campus-kpi-value">{loading ? "—" : rows.reduce((s, r) => s + r.offerings.length, 0)}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">平均利用率</p>
          <p className="campus-kpi-value">
            {loading || !rows.length ? "—" : `${Math.round(rows.reduce((s, r) => s + r.avgUtilization, 0) / rows.length)}%`}
          </p>
        </div>
      </section>

      <div className="campus-toolbar">
        <input
          ref={searchRef}
          className="campus-input max-w-xs"
          placeholder="搜索课程代码或名称… (/)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {selected ? (
          <button type="button" onClick={() => setSelected(null)} className="campus-btn-ghost text-xs">← 返回列表</button>
        ) : (
          <button type="button" onClick={exportCsv} disabled={!filtered.length} className="campus-btn-ghost shrink-0 disabled:opacity-40">
            CSV 导出
          </button>
        )}
        {selected && detail ? (
          <button type="button" onClick={() => exportDetailCsv(detail)} className="campus-btn-ghost shrink-0">
            导出明细
          </button>
        ) : null}
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : !selected ? (
        <section className="campus-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <th className="px-4 py-3 text-left">课程</th>
                <th className="px-4 py-3 text-right">学分</th>
                <th className="px-4 py-3 text-right">开设学期</th>
                <th className="px-4 py-3 text-left">平均利用率</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">暂无数据</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.courseId} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(r.courseId)}>
                  <td className="px-4 py-3">
                    <p className="font-bold text-blue-700">{r.courseCode}</p>
                    <p className="text-xs text-slate-500">{r.courseTitle}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">{r.credits}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-700">{r.termCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 rounded-full bg-slate-100">
                        <div className={`h-2 rounded-full ${r.avgUtilization >= 90 ? "bg-red-400" : r.avgUtilization >= 70 ? "bg-amber-400" : "bg-emerald-400"}`}
                          style={{ width: `${Math.min(100, r.avgUtilization)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-slate-700">{r.avgUtilization}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : detail ? (
        <section className="campus-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="font-bold text-slate-900 text-lg">{detail.courseCode} — {detail.courseTitle}</p>
            <p className="text-xs text-slate-400 mt-0.5">{detail.credits} 学分 · 共开设 {detail.offerings.length} 次</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold text-slate-400">
                <th className="px-5 py-2 text-left">学期</th>
                <th className="px-5 py-2 text-left">教学班</th>
                <th className="px-5 py-2 text-left">教师</th>
                <th className="px-5 py-2 text-right">容量</th>
                <th className="px-5 py-2 text-right">注册</th>
                <th className="px-5 py-2 text-right">利用率</th>
                <th className="px-5 py-2 text-right">评分</th>
              </tr>
            </thead>
            <tbody>
              {detail.offerings.map((o) => (
                <tr key={o.sectionId} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-2.5 text-slate-700">{o.termName}</td>
                  <td className="px-5 py-2.5 font-mono text-xs text-slate-600">{o.sectionCode}</td>
                  <td className="px-5 py-2.5 text-slate-600 text-xs">{o.instructorName || "—"}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-slate-500">{o.capacity}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-slate-700">{o.enrolled}</td>
                  <td className="px-5 py-2.5 text-right font-bold text-sm">
                    <span className={o.utilizationPct >= 90 ? "text-red-600" : o.utilizationPct >= 70 ? "text-amber-600" : "text-emerald-600"}>
                      {o.utilizationPct}%
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {o.avgRating != null ? (
                      <span className="font-bold text-amber-600">★ {o.avgRating.toFixed(1)}</span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
