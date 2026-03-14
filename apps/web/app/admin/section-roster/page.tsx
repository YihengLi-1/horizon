"use client";

/**
 * Admin Section Roster Export
 * Enter a section ID to view its full enrollment roster with grades and CSV export.
 */

import { useState } from "react";
import { apiFetch } from "@/lib/api";

type RosterEntry = {
  no: number; email: string; name: string;
  status: string; finalGrade: string; enrolledAt: string;
};
type RosterData = {
  sectionId: string; courseCode: string; courseTitle: string;
  credits: number; termName: string; instructorEmail: string;
  capacity: number; enrolled: number; completed: number; dropped: number;
  avgGpa: number | null; roster: RosterEntry[];
};

const STATUS_COLORS: Record<string, string> = {
  ENROLLED: "text-indigo-600 bg-indigo-50",
  COMPLETED: "text-emerald-700 bg-emerald-50",
  DROPPED: "text-amber-700 bg-amber-50",
  WAITLISTED: "text-slate-500 bg-slate-100",
};

function downloadCsv(data: RosterData) {
  const header = "No,Name,Email,Status,Grade,Enrolled Date";
  const lines = data.roster.map((r) =>
    `${r.no},"${r.name}","${r.email}",${r.status},${r.finalGrade},${r.enrolledAt}`
  );
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `roster-${data.courseCode}-${data.termName}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

export default function SectionRosterPage() {
  const [sectionId, setSectionId] = useState("");
  const [data, setData] = useState<RosterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    if (!sectionId.trim()) return;
    setLoading(true); setError(""); setData(null);
    try {
      const d = await apiFetch<RosterData>(`/admin/section-roster/${sectionId.trim()}`);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  const filtered = data
    ? data.roster.filter((r) =>
        !search ||
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.email.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Enrollment Records</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">课程节名单</h1>
        <p className="mt-1 text-sm text-slate-500">输入课程节 ID 查看完整注册名单并导出 CSV</p>
      </section>

      {/* Input */}
      <div className="campus-card p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 flex-1 min-w-60">
            <label className="text-xs font-medium text-slate-500">课程节 ID (Section ID)</label>
            <input
              className="campus-input"
              placeholder="输入 Section UUID…"
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void load()}
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={!sectionId.trim() || loading}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "加载中…" : "查询名单"}
          </button>
        </div>
      </div>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {data && (
        <>
          {/* Section info */}
          <div className="campus-card p-4 space-y-2">
            <div className="flex flex-wrap gap-4 items-start justify-between">
              <div>
                <p className="font-mono text-lg font-bold text-indigo-700">{data.courseCode}</p>
                <p className="text-slate-700">{data.courseTitle}</p>
                <p className="text-xs text-slate-400 mt-1">{data.termName} · {data.credits} 学分 · 教师: {data.instructorEmail}</p>
              </div>
              <button
                type="button"
                onClick={() => downloadCsv(data)}
                className="campus-chip border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              >
                导出 CSV
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div className="campus-kpi">
              <p className="campus-kpi-label">容量</p>
              <p className="campus-kpi-value text-slate-700">{data.capacity}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">在读</p>
              <p className="campus-kpi-value text-indigo-600">{data.enrolled}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">完成</p>
              <p className="campus-kpi-value text-emerald-600">{data.completed}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">退课</p>
              <p className="campus-kpi-value text-amber-600">{data.dropped}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">平均 GPA</p>
              <p className="campus-kpi-value text-slate-700">{data.avgGpa?.toFixed(2) ?? "—"}</p>
            </div>
          </div>

          {/* Search + table */}
          <div className="campus-toolbar">
            <input
              className="campus-input flex-1 min-w-48"
              placeholder="搜索姓名或邮箱…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {data.roster.length === 0 ? (
            <div className="campus-card px-6 py-10 text-center text-sm text-slate-400">该课程节暂无注册记录</div>
          ) : (
            <div className="campus-card overflow-hidden">
              <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-500">
                {filtered.length} / {data.roster.length} 条记录
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="pb-2 pl-4 text-right font-semibold w-10">#</th>
                      <th className="pb-2 pr-3 pl-3 text-left font-semibold">姓名</th>
                      <th className="pb-2 pr-3 text-left font-semibold">邮箱</th>
                      <th className="pb-2 pr-3 text-center font-semibold">状态</th>
                      <th className="pb-2 pr-3 text-center font-semibold">成绩</th>
                      <th className="pb-2 pr-4 text-right font-semibold">注册日期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.no} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2.5 pl-4 text-right text-slate-400">{r.no}</td>
                        <td className="py-2.5 pr-3 pl-3 font-medium text-slate-800">{r.name}</td>
                        <td className="py-2.5 pr-3 text-slate-500">{r.email}</td>
                        <td className="py-2.5 pr-3 text-center">
                          <span className={`inline-block rounded px-1.5 py-0.5 font-medium ${STATUS_COLORS[r.status] ?? "text-slate-600"}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-center font-mono font-bold text-slate-700">{r.finalGrade}</td>
                        <td className="py-2.5 pr-4 text-right text-slate-400">{r.enrolledAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
