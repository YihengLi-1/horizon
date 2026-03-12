"use client";

/**
 * Admin Graduation Clearance
 * Comprehensive per-student checklist: credits done, in-progress credits,
 * missing grades, open appeals, pending enrollments.
 * Students are colour-coded eligible (green) / ineligible (red/amber).
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type StudentClearance = {
  userId: string; email: string; name: string | null; department: string | null;
  graduationYear: number | null; creditsDone: number; creditsInProgress: number;
  creditsNeeded: number; missingGrades: number; openAppeals: number;
  pendingApproval: number; eligible: boolean;
};

export default function GraduationPage() {
  const [data, setData] = useState<StudentClearance[]>([]);
  const [loading, setLoading] = useState(true);
  const [minCredits, setMinCredits] = useState(120);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "eligible" | "ineligible">("all");

  useEffect(() => {
    setLoading(true);
    void apiFetch<StudentClearance[]>(`/admin/graduation?minCredits=${minCredits}`)
      .then((d) => setData(d ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [minCredits]);

  const filtered = data.filter((s) => {
    const matchSearch =
      !search ||
      (s.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()) ||
      (s.department ?? "").toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all" ||
      (filter === "eligible" && s.eligible) ||
      (filter === "ineligible" && !s.eligible);
    return matchSearch && matchFilter;
  });

  const eligibleCount = data.filter((s) => s.eligible).length;

  function exportCSV() {
    const header = "Name,Email,Department,GradYear,CreditsDone,CreditsNeeded,MissingGrades,OpenAppeals,Eligible";
    const rows = filtered.map((s) =>
      [s.name ?? "", s.email, s.department ?? "", s.graduationYear ?? "",
       s.creditsDone, s.creditsNeeded, s.missingGrades, s.openAppeals, s.eligible ? "Yes" : "No"].join(",")
    );
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "graduation_clearance.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Records</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">毕业审核</h1>
        <p className="mt-1 text-sm text-slate-500">学分达标、成绩完整度与申诉状态一览</p>
      </section>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">学生总数</p>
          <p className="campus-kpi-value">{data.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已达标</p>
          <p className="campus-kpi-value text-emerald-600">{eligibleCount}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">未达标</p>
          <p className="campus-kpi-value text-red-600">{data.length - eligibleCount}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">所需学分</p>
          <p className="campus-kpi-value">{minCredits}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="campus-toolbar flex-wrap gap-2">
        <input
          className="campus-input"
          placeholder="搜索姓名 / 邮箱 / 院系…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="campus-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="all">全部学生</option>
          <option value="eligible">已达标</option>
          <option value="ineligible">未达标</option>
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600 shrink-0">所需学分</label>
          <input
            type="number"
            className="campus-input w-20"
            value={minCredits}
            min={1}
            max={240}
            onChange={(e) => setMinCredits(Number(e.target.value))}
          />
        </div>
        <button
          type="button"
          onClick={exportCSV}
          className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          ⬇️ 导出 CSV
        </button>
      </div>

      {loading ? (
        <div className="campus-card px-6 py-12 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : (
        <div className="campus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">学生</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">院系</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">毕业年</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">完成学分</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">进行中</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">缺学分</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">缺成绩</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500">申诉</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">状态</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">
                      暂无数据
                    </td>
                  </tr>
                )}
                {filtered.map((s) => (
                  <tr
                    key={s.userId}
                    className={`border-b border-slate-100 transition ${
                      s.eligible ? "hover:bg-emerald-50/40" : "hover:bg-red-50/40"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{s.name ?? "—"}</p>
                      <p className="text-xs text-slate-400">{s.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{s.department ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{s.graduationYear ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      {s.creditsDone}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">{s.creditsInProgress}</td>
                    <td className="px-4 py-3 text-right">
                      {s.creditsNeeded > 0 ? (
                        <span className="text-red-600 font-bold">{s.creditsNeeded}</span>
                      ) : (
                        <span className="text-emerald-600">✓</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.missingGrades > 0 ? (
                        <span className="text-amber-600 font-bold">{s.missingGrades}</span>
                      ) : (
                        <span className="text-emerald-600">✓</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.openAppeals > 0 ? (
                        <span className="text-amber-600 font-bold">{s.openAppeals}</span>
                      ) : (
                        <span className="text-emerald-600">✓</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.eligible ? (
                        <span className="campus-chip border-emerald-200 bg-emerald-50 text-emerald-700">
                          ✅ 达标
                        </span>
                      ) : (
                        <span className="campus-chip border-red-200 bg-red-50 text-red-700">
                          ❌ 未达标
                        </span>
                      )}
                    </td>
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
