"use client";

/**
 * Admin Enrollment Audit Report
 * Searchable, filterable table of all enrollment records with CSV export.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };

type AuditRow = {
  enrollmentId: string;
  studentEmail: string;
  studentId: string;
  courseCode: string;
  courseTitle: string;
  sectionCode: string;
  termName: string;
  status: string;
  finalGrade: string | null;
  enrolledAt: string;
  droppedAt: string | null;
};

type AuditData = {
  summary: { total: number; enrolled: number; completed: number; dropped: number; waitlisted: number };
  rows: AuditRow[];
};

const STATUS_COLORS: Record<string, string> = {
  ENROLLED: "text-emerald-700 bg-emerald-50",
  COMPLETED: "text-indigo-700 bg-indigo-50",
  DROPPED: "text-red-700 bg-red-50",
  WAITLISTED: "text-amber-700 bg-amber-50",
};

const STATUS_ZH: Record<string, string> = {
  ENROLLED: "在读", COMPLETED: "完成", DROPPED: "退课", WAITLISTED: "候补"
};

export default function EnrollmentAuditPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
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
    void apiFetch<Term[]>("/academics/terms")
      .then((d) => setTerms((d ?? []).sort((a, b) => b.name.localeCompare(a.name))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setData(null);
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    if (statusFilter) params.set("status", statusFilter);
    void apiFetch<AuditData>(`/admin/enrollment-audit?${params}`)
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [termId, statusFilter]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    if (!q) return data.rows;
    return data.rows.filter((r) =>
      r.studentEmail.toLowerCase().includes(q) ||
      r.courseCode.toLowerCase().includes(q) ||
      r.courseTitle.toLowerCase().includes(q) ||
      r.sectionCode.toLowerCase().includes(q)
    );
  }, [data, search]);

  function exportCsv() {
    if (!filtered.length) return;
    const header = ["报名ID", "学生", "课程", "班级", "学期", "状态", "成绩", "报名时间", "退课时间"];
    const rows = filtered.map((r) => [
      r.enrollmentId, r.studentEmail, r.courseCode, r.sectionCode, r.termName, r.status, r.finalGrade ?? "", r.enrolledAt, r.droppedAt ?? ""
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "enrollment-audit.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">报名分析</p>
        <h1 className="campus-title">注册审计报告</h1>
        <p className="campus-subtitle">查看所有注册记录，支持筛选、搜索与 CSV 导出</p>
      </section>

      <div className="campus-toolbar flex-wrap gap-2">
        <select className="campus-select" value={termId} onChange={(e) => setTermId(e.target.value)}>
          <option value="">所有学期</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="campus-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">所有状态</option>
          <option value="ENROLLED">在读</option>
          <option value="COMPLETED">完成</option>
          <option value="DROPPED">退课</option>
          <option value="WAITLISTED">候补</option>
        </select>
        <input
          ref={searchRef}
          className="campus-input flex-1 min-w-48"
          placeholder="搜索学生邮箱、课程代码… (/)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={exportCsv}
          disabled={!filtered.length}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          CSV 导出
        </button>
      </div>

      {/* Summary KPIs */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "总记录", value: data.summary.total },
            { label: "在读", value: data.summary.enrolled, color: "text-emerald-600" },
            { label: "完成", value: data.summary.completed, color: "text-indigo-600" },
            { label: "退课", value: data.summary.dropped, color: "text-red-600" },
            { label: "候补", value: data.summary.waitlisted, color: "text-amber-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="campus-kpi">
              <p className="campus-kpi-label">{label}</p>
              <p className={`campus-kpi-value ${color ?? ""}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">暂无记录</div>
      ) : (
        <div className="campus-card overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-500">
            显示 {filtered.length} 条（最多 500 条）
          </div>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="campus-table text-xs">
              <thead>
                <tr>
                  <th>学生</th>
                  <th>课程</th>
                  <th>班级</th>
                  <th>学期</th>
                  <th className="text-center">状态</th>
                  <th className="text-center">成绩</th>
                  <th className="text-right">注册日期</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.enrollmentId}>
                    <td className="truncate max-w-[160px] text-slate-700">{r.studentEmail}</td>
                    <td>
                      <span className="font-mono font-bold text-indigo-700">{r.courseCode}</span>
                    </td>
                    <td className="font-mono text-slate-500">{r.sectionCode}</td>
                    <td className="text-slate-500">{r.termName}</td>
                    <td className="text-center">
                      <span className={`campus-chip px-2 py-0.5 text-[10px] ${r.status === "ENROLLED" ? "chip-emerald" : r.status === "COMPLETED" ? "chip-blue" : r.status === "DROPPED" ? "chip-red" : "chip-amber"}`}>
                        {STATUS_ZH[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="text-center font-mono font-bold text-slate-600">{r.finalGrade ?? "—"}</td>
                    <td className="text-right text-slate-400">{r.enrolledAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
