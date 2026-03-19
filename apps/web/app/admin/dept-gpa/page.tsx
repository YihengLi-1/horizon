"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type DeptTerm = {
  termName: string;
  students: number;
  avgGpa: number | null;
  passRate: number | null;
};

type DeptRow = {
  dept: string;
  terms: DeptTerm[];
  latestGpa: number | null;
  avgPassRate: number;
};

type Term = { id: string; name: string };

function gpaColor(gpa: number | null): string {
  if (gpa === null) return "text-slate-400";
  if (gpa >= 3.5) return "text-emerald-600";
  if (gpa >= 3.0) return "text-blue-600";
  if (gpa >= 2.5) return "text-amber-600";
  return "text-red-600";
}

export default function DeptGpaPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [rows, setRows] = useState<DeptRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const url = termId ? `/admin/dept-gpa?termId=${termId}` : "/admin/dept-gpa";
    void apiFetch<DeptRow[]>(url)
      .then((d) => setRows(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId]);

  const filtered = useMemo(() => {
    const q = search.toUpperCase();
    return q ? rows.filter((r) => r.dept.toUpperCase().includes(q)) : rows;
  }, [rows, search]);

  function toggleExpand(dept: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(dept) ? next.delete(dept) : next.add(dept);
      return next;
    });
  }

  const avgGpaAll = rows.filter((r) => r.latestGpa !== null).length
    ? rows.reduce((s, r) => s + (r.latestGpa ?? 0), 0) / rows.filter((r) => r.latestGpa !== null).length
    : null;

  function exportCsv() {
    const headers = ["院系", "最新GPA", "平均通过率%", "学期数"];
    const csvRows = [
      headers.join(","),
      ...filtered.map((r) =>
        [`"${r.dept}"`, r.latestGpa?.toFixed(2) ?? "—", r.avgPassRate.toFixed(1), r.terms.length].join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `dept-gpa-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业成果</p>
        <h1 className="campus-hero-title">院系 GPA 对比</h1>
        <p className="campus-hero-subtitle">按院系前缀分组，展示各学期平均GPA与通过率走势</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">院系数</p>
          <p className="campus-kpi-value">{rows.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">全校平均 GPA</p>
          <p className="campus-kpi-value">{avgGpaAll !== null ? avgGpaAll.toFixed(2) : "—"}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">最高 GPA 院系</p>
          <p className="campus-kpi-value text-sm">
            {rows.sort((a, b) => (b.latestGpa ?? 0) - (a.latestGpa ?? 0))[0]?.dept ?? "—"}
          </p>
        </div>
      </section>

      <div className="campus-toolbar">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <input
            className="campus-input max-w-xs"
            placeholder="按院系代码搜索…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="campus-select w-48"
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
          >
            <option value="">全部学期</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!filtered.length}
          className="campus-btn-ghost shrink-0 disabled:opacity-40"
        >
          CSV 导出
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="space-y-2">
        {loading ? (
          <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="campus-card p-10 text-center text-slate-400">暂无数据</div>
        ) : (
          filtered.map((row) => {
            const open = expanded.has(row.dept);
            return (
              <div key={row.dept} className="campus-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleExpand(row.dept)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50"
                >
                  <div className="flex items-center gap-4">
                    <span className="inline-flex size-10 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-700">
                      {row.dept}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.dept} 院系</p>
                      <p className="text-xs text-slate-500">{row.terms.length} 个学期有数据</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-slate-400">最新 GPA</p>
                      <p className={`text-base font-bold ${gpaColor(row.latestGpa)}`}>
                        {row.latestGpa?.toFixed(2) ?? "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">通过率</p>
                      <p className="text-base font-bold text-slate-700">{row.avgPassRate.toFixed(0)}%</p>
                    </div>
                    <span className="text-slate-400">{open ? "▲" : "▼"}</span>
                  </div>
                </button>

                {open ? (
                  <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs font-semibold text-slate-500">
                          <th className="px-5 py-2 text-left">学期</th>
                          <th className="px-5 py-2 text-right">学生数</th>
                          <th className="px-5 py-2 text-right">平均 GPA</th>
                          <th className="px-5 py-2 text-right">通过率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.terms.map((t, i) => (
                          <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-5 py-2 font-medium text-slate-800">{t.termName}</td>
                            <td className="px-5 py-2 text-right font-mono text-slate-700">{t.students}</td>
                            <td className={`px-5 py-2 text-right font-bold ${gpaColor(t.avgGpa)}`}>
                              {t.avgGpa?.toFixed(2) ?? "—"}
                            </td>
                            <td className="px-5 py-2 text-right text-slate-700">
                              {t.passRate !== null ? `${t.passRate.toFixed(0)}%` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
