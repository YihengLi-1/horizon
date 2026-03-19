"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = {
  id: string;
  name: string;
};

type StudentProgressRow = {
  userId: string;
  name: string;
  email: string;
  dept: string;
  creditsCompleted: number;
  creditsEnrolled: number;
  gpa: number;
  enrollmentStatus: "Active" | "AtRisk" | "Inactive";
};

type StatusFilter = "All" | "Active" | "AtRisk" | "Inactive";

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function statusTone(status: StudentProgressRow["enrollmentStatus"]) {
  if (status === "AtRisk") return "border-red-200 bg-red-50 text-red-700";
  if (status === "Inactive") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function statusLabel(status: StudentProgressRow["enrollmentStatus"]) {
  if (status === "AtRisk") return "高风险";
  if (status === "Inactive") return "未活跃";
  return "正常";
}

export default function StudentProgressPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState<StatusFilter>("All");
  const [rows, setRows] = useState<StudentProgressRow[]>([]);
  const [deptOptions, setDeptOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms")
      .then((data) => {
        const nextTerms = (data ?? []).sort((a, b) => b.name.localeCompare(a.name));
        setTerms(nextTerms);
        if (nextTerms[0]) {
          setTermId(nextTerms[0].id);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "加载学期失败"));
  }, []);

  useEffect(() => {
    if (!termId && terms.length === 0) return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (termId) params.set("termId", termId);
    if (dept) params.set("dept", dept);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    void apiFetch<StudentProgressRow[]>(`/admin/student-progress${suffix}`)
      .then((data) => {
        const nextRows = data ?? [];
        setRows(nextRows);
        if (!dept) {
          setDeptOptions([...new Set(nextRows.map((row) => row.dept).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
        }
      })
      .catch((err) => {
        setRows([]);
        setError(err instanceof Error ? err.message : "加载学生进度失败");
      })
      .finally(() => setLoading(false));
  }, [termId, dept, terms.length]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => status === "All" || row.enrollmentStatus === status);
  }, [rows, status]);

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const atRisk = filteredRows.filter((row) => row.enrollmentStatus === "AtRisk").length;
    const active = filteredRows.filter((row) => row.enrollmentStatus === "Active").length;
    const avgGpa = total > 0
      ? Math.round((filteredRows.reduce((sum, row) => sum + row.gpa, 0) / total) * 100) / 100
      : 0;
    return { total, atRisk, active, avgGpa };
  }, [filteredRows]);

  function exportCsv() {
    const header = ["name", "email", "dept", "creditsCompleted", "creditsEnrolled", "gpa", "enrollmentStatus"];
    const lines = [
      header.join(","),
      ...filteredRows.map((row) =>
        [row.name, row.email, row.dept, row.creditsCompleted, row.creditsEnrolled, row.gpa.toFixed(2), row.enrollmentStatus]
          .map(csvCell)
          .join(",")
      )
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `student-progress-${termId || "all"}-${status.toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业追踪</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">学生进度</h1>
        <p className="mt-1 text-sm text-slate-500">按院系和风险状态查看学生累计进度、当前学分与 GPA</p>
      </section>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">学生总数</p>
          <p className="campus-kpi-value">{summary.total}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">高风险</p>
          <p className="campus-kpi-value text-red-600">{summary.atRisk}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">正常</p>
          <p className="campus-kpi-value text-emerald-600">{summary.active}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">平均 GPA</p>
          <p className="campus-kpi-value text-indigo-600">{summary.avgGpa.toFixed(2)}</p>
        </div>
      </div>

      <div className="campus-toolbar flex-wrap gap-3">
        <select className="campus-select" value={termId} onChange={(event) => setTermId(event.target.value)}>
          <option value="">所有学期</option>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.name}
            </option>
          ))}
        </select>
        <select className="campus-select" value={dept} onChange={(event) => setDept(event.target.value)}>
          <option value="">全部院系</option>
          {deptOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select className="campus-select" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
          <option value="All">全部状态</option>
          <option value="Active">正常</option>
          <option value="AtRisk">高风险</option>
          <option value="Inactive">未活跃</option>
        </select>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filteredRows.length === 0}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          CSV 导出
        </button>
      </div>

      {error ? <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : filteredRows.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">暂无学生进度数据</div>
      ) : (
        <div className="campus-card overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-3">学生</th>
                <th className="px-4 py-3">院系</th>
                <th className="px-4 py-3">已修学分</th>
                <th className="px-4 py-3">当前学分</th>
                <th className="px-4 py-3">GPA</th>
                <th className="px-4 py-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.userId} className="border-b border-slate-50 hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900">{row.name}</span>
                      <span className="text-xs text-slate-500">{row.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.dept}</td>
                  <td className="px-4 py-3 text-slate-700">{row.creditsCompleted}</td>
                  <td className="px-4 py-3 text-slate-700">{row.creditsEnrolled}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.gpa.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`campus-chip ${statusTone(row.enrollmentStatus)}`}>{statusLabel(row.enrollmentStatus)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
