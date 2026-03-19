"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type RiskRow = {
  userId: string;
  name: string;
  email: string;
  programMajor: string;
  dropCount: number;
  gpa: number;
  enrolledCredits: number;
  riskScore: number;
};

type SortKey = "riskScore" | "gpa" | "dropCount";

function riskLevel(score: number): { label: string; color: string; bg: string; border: string } {
  if (score >= 70) return { label: "高风险", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" };
  if (score >= 50) return { label: "中风险", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" };
  return { label: "低风险", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" };
}

export default function DropoutRiskPage() {
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("riskScore");
  const [asc, setAsc] = useState(false);

  useEffect(() => {
    void apiFetch<RiskRow[]>("/admin/dropout-risk")
      .then((d) => setRows(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return [...rows]
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.programMajor ?? "").toLowerCase().includes(q))
      .sort((a, b) => {
        const av = a[sort];
        const bv = b[sort];
        return asc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
      });
  }, [rows, search, sort, asc]);

  const highRisk = rows.filter((r) => r.riskScore >= 70).length;
  const midRisk = rows.filter((r) => r.riskScore >= 50 && r.riskScore < 70).length;
  const noEnroll = rows.filter((r) => r.enrolledCredits === 0).length;

  function toggleSort(key: SortKey) {
    if (sort === key) setAsc((v) => !v);
    else { setSort(key); setAsc(false); }
  }

  function sortIcon(key: SortKey) {
    return sort === key ? (asc ? " ↑" : " ↓") : null;
  }

  function exportCsv() {
    const headers = ["姓名", "邮箱", "专业", "退课次数", "GPA", "在读学分", "风险评分"];
    const csvRows = [
      headers.join(","),
      ...filtered.map((r) => [
        `"${r.name}"`, `"${r.email}"`, `"${r.programMajor}"`,
        r.dropCount, r.gpa.toFixed(2), r.enrolledCredits, r.riskScore,
      ].join(",")),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `dropout-risk-${new Date().toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学生干预</p>
        <h1 className="campus-hero-title">退学风险预警</h1>
        <p className="campus-hero-subtitle">基于退课次数、GPA 和选课状态计算风险评分，辅助提前干预</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">风险学生总数</p>
          <p className="campus-kpi-value">{loading ? "—" : rows.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">高风险（≥70）</p>
          <p className="campus-kpi-value text-red-600">{loading ? "—" : highRisk}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">中风险（50–69）</p>
          <p className="campus-kpi-value text-amber-600">{loading ? "—" : midRisk}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">未在读</p>
          <p className="campus-kpi-value text-slate-600">{loading ? "—" : noEnroll}</p>
        </div>
      </section>

      {highRisk > 0 ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          ⚠ 共 <span className="font-bold">{highRisk}</span> 名学生处于高风险状态，建议及时联系学生进行学业支持。
        </div>
      ) : null}

      <div className="campus-toolbar">
        <input
          className="campus-input max-w-xs"
          placeholder="按姓名、邮箱或专业搜索…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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

      <section className="campus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <th className="px-4 py-3 text-left">学生</th>
                <th className="px-4 py-3 text-left">专业</th>
                <th
                  className="cursor-pointer px-4 py-3 text-right hover:text-slate-800"
                  onClick={() => toggleSort("dropCount")}
                >退课次数{sortIcon("dropCount")}</th>
                <th
                  className="cursor-pointer px-4 py-3 text-right hover:text-slate-800"
                  onClick={() => toggleSort("gpa")}
                >GPA{sortIcon("gpa")}</th>
                <th className="px-4 py-3 text-right">在读学分</th>
                <th
                  className="cursor-pointer px-4 py-3 text-right hover:text-slate-800"
                  onClick={() => toggleSort("riskScore")}
                >风险评分{sortIcon("riskScore")}</th>
                <th className="px-4 py-3 text-left">风险等级</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">暂无高风险学生</td></tr>
              ) : (
                filtered.map((row) => {
                  const risk = riskLevel(row.riskScore);
                  return (
                    <tr key={row.userId} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{row.name}</p>
                        <p className="text-xs text-slate-500">{row.email}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.programMajor || "—"}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">{row.dropCount}</td>
                      <td className={`px-4 py-3 text-right font-bold ${row.gpa >= 2.0 ? "text-emerald-600" : "text-red-600"}`}>
                        {row.gpa > 0 ? row.gpa.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">{row.enrolledCredits}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-slate-100">
                            <div
                              className={`h-1.5 rounded-full ${row.riskScore >= 70 ? "bg-red-400" : row.riskScore >= 50 ? "bg-amber-400" : "bg-blue-300"}`}
                              style={{ width: `${row.riskScore}%` }}
                            />
                          </div>
                          <span className="font-bold text-slate-900 w-7 text-right">{row.riskScore}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${risk.color} ${risk.bg} ${risk.border}`}>
                          {risk.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 ? (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
            共 {filtered.length} 名学生 · 风险评分 = 退课数×30 + 低GPA×40 + 无在读×30
          </p>
        ) : null}
      </section>
    </div>
  );
}
