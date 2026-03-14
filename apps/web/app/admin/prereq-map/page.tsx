"use client";

/**
 * Admin Prerequisite Map
 * Shows all courses and their prerequisite relationships as a filterable table.
 * Summary KPIs + adjacency list view — no external graph library needed.
 */

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type MapNode = {
  id: string; code: string; title: string; credits: number;
  prereqCount: number; inDegree: number;
};
type MapEdge = { from: string; to: string; fromCode: string; toCode: string };
type PrereqMap = {
  nodes: MapNode[];
  edges: MapEdge[];
  summary: { totalCourses: number; coursesWithPrereqs: number; totalPrereqRelations: number };
};

export default function PrereqMapPage() {
  const [data, setData] = useState<PrereqMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "has-prereqs" | "no-prereqs" | "is-prereq">("all");

  useEffect(() => {
    void apiFetch<PrereqMap>("/admin/prereq-map")
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  // Build a set of course IDs that are prerequisites for something
  const isPrereqSet = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(data.edges.map((e) => e.from));
  }, [data]);

  // Build a map: courseId -> list of prerequisite codes
  const prereqsOf = useMemo(() => {
    if (!data) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const e of data.edges) {
      if (!map.has(e.to)) map.set(e.to, []);
      map.get(e.to)!.push(e.fromCode);
    }
    return map;
  }, [data]);

  // Build a map: courseId -> list of courses that require it
  const requiredByMap = useMemo(() => {
    if (!data) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const e of data.edges) {
      if (!map.has(e.from)) map.set(e.from, []);
      map.get(e.from)!.push(e.toCode);
    }
    return map;
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.nodes.filter((n) => {
      const matchSearch = !search ||
        n.code.toLowerCase().includes(search.toLowerCase()) ||
        n.title.toLowerCase().includes(search.toLowerCase());
      const matchFilter =
        filter === "all" ? true :
        filter === "has-prereqs" ? n.prereqCount > 0 :
        filter === "no-prereqs" ? n.prereqCount === 0 :
        isPrereqSet.has(n.id);
      return matchSearch && matchFilter;
    });
  }, [data, search, filter, isPrereqSet]);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Course Structure</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">先修课程关系图</h1>
        <p className="mt-1 text-sm text-slate-500">查看各课程的先修要求及依赖链</p>
      </section>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : data ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">课程总数</p>
              <p className="campus-kpi-value">{data.summary.totalCourses}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">有先修要求</p>
              <p className="campus-kpi-value text-indigo-600">{data.summary.coursesWithPrereqs}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">先修关系总数</p>
              <p className="campus-kpi-value text-emerald-600">{data.summary.totalPrereqRelations}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="campus-toolbar gap-2 flex-wrap">
            <input
              className="campus-input flex-1 min-w-48"
              placeholder="搜索课程代码或名称…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {(["all", "has-prereqs", "no-prereqs", "is-prereq"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`campus-chip ${filter === f ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 bg-slate-50 text-slate-600"}`}
              >
                {f === "all" ? "全部" : f === "has-prereqs" ? "有先修要求" : f === "no-prereqs" ? "无先修要求" : "被依赖课程"}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="campus-card overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-500">
              共 {filtered.length} 门课程
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2 pl-4 text-left font-semibold">课程</th>
                    <th className="pb-2 pr-3 text-right font-semibold">学分</th>
                    <th className="pb-2 pr-3 text-left font-semibold">先修课程</th>
                    <th className="pb-2 pr-4 text-left font-semibold">被以下课程依赖</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((n) => {
                    const prereqs = prereqsOf.get(n.id) ?? [];
                    const requiredBy = requiredByMap.get(n.id) ?? [];
                    return (
                      <tr key={n.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2.5 pl-4 pr-3">
                          <span className="font-mono font-bold text-indigo-700">{n.code}</span>
                          <span className="text-slate-500 ml-2 hidden sm:inline">
                            {n.title.length > 35 ? n.title.slice(0, 35) + "…" : n.title}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-slate-600">{n.credits}</td>
                        <td className="py-2.5 pr-3">
                          {prereqs.length === 0 ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {prereqs.map((code) => (
                                <span key={code} className="inline-block rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-indigo-700 text-xs">
                                  {code}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 pr-4">
                          {requiredBy.length === 0 ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {requiredBy.map((code) => (
                                <span key={code} className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-emerald-700 text-xs">
                                  {code}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Chain depth legend */}
          <div className="campus-card p-4 space-y-2">
            <h2 className="text-sm font-bold text-slate-900">说明</h2>
            <div className="flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded bg-indigo-100" />
                <span>先修课程（蓝色标签）</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded bg-emerald-100" />
                <span>依赖该课程的课程（绿色标签）</span>
              </span>
              <span>InDegree = 被多少课程作为先修</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
