"use client";

/**
 * Admin Department GPA Comparison
 * Compares average GPA and pass rate across departments (derived from course code prefix).
 */

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type TermStat = { termName: string; students: number; avgGpa: number | null; passRate: number | null };
type DeptData = {
  dept: string; terms: TermStat[];
  latestGpa: number | null; avgPassRate: number;
};

function gpaColor(gpa: number | null) {
  if (gpa === null) return "text-slate-300";
  if (gpa >= 3.5) return "text-emerald-600 font-bold";
  if (gpa >= 3.0) return "text-indigo-600";
  if (gpa >= 2.5) return "text-slate-700";
  if (gpa >= 2.0) return "text-amber-600";
  return "text-red-600 font-bold";
}

export default function DeptGpaPage() {
  const [data, setData] = useState<DeptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DeptData | null>(null);

  useEffect(() => {
    void apiFetch<DeptData[]>("/admin/dept-gpa")
      .then((d) => setData(d ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() =>
    data
      .filter((d) => !search || d.dept.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (b.latestGpa ?? 0) - (a.latestGpa ?? 0)),
    [data, search]
  );

  const maxGpa = 4;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Quality</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">学院 GPA 对比</h1>
        <p className="mt-1 text-sm text-slate-500">按课程代码前缀（学院）比较平均成绩与通过率</p>
      </section>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      <div className="campus-toolbar gap-2">
        <input
          className="campus-input flex-1 min-w-48"
          placeholder="搜索学院代码…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {selected && (
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="campus-chip border-slate-200 bg-slate-50 text-slate-600"
          >
            ← 返回
          </button>
        )}
      </div>

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : selected ? (
        /* Detail view */
        <div className="space-y-4">
          <div className="campus-card p-4">
            <p className="font-mono text-xl font-bold text-indigo-700">{selected.dept}</p>
            <div className="flex gap-6 mt-2 text-sm">
              <span className="text-slate-500">最新 GPA: <strong className={gpaColor(selected.latestGpa)}>{selected.latestGpa?.toFixed(2) ?? "—"}</strong></span>
              <span className="text-slate-500">平均通过率: <strong className="text-slate-800">{selected.avgPassRate.toFixed(1)}%</strong></span>
            </div>
          </div>
          <div className="campus-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 pl-4 text-left font-semibold">学期</th>
                    <th className="pb-2 pr-3 text-right font-semibold">学生数</th>
                    <th className="pb-2 pr-3 text-right font-semibold">平均 GPA</th>
                    <th className="pb-2 pr-4 text-right font-semibold">通过率</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.terms.map((t, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 pl-4 pr-3 font-medium text-slate-800">{t.termName}</td>
                      <td className="py-2.5 pr-3 text-right text-slate-600">{t.students}</td>
                      <td className="py-2.5 pr-3 text-right">
                        <span className={gpaColor(t.avgGpa)}>{t.avgGpa?.toFixed(2) ?? "—"}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        {t.passRate !== null ? (
                          <span className={t.passRate >= 90 ? "text-emerald-600" : t.passRate >= 75 ? "text-slate-700" : "text-red-600"}>
                            {t.passRate.toFixed(0)}%
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Visual GPA bar chart */}
          <div className="campus-card p-4 space-y-3">
            <h2 className="text-sm font-bold text-slate-900">最新学期平均 GPA（按学院）</h2>
            <div className="space-y-2">
              {filtered.filter((d) => d.latestGpa !== null).map((d) => (
                <div key={d.dept} className="flex items-center gap-3 cursor-pointer group" onClick={() => setSelected(d)}>
                  <span className="font-mono font-bold text-indigo-700 w-14 shrink-0">{d.dept}</span>
                  <div className="flex-1 h-5 rounded bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded bg-indigo-400 group-hover:bg-indigo-500 transition"
                      style={{ width: `${((d.latestGpa ?? 0) / maxGpa) * 100}%` }}
                    />
                  </div>
                  <span className={`w-12 text-right text-sm ${gpaColor(d.latestGpa)}`}>
                    {d.latestGpa?.toFixed(2) ?? "—"}
                  </span>
                  <span className="text-xs text-slate-400 w-14 text-right">{d.avgPassRate.toFixed(0)}% 通过</span>
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="campus-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 pl-4 text-left font-semibold">学院</th>
                    <th className="pb-2 pr-3 text-right font-semibold">学期数</th>
                    <th className="pb-2 pr-3 text-right font-semibold">最新 GPA</th>
                    <th className="pb-2 pr-4 text-right font-semibold">平均通过率</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr
                      key={d.dept}
                      className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setSelected(d)}
                    >
                      <td className="py-2.5 pl-4 pr-3 font-mono font-bold text-indigo-700">{d.dept}</td>
                      <td className="py-2.5 pr-3 text-right text-slate-500">{d.terms.length}</td>
                      <td className="py-2.5 pr-3 text-right">
                        <span className={gpaColor(d.latestGpa)}>{d.latestGpa?.toFixed(2) ?? "—"}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <span className={d.avgPassRate >= 90 ? "text-emerald-600" : d.avgPassRate >= 75 ? "text-slate-700" : "text-amber-600"}>
                          {d.avgPassRate.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
