"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";

const DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function minutesToTime(m: number) {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const min = (m % 60).toString().padStart(2, "0");
  return `${h}:${min}`;
}

type Conflict = {
  codeA: string; codeB: string;
  titleA: string; titleB: string;
  secA: string; secB: string;
  weekday: number;
  startA: number; endA: number;
  startB: number; endB: number;
};

type StudentConflicts = {
  studentId: string;
  email: string;
  legalName: string | null;
  conflicts: Conflict[];
};

type Term = { id: string; name: string };

export default function ScheduleConflictsPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [rows, setRows] = useState<StudentConflicts[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms")
      .then((d) => setTerms(d ?? []))
      .catch(() => {});
  }, []);

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

  async function load() {
    setLoading(true);
    setError("");
    setSearched(false);
    try {
      const params = termId ? `?termId=${termId}` : "";
      const d = await apiFetch<{ total: number; students: StudentConflicts[] }>(`/admin/schedule-conflicts${params}`);
      setRows(d?.students ?? []);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((r) =>
      !q ||
      r.email.toLowerCase().includes(q) ||
      (r.legalName ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">注册管理</p>
        <h1 className="campus-title">排课冲突检测</h1>
        <p className="campus-subtitle">检测已注册学生中存在时间重叠排课的情况</p>
      </section>

      <div className="campus-card flex flex-wrap items-end gap-3 p-5">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">按学期筛选（可选）</label>
          <select
            className="campus-select"
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
          >
            <option value="">全部学期</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "检测中…" : "开始检测"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {searched ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="campus-kpi">
            <p className="campus-kpi-label">检测学生总数</p>
            <p className="campus-kpi-value">{filtered.length}</p>
          </div>
          <div className={`campus-kpi ${filtered.length > 0 ? "border-red-200 bg-red-50/70" : "border-emerald-200 bg-emerald-50/70"}`}>
            <p className={`campus-kpi-label ${filtered.length > 0 ? "text-red-700" : "text-emerald-700"}`}>
              {filtered.length > 0 ? "存在冲突" : "无冲突"}
            </p>
            <p className={`campus-kpi-value ${filtered.length > 0 ? "text-red-900" : "text-emerald-900"}`}>
              {filtered.length > 0 ? `${filtered.length} 名学生` : "✓ 全部正常"}
            </p>
          </div>
        </div>
      ) : null}

      {searched && rows.length > 0 ? (
        <div className="campus-toolbar">
          <input
            ref={searchRef}
            className="campus-input max-w-xs"
            placeholder="按姓名或邮箱搜索… (/)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      ) : null}

      {searched && filtered.length === 0 && !loading ? (
        <div className="campus-card p-10 text-center text-slate-400">
          {rows.length === 0 ? "✓ 未发现任何排课时间冲突" : "暂无匹配学生"}
        </div>
      ) : null}

      <div className="space-y-3">
        {filtered.map((student) => {
          const open = expanded.has(student.studentId);
          return (
            <div key={student.studentId} className="campus-card overflow-hidden">
              <button
                type="button"
                className="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-slate-50"
                onClick={() => toggle(student.studentId)}
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {student.legalName ?? student.email}
                  </p>
                  <p className="text-xs text-slate-500">{student.email}</p>
                  <p className="mt-1 text-xs text-red-600">
                    {student.conflicts.length} 处时间冲突
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/students/${student.studentId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-blue-500 hover:text-blue-700"
                  >
                    查看详情
                  </Link>
                  <span className="text-slate-400">{open ? "▲" : "▼"}</span>
                </div>
              </button>

              {open ? (
                <div className="border-t border-slate-100 px-4 py-3 space-y-2">
                  {student.conflicts.map((c, i) => (
                    <div key={i} className="rounded-lg border border-red-100 bg-red-50/50 p-3 text-xs">
                      <p className="font-semibold text-red-800">
                        {DAYS[c.weekday]} {minutesToTime(c.startA < c.startB ? c.startA : c.startB)}–{minutesToTime(c.endA > c.endB ? c.endA : c.endB)}
                      </p>
                      <div className="mt-1 grid grid-cols-2 gap-2 text-slate-700">
                        <div>
                          <p className="font-medium">{c.codeA} ({c.secA})</p>
                          <p className="text-slate-500">{c.titleA}</p>
                          <p className="text-slate-400">{minutesToTime(c.startA)}–{minutesToTime(c.endA)}</p>
                        </div>
                        <div>
                          <p className="font-medium">{c.codeB} ({c.secB})</p>
                          <p className="text-slate-500">{c.titleB}</p>
                          <p className="text-slate-400">{minutesToTime(c.startB)}–{minutesToTime(c.endB)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
