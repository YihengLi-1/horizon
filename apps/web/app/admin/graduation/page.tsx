"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type GradStudent = {
  userId: string;
  email: string;
  name: string | null;
  department: string | null;
  creditsDone: number;
  creditsInProgress: number;
  creditsNeeded: number;
  missingGrades: number;
  openAppeals: number;
  pendingApproval: number;
  eligible: boolean;
};

export default function GraduationPage() {
  const [rows, setRows] = useState<GradStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "eligible" | "ineligible">("all");
  const [minCredits, setMinCredits] = useState(120);

  useEffect(() => {
    setLoading(true);
    setError("");
    void apiFetch<GradStudent[]>(`/admin/graduation?minCredits=${minCredits}`)
      .then((d) => setRows(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [minCredits]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) => {
      const matchSearch = !q || r.email.toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q) || (r.department ?? "").toLowerCase().includes(q);
      const matchFilter = filter === "all" || (filter === "eligible" ? r.eligible : !r.eligible);
      return matchSearch && matchFilter;
    });
  }, [rows, search, filter]);

  const eligible = rows.filter((r) => r.eligible).length;
  const ineligible = rows.filter((r) => !r.eligible).length;

  function exportCsv() {
    const headers = ["邮箱", "姓名", "专业", "已完成学分", "在读学分", "缺少学分", "缺成绩", "待申诉", "是否符合"];
    const csvRows = [
      headers.join(","),
      ...filtered.map((r) => [
        `"${r.email}"`, `"${r.name ?? ""}"`, `"${r.department ?? ""}"`,
        r.creditsDone, r.creditsInProgress, r.creditsNeeded,
        r.missingGrades, r.openAppeals, r.eligible ? "是" : "否"
      ].join(","))
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `graduation-clearance-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业管理</p>
        <h1 className="campus-hero-title">毕业审核</h1>
        <p className="campus-hero-subtitle">检查学生是否满足毕业所需学分、成绩与申诉要求</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">审核学生总数</p>
          <p className="campus-kpi-value">{loading ? "—" : rows.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">符合毕业条件</p>
          <p className="campus-kpi-value text-emerald-600">{loading ? "—" : eligible}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">尚不符合条件</p>
          <p className="campus-kpi-value text-red-600">{loading ? "—" : ineligible}</p>
        </div>
      </section>

      <div className="campus-toolbar">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600 whitespace-nowrap">最低学分：</label>
          <input
            type="number"
            className="campus-input w-24"
            value={minCredits}
            min={60}
            max={200}
            onChange={(e) => setMinCredits(Number(e.target.value) || 120)}
          />
        </div>
        <select className="campus-select w-36" value={filter} onChange={(e) => setFilter(e.target.value as "all" | "eligible" | "ineligible")}>
          <option value="all">全部学生</option>
          <option value="eligible">符合条件</option>
          <option value="ineligible">不符合条件</option>
        </select>
        <input
          className="campus-input max-w-xs"
          placeholder="搜索邮箱、姓名或专业…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={exportCsv} disabled={!filtered.length} className="campus-btn-ghost shrink-0 disabled:opacity-40">
          CSV 导出
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="campus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <th className="px-4 py-3 text-left">学生</th>
                <th className="px-4 py-3 text-left">专业</th>
                <th className="px-4 py-3 text-right">已完成</th>
                <th className="px-4 py-3 text-right">在读</th>
                <th className="px-4 py-3 text-right">缺少</th>
                <th className="px-4 py-3 text-right">缺成绩</th>
                <th className="px-4 py-3 text-right">申诉</th>
                <th className="px-4 py-3 text-left">状态</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">暂无数据</td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.userId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{row.name || "—"}</p>
                      <p className="text-xs text-slate-500">{row.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.department || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">{row.creditsDone}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{row.creditsInProgress}</td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${row.creditsNeeded > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {row.creditsNeeded > 0 ? `-${row.creditsNeeded}` : "✓"}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${row.missingGrades > 0 ? "text-amber-600 font-bold" : "text-slate-400"}`}>
                      {row.missingGrades || "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${row.openAppeals > 0 ? "text-red-600 font-bold" : "text-slate-400"}`}>
                      {row.openAppeals || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.eligible ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          ✓ 符合
                        </span>
                      ) : (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                          ✗ 待完成
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 ? (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            共 {filtered.length} 名学生 · 毕业条件：完成学分 ≥ {minCredits}，无缺失成绩，无待处理申诉
          </p>
        ) : null}
      </section>
    </div>
  );
}
