"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type PrereqNode = {
  id: string;
  code: string;
  title: string;
  credits: number;
  prereqCount: number;
  inDegree: number;
};

type PrereqEdge = {
  from: string;
  to: string;
  fromCode: string;
  toCode: string;
};

type PrereqMapData = {
  nodes: PrereqNode[];
  edges: PrereqEdge[];
  summary: {
    totalCourses: number;
    coursesWithPrereqs: number;
    totalPrereqRelations: number;
  };
};

export default function PrereqMapPage() {
  const [data, setData] = useState<PrereqMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "adj">("table");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "SELECT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    void apiFetch<PrereqMapData>("/admin/prereq-map")
      .then((d) => setData(d ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.nodes.filter(
      (n) => !q || n.code.toLowerCase().includes(q) || n.title.toLowerCase().includes(q)
    );
  }, [data, search]);

  // Build adjacency: for each node, which courses require it as a prereq
  const requiresMap = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!data) return m;
    for (const edge of data.edges) {
      if (!m.has(edge.from)) m.set(edge.from, []);
      m.get(edge.from)!.push(edge.toCode);
    }
    return m;
  }, [data]);

  // For each node, list of its prereq codes
  const prereqsMap = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!data) return m;
    for (const edge of data.edges) {
      if (!m.has(edge.to)) m.set(edge.to, []);
      m.get(edge.to)!.push(edge.fromCode);
    }
    return m;
  }, [data]);

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">课程管理</p>
        <h1 className="campus-title">先修课图谱</h1>
        <p className="campus-subtitle">可视化课程先修依赖关系，查看入度与被依赖情况</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">课程总数</p>
          <p className="campus-kpi-value">{loading ? "—" : data?.summary.totalCourses}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">有先修要求</p>
          <p className="campus-kpi-value">{loading ? "—" : data?.summary.coursesWithPrereqs}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">先修关系总数</p>
          <p className="campus-kpi-value text-blue-600">{loading ? "—" : data?.summary.totalPrereqRelations}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="campus-toolbar">
        <input
          ref={searchRef}
          className="campus-input max-w-xs"
          placeholder="搜索课程代码或名称… (/)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`px-3 py-1.5 text-xs font-medium transition ${viewMode === "table" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            依赖表
          </button>
          <button
            type="button"
            onClick={() => setViewMode("adj")}
            className={`px-3 py-1.5 text-xs font-medium transition ${viewMode === "adj" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            邻接视图
          </button>
        </div>
      </div>

      {viewMode === "table" ? (
        <section className="campus-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3 text-left">课程</th>
                  <th className="px-4 py-3 text-right">学分</th>
                  <th className="px-4 py-3 text-right">先修数</th>
                  <th className="px-4 py-3 text-right">被依赖数</th>
                  <th className="px-4 py-3 text-left">需要先修</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">暂无先修关系数据</td></tr>
                ) : filtered.map((node) => {
                  const prereqs = prereqsMap.get(node.id) ?? [];
                  const requiredBy = requiresMap.get(node.id) ?? [];
                  return (
                    <tr key={node.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-bold text-[hsl(221_83%_43%)]">{node.code}</p>
                        <p className="text-xs text-slate-500">{node.title}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">{node.credits}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {prereqs.length > 0 ? (
                          <span className="font-bold text-amber-600">{prereqs.length}</span>
                        ) : "0"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {requiredBy.length > 0 ? (
                          <span className="font-bold text-emerald-600">{requiredBy.length}</span>
                        ) : "0"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {prereqs.length === 0 ? (
                            <span className="text-xs text-slate-400">无</span>
                          ) : prereqs.map((code) => (
                            <span key={code} className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                              {code}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="campus-card p-5">
          <p className="font-semibold text-slate-800 mb-4">邻接关系列表（先修 → 后续）</p>
          {loading ? (
            <p className="text-slate-400 text-sm">加载中…</p>
          ) : (data?.edges ?? []).length === 0 ? (
            <p className="text-slate-400 text-sm">暂无先修关系数据</p>
          ) : (
            <div className="space-y-1">
              {(data?.edges ?? []).filter((e) => {
                const q = search.toLowerCase();
                return !q || e.fromCode.toLowerCase().includes(q) || e.toCode.toLowerCase().includes(q);
              }).map((edge, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-slate-100">
                  <span className="font-mono text-xs font-bold text-[hsl(221_83%_43%)] w-20">{edge.fromCode}</span>
                  <span className="text-slate-400 text-xs">→ 是</span>
                  <span className="font-mono text-xs font-bold text-amber-600 w-20">{edge.toCode}</span>
                  <span className="text-slate-400 text-xs">的先修课</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
