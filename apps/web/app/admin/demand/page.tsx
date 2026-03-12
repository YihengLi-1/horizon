"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };
type DemandRow = {
  id: string;
  sectionCode: string;
  course: { code: string; title: string; credits: number };
  term: { id: string; name: string };
  instructorName: string;
  capacity: number;
  enrolled: number;
  inCart: number;
  waitlisted: number;
  watching: number;
  demand: number;
  utilizationPct: number | null;
};

function DemandBar({ demand, max }: { demand: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((demand / max) * 100)) : 0;
  const color = pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-amber-500" : "bg-indigo-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-bold text-slate-700">{demand}</span>
    </div>
  );
}

function UtilBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-slate-400">—</span>;
  const color = pct >= 90 ? "text-red-600" : pct >= 70 ? "text-amber-600" : "text-emerald-600";
  return <span className={`text-xs font-bold ${color}`}>{pct}%</span>;
}

export default function AdminDemandPage() {
  const [rows, setRows] = useState<DemandRow[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<keyof DemandRow>("demand");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");

  const load = useCallback(async (termId?: string) => {
    setLoading(true);
    try {
      const [demandData, termsData] = await Promise.all([
        apiFetch<DemandRow[]>(`/admin/demand-report${termId ? `?termId=${termId}` : ""}`),
        apiFetch<Term[]>("/academics/terms")
      ]);
      setRows(demandData);
      setTerms(termsData);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleTermChange = (id: string) => {
    setSelectedTerm(id);
    void load(id || undefined);
  };

  function toggleSort(key: keyof DemandRow) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.course.code.toLowerCase().includes(q) ||
      r.course.title.toLowerCase().includes(q) ||
      r.instructorName.toLowerCase().includes(q) ||
      r.sectionCode.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    const va = a[sortKey] as number;
    const vb = b[sortKey] as number;
    if (typeof va === "number" && typeof vb === "number") {
      return sortDir === "asc" ? va - vb : vb - va;
    }
    return 0;
  });

  const maxDemand = Math.max(1, ...rows.map((r) => r.demand));
  const totalDemand = rows.reduce((s, r) => s + r.demand, 0);
  const totalWaitlisted = rows.reduce((s, r) => s + r.waitlisted, 0);
  const topSection = rows[0];

  function SortIcon({ k }: { k: keyof DemandRow }) {
    if (sortKey !== k) return <span className="text-slate-300">↕</span>;
    return <span className="text-indigo-600">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function th(label: string, k: keyof DemandRow) {
    return (
      <th
        className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 cursor-pointer hover:text-indigo-600 select-none"
        onClick={() => toggleSort(k)}
      >
        {label} <SortIcon k={k} />
      </th>
    );
  }

  // CSV export
  function exportCsv() {
    const header = ["Course", "Section", "Term", "Instructor", "Capacity", "Enrolled", "Util%", "In Cart", "Waitlisted", "Watching", "Total Demand"];
    const csvRows = [header, ...sorted.map((r) => [
      r.course.code, r.sectionCode, r.term.name, r.instructorName,
      r.capacity, r.enrolled, r.utilizationPct ?? "", r.inCart, r.waitlisted, r.watching, r.demand
    ])];
    const blob = new Blob([csvRows.map((row) => row.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "section-demand.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Enrollment Intelligence</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">教学班需求分析</h1>
        <p className="mt-1 text-sm text-slate-500">按需求（购物车 + 候补 + 关注）降序排列各教学班</p>
      </section>

      {!loading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="campus-kpi">
            <p className="campus-kpi-label">总需求信号</p>
            <p className="campus-kpi-value">{totalDemand}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">候补总人数</p>
            <p className="campus-kpi-value text-amber-600">{totalWaitlisted}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">教学班总数</p>
            <p className="campus-kpi-value">{rows.length}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">最高需求</p>
            <p className="campus-kpi-value text-red-600">{topSection?.demand ?? 0}</p>
            <p className="text-xs text-slate-400 truncate">{topSection?.course.code}</p>
          </div>
        </div>
      )}

      <div className="campus-toolbar flex-wrap gap-3">
        <input
          className="campus-input flex-1"
          placeholder="搜索课程代码、名称、教师…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="campus-select"
          value={selectedTerm}
          onChange={(e) => handleTermChange(e.target.value)}
        >
          <option value="">所有学期</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          CSV 导出
        </button>
      </div>

      {loading ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-2xl">⏳</p>
          <p className="mt-2 text-sm text-slate-600">加载中…</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-3xl">📊</p>
          <p className="mt-2 text-sm font-medium text-slate-600">暂无数据</p>
        </div>
      ) : (
        <div className="campus-card overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">课程</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">教学班</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">学期</th>
                {th("容量", "capacity")}
                {th("已选", "enrolled")}
                {th("利用率", "utilizationPct")}
                {th("购物车", "inCart")}
                {th("候补", "waitlisted")}
                {th("关注", "watching")}
                {th("总需求", "demand")}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sorted.map((row, i) => (
                <tr key={row.id} className={`hover:bg-slate-50 ${i === 0 ? "bg-red-50/30" : ""}`}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-1 rounded">{row.course.code}</span>
                      <span className="text-slate-700 truncate max-w-[160px]">{row.course.title}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-500">§{row.sectionCode}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{row.term.name}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{row.capacity}</td>
                  <td className="px-3 py-2.5 text-xs font-semibold text-slate-700">{row.enrolled}</td>
                  <td className="px-3 py-2.5"><UtilBar pct={row.utilizationPct} /></td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{row.inCart}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-bold ${row.waitlisted > 0 ? "text-amber-600" : "text-slate-400"}`}>
                      {row.waitlisted}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{row.watching}</td>
                  <td className="px-3 py-2.5">
                    <DemandBar demand={row.demand} max={maxDemand} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
