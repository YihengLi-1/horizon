"use client";

import { GRADE_POINTS } from "@sis/shared/constants";
import type { GradeItem } from "./page";

interface Props {
  grades: GradeItem[];
  studentName?: string;
  studentId?: string;
}

function gradePoints(grade: string | null | undefined): number | null {
  if (!grade) return null;
  return GRADE_POINTS[grade.trim().toUpperCase()] ?? null;
}

function calcTermGpa(items: GradeItem[]): number | null {
  let weighted = 0, credits = 0;
  for (const g of items) {
    const pts = gradePoints(g.finalGrade);
    if (pts === null) continue;
    weighted += pts * (g.section.credits ?? 0);
    credits += g.section.credits ?? 0;
  }
  return credits > 0 ? weighted / credits : null;
}

export default function TranscriptExportButton({ grades, studentName, studentId }: Props) {
  // ── CSV export ──────────────────────────────────────────────────────────
  function handleCsvExport() {
    const rows = [
      ["学期", "课程代码", "课程名称", "学分", "成绩", "绩点", "贡献"],
      ...grades.map((g) => {
        const points = gradePoints(g.finalGrade);
        const credits = g.section.credits ?? null;
        return [
          g.term.name ?? "",
          g.section.course.code ?? "",
          g.section.course.title ?? "",
          String(credits ?? ""),
          g.finalGrade ?? "进行中",
          points != null ? String(points) : "",
          points != null && credits != null ? String((points * credits).toFixed(2)) : ""
        ];
      })
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcript.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Print / PDF export ───────────────────────────────────────────────────
  function handlePdfExport() {
    // Group by term
    const byTerm = new Map<string, GradeItem[]>();
    for (const g of grades) {
      const key = g.term.name;
      if (!byTerm.has(key)) byTerm.set(key, []);
      byTerm.get(key)!.push(g);
    }

    // Compute cumulative GPA
    let cumWeighted = 0, cumCredits = 0;
    for (const g of grades) {
      const pts = gradePoints(g.finalGrade);
      if (pts === null) continue;
      cumWeighted += pts * (g.section.credits ?? 0);
      cumCredits += g.section.credits ?? 0;
    }
    const cumGpa = cumCredits > 0 ? (cumWeighted / cumCredits).toFixed(2) : "—";

    const termRows = Array.from(byTerm.entries()).map(([termName, items]) => {
      const termGpa = calcTermGpa(items);
      const rows = items.map((g) => {
        const pts = gradePoints(g.finalGrade);
        const contrib = pts != null ? (pts * (g.section.credits ?? 0)).toFixed(2) : "—";
        return `
          <tr>
            <td>${g.section.course.code ?? "—"}</td>
            <td>${g.section.course.title ?? "—"}</td>
            <td class="center">${g.section.credits ?? "—"}</td>
            <td class="center grade">${g.finalGrade ?? "进行中"}</td>
            <td class="center">${pts != null ? pts.toFixed(1) : "—"}</td>
            <td class="center">${contrib}</td>
          </tr>`;
      }).join("");
      return `
        <section>
          <div class="term-header">
            <span class="term-name">${termName}</span>
            <span class="term-gpa">学期绩点：${termGpa != null ? termGpa.toFixed(2) : "—"}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>课程代码</th><th>课程名称</th>
                <th class="center">学分</th><th class="center">成绩</th>
                <th class="center">绩点</th><th class="center">加权贡献</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
    }).join("");

    const now = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>成绩单 — ${studentName ?? "学生"}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Noto Serif SC", "Source Han Serif", "SimSun", serif; font-size: 12px; color: #1a1a1a; padding: 32px 40px; }
  h1 { font-size: 22px; font-weight: 700; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 12px; color: #555; margin-bottom: 24px; }
  .meta { display: flex; justify-content: space-between; border-top: 2px solid #1a1a1a; border-bottom: 1px solid #ccc; padding: 6px 0; margin-bottom: 20px; font-size: 11px; }
  .meta span { color: #333; }
  section { margin-bottom: 24px; page-break-inside: avoid; }
  .term-header { display: flex; justify-content: space-between; background: #f3f4f6; padding: 5px 8px; border-radius: 4px; margin-bottom: 6px; }
  .term-name { font-weight: 700; font-size: 13px; }
  .term-gpa { font-size: 11px; color: #4b5563; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #e5e7eb; font-size: 11px; padding: 5px 6px; text-align: left; border-bottom: 1px solid #d1d5db; }
  td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
  .center { text-align: center; }
  .grade { font-weight: 700; }
  .summary { margin-top: 28px; border-top: 2px solid #1a1a1a; padding-top: 12px; display: flex; justify-content: space-between; }
  .summary-item { text-align: center; }
  .summary-label { font-size: 10px; color: #6b7280; }
  .summary-value { font-size: 18px; font-weight: 700; }
  .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
  @media print {
    body { padding: 20px 28px; }
    @page { margin: 15mm; }
  }
</style>
</head>
<body>
<h1>学业成绩单</h1>
<p class="subtitle">Academic Transcript</p>
<div class="meta">
  <span>姓名：${studentName ?? "—"}</span>
  <span>学号：${studentId ?? "—"}</span>
  <span>打印日期：${now}</span>
</div>
${termRows}
<div class="summary">
  <div class="summary-item">
    <p class="summary-label">已修课程</p>
    <p class="summary-value">${grades.length}</p>
  </div>
  <div class="summary-item">
    <p class="summary-label">累计学分</p>
    <p class="summary-value">${cumCredits}</p>
  </div>
  <div class="summary-item">
    <p class="summary-label">累计 GPA</p>
    <p class="summary-value">${cumGpa}</p>
  </div>
</div>
<p class="footer">本成绩单由地平线学生信息系统自动生成，如需官方盖章版本请前往教务处申请。</p>
<script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      // Fallback if popup blocked — download as html
      const a = document.createElement("a");
      a.href = url;
      a.download = "transcript.html";
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={handleCsvExport}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
      >
        ⬇ 导出 CSV
      </button>
      <button
        type="button"
        onClick={handlePdfExport}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700"
      >
        🖨 打印 / PDF
      </button>
    </div>
  );
}
