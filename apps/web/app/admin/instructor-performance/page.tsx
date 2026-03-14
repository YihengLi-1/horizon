"use client";

/**
 * Admin Instructor Performance Report
 * Shows all instructors with section count, enrollment stats, avg GPA and drop rate.
 */

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type InstructorRow = {
  instructorName: string; instructorEmail: string;
  sections: number; totalStudents: number; completedStudents: number;
  droppedStudents: number; avgGpa: number | null; dropRate: number;
};

function downloadCsv(rows: InstructorRow[]) {
  const header = "Name,Email,Sections,TotalStudents,Completed,Dropped,DropRate%,AvgGPA";
  const lines = rows.map((r) =>
    `"${r.instructorName}","${r.instructorEmail}",${r.sections},${r.totalStudents},${r.completedStudents},${r.droppedStudents},${r.dropRate},${r.avgGpa ?? ""}`
  );
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "instructor-performance.csv";
  a.click(); URL.revokeObjectURL(url);
}

export default function InstructorPerformancePage() {
  const [data, setData] = useState<InstructorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"sections" | "gpa" | "dropRate">("sections");

  useEffect(() => {
    void apiFetch<InstructorRow[]>("/admin/instructor-performance")
      .then((d) => setData(d ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return data
      .filter((r) => !search ||
        r.instructorName.toLowerCase().includes(search.toLowerCase()) ||
        r.instructorEmail.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) =>
        sortBy === "gpa" ? (b.avgGpa ?? 0) - (a.avgGpa ?? 0) :
        sortBy === "dropRate" ? b.dropRate - a.dropRate :
        b.sections - a.sections
      );
  }, [data, search, sortBy]);

  const avgGpa = data.length > 0
    ? data.filter((r) => r.avgGpa !== null).reduce((s, r) => s + (r.avgGpa ?? 0), 0) / Math.max(1, data.filter((r) => r.avgGpa !== null).length)
    : null;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Faculty Analytics</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">教师教学效能报告</h1>
        <p className="mt-1 text-sm text-slate-500">查看各教师的课程量、学生数、平均 GPA 与退课率</p>
      </section>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">教师总数</p>
              <p className="campus-kpi-value">{data.length}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">总学生人次</p>
              <p className="campus-kpi-value text-indigo-600">{data.reduce((s, r) => s + r.totalStudents, 0)}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">平均 GPA</p>
              <p className="campus-kpi-value text-emerald-600">{avgGpa?.toFixed(2) ?? "—"}</p>
            </div>
          </div>

          {/* Toolbar */}
          <div className="campus-toolbar gap-2 flex-wrap">
            <input
              className="campus-input flex-1 min-w-48"
              placeholder="搜索教师姓名或邮箱…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="campus-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "sections" | "gpa" | "dropRate")}
            >
              <option value="sections">按课程节数排序</option>
              <option value="gpa">按平均 GPA 排序</option>
              <option value="dropRate">按退课率排序</option>
            </select>
            <button
              type="button"
              onClick={() => downloadCsv(filtered)}
              className="campus-chip border-indigo-200 bg-indigo-50 text-indigo-700"
            >
              导出 CSV
            </button>
          </div>

          <div className="campus-card overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-500">
              共 {filtered.length} 位教师
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 pl-4 text-left font-semibold">教师</th>
                    <th className="pb-2 pr-3 text-right font-semibold">课程节</th>
                    <th className="pb-2 pr-3 text-right font-semibold">学生人次</th>
                    <th className="pb-2 pr-3 text-right font-semibold">完成</th>
                    <th className="pb-2 pr-3 text-right font-semibold">退课率</th>
                    <th className="pb-2 pr-4 text-right font-semibold">平均 GPA</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.instructorName + r.instructorEmail} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2.5 pl-4 pr-3">
                        <span className="font-medium text-slate-800">{r.instructorName}</span>
                        <span className="text-slate-400 block text-xs">{r.instructorEmail}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-right text-slate-600">{r.sections}</td>
                      <td className="py-2.5 pr-3 text-right text-indigo-600">{r.totalStudents}</td>
                      <td className="py-2.5 pr-3 text-right text-emerald-600">{r.completedStudents}</td>
                      <td className="py-2.5 pr-3 text-right">
                        <span className={r.dropRate > 20 ? "text-red-600 font-bold" : r.dropRate > 10 ? "text-amber-600" : "text-emerald-600"}>
                          {r.dropRate}%
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        {r.avgGpa !== null ? (
                          <span className={r.avgGpa >= 3.5 ? "text-emerald-600 font-bold" : r.avgGpa >= 2.5 ? "text-slate-700" : "text-red-600"}>
                            {r.avgGpa.toFixed(2)}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
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
