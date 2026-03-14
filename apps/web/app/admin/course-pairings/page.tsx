"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type CoursePairing = {
  pairKey: string;
  courseAId: string;
  courseACode: string;
  courseATitle: string;
  courseBId: string;
  courseBCode: string;
  courseBTitle: string;
  coCount: number;
  termCount: number;
  terms: {
    termId: string;
    termName: string;
    coCount: number;
  }[];
};

function exportCsv(rows: CoursePairing[]) {
  const header = "CourseA,CourseATitle,CourseB,CourseBTitle,CoCount,TermCount,Terms";
  const lines = rows.map((row) =>
    [
      row.courseACode,
      row.courseATitle,
      row.courseBCode,
      row.courseBTitle,
      row.coCount,
      row.termCount,
      row.terms.map((term) => `${term.termName} (${term.coCount})`).join(" | ")
    ]
      .map((value) => {
        const text = String(value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(",")
  );

  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "course-pairings.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminCoursePairingsPage() {
  const [rows, setRows] = useState<CoursePairing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    void apiFetch<CoursePairing[]>("/admin/course-pairings")
      .then((data) => setRows(data ?? []))
      .catch((err) => {
        setRows([]);
        setError(err instanceof Error ? err.message : "加载课程搭配分析失败");
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) =>
      row.courseACode.toLowerCase().includes(keyword) ||
      row.courseATitle.toLowerCase().includes(keyword) ||
      row.courseBCode.toLowerCase().includes(keyword) ||
      row.courseBTitle.toLowerCase().includes(keyword)
    );
  }, [rows, search]);

  const totalCooccurrence = filtered.reduce((sum, row) => sum + row.coCount, 0);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Cross-Enrollment</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">课程搭配分析</h1>
        <p className="mt-1 text-sm text-slate-500">统计同一学生在同一学期同时修读的课程对，并展开查看出现过的学期。</p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">课程对数量</p>
          <p className="campus-kpi-value">{filtered.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">总共现次数</p>
          <p className="campus-kpi-value text-indigo-600">{totalCooccurrence}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">最高共现</p>
          <p className="campus-kpi-value text-emerald-600">{filtered[0]?.coCount ?? 0}</p>
        </div>
      </div>

      <div className="campus-toolbar flex-wrap gap-3">
        <input
          className="campus-input min-w-[240px] flex-1"
          placeholder="搜索课程代码或课程名…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button
          type="button"
          onClick={() => exportCsv(filtered)}
          disabled={filtered.length === 0}
          className="campus-chip border-indigo-200 bg-indigo-50 text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          导出 CSV
        </button>
      </div>

      {error ? <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">暂无课程搭配数据</div>
      ) : (
        <div className="campus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left">课程 A</th>
                  <th className="px-4 py-3 text-left">课程 B</th>
                  <th className="px-4 py-3 text-right">共现次数</th>
                  <th className="px-4 py-3 text-right">涉及学期</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const isExpanded = expanded === row.pairKey;
                  return (
                    <Fragment key={row.pairKey}>
                      <tr key={row.pairKey} className="border-b border-slate-100 align-top">
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-900">{row.courseACode}</div>
                          <div className="text-xs text-slate-500">{row.courseATitle}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-900">{row.courseBCode}</div>
                          <div className="text-xs text-slate-500">{row.courseBTitle}</div>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-indigo-600">{row.coCount}</td>
                        <td className="px-4 py-4 text-right text-slate-600">{row.termCount}</td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => setExpanded(isExpanded ? null : row.pairKey)}
                            className="campus-chip border-slate-200 bg-white text-slate-700"
                          >
                            {isExpanded ? "收起学期" : "展开学期"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="border-b border-slate-100 bg-slate-50/70">
                          <td className="px-4 py-4" colSpan={5}>
                            <div className="flex flex-wrap gap-2">
                              {row.terms.map((term) => (
                                <span key={term.termId} className="campus-chip border-indigo-200 bg-indigo-50 text-indigo-700">
                                  {term.termName} · {term.coCount}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
