"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type TermCompareRow = {
  termId: string;
  termName: string;
  credits: number;
  courseCount: number;
  gpa: number;
  passRate: number;
};

function exportCsv(rows: TermCompareRow[]) {
  const csv = [
    ["termName", "gpa", "credits", "courseCount", "passRate"].join(","),
    ...rows.map((row) => [row.termName, row.gpa, row.credits, row.courseCount, row.passRate].join(","))
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "term-compare.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function StudentTermComparePage() {
  const [rows, setRows] = useState<TermCompareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<TermCompareRow[]>("/students/term-compare")
      .then((data) => setRows(data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载学期对比失败"))
      .finally(() => setLoading(false));
  }, []);

  const chart = useMemo(() => {
    const width = 840;
    const height = 260;
    const leftPad = 48;
    const rightPad = 48;
    const topPad = 24;
    const bottomPad = 44;
    const maxCredits = Math.max(1, ...rows.map((row) => row.credits));
    const maxGpa = 4;
    const plotWidth = width - leftPad - rightPad;
    const plotHeight = height - topPad - bottomPad;
    const gpaPoints = rows.map((row, index) => {
      const x = leftPad + (plotWidth * index) / Math.max(1, rows.length - 1);
      const y = topPad + plotHeight - (row.gpa / maxGpa) * plotHeight;
      return `${x},${y}`;
    });
    const creditPoints = rows.map((row, index) => {
      const x = leftPad + (plotWidth * index) / Math.max(1, rows.length - 1);
      const y = topPad + plotHeight - (row.credits / maxCredits) * plotHeight;
      return `${x},${y}`;
    });
    return { width, height, leftPad, rightPad, topPad, bottomPad, plotHeight, plotWidth, maxCredits, gpaPoints, creditPoints };
  }, [rows]);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Trends</p>
        <h1 className="campus-title">学期对比</h1>
        <p className="campus-subtitle">从 GPA、学分、课程数和通过率看你的学期变化趋势。</p>
      </section>

      <div className="campus-toolbar justify-between">
        <span className="text-sm text-slate-500">共 {rows.length} 个学期</span>
        <button type="button" onClick={() => exportCsv(rows)} disabled={!rows.length} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
          CSV 导出
        </button>
      </div>

      {error ? <div className="campus-card border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">加载中…</div>
      ) : rows.length === 0 ? (
        <div className="campus-card campus-empty">
          <div className="campus-empty-title">暂无学期数据</div>
          <div className="campus-empty-desc">等有历史修课记录后，这里会自动生成趋势对比。</div>
        </div>
      ) : (
        <>
          <div className="campus-card overflow-x-auto p-5">
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="min-w-[760px]">
              <line x1={chart.leftPad} y1={chart.topPad + chart.plotHeight} x2={chart.width - chart.rightPad} y2={chart.topPad + chart.plotHeight} stroke="#cbd5e1" />
              <line x1={chart.leftPad} y1={chart.topPad} x2={chart.leftPad} y2={chart.topPad + chart.plotHeight} stroke="#cbd5e1" />
              <line x1={chart.width - chart.rightPad} y1={chart.topPad} x2={chart.width - chart.rightPad} y2={chart.topPad + chart.plotHeight} stroke="#cbd5e1" />
              <polyline fill="none" stroke="#2563eb" strokeWidth="3" points={chart.gpaPoints.join(" ")} />
              <polyline fill="none" stroke="#7c3aed" strokeWidth="3" points={chart.creditPoints.join(" ")} />
              {rows.map((row, index) => {
                const x = chart.leftPad + (chart.plotWidth * index) / Math.max(1, rows.length - 1);
                const gpaY = chart.topPad + chart.plotHeight - (row.gpa / 4) * chart.plotHeight;
                const creditY = chart.topPad + chart.plotHeight - (row.credits / chart.maxCredits) * chart.plotHeight;
                return (
                  <g key={row.termId}>
                    <circle cx={x} cy={gpaY} r="4" fill="#2563eb" />
                    <circle cx={x} cy={creditY} r="4" fill="#7c3aed" />
                    <text x={x} y={chart.height - 14} textAnchor="middle" fontSize="11" fill="#64748b">{row.termName}</text>
                  </g>
                );
              })}
              <text x={chart.leftPad} y={14} fontSize="12" fill="#2563eb">GPA</text>
              <text x={chart.width - chart.rightPad} y={14} textAnchor="end" fontSize="12" fill="#7c3aed">学分</text>
            </svg>
          </div>

          <div className="campus-card overflow-x-auto">
            <table className="campus-table min-w-[760px]">
              <thead>
                <tr>
                  <th>指标</th>
                  {rows.map((row) => <th key={row.termId}>{row.termName}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr><td>GPA</td>{rows.map((row) => <td key={`${row.termId}-gpa`}>{row.gpa.toFixed(2)}</td>)}</tr>
                <tr><td>学分</td>{rows.map((row) => <td key={`${row.termId}-credits`}>{row.credits}</td>)}</tr>
                <tr><td>课程数</td>{rows.map((row) => <td key={`${row.termId}-courses`}>{row.courseCount}</td>)}</tr>
                <tr><td>通过率</td>{rows.map((row) => <td key={`${row.termId}-pass`}>{row.passRate.toFixed(1)}%</td>)}</tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
