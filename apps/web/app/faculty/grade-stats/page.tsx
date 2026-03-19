"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

const GRADE_COLORS: Record<string, string> = {
  "A+": "bg-emerald-500", A: "bg-emerald-500", "A-": "bg-emerald-400",
  "B+": "bg-blue-400",    B: "bg-blue-400",    "B-": "bg-blue-300",
  "C+": "bg-amber-400",   C: "bg-amber-400",   "C-": "bg-amber-300",
  "D+": "bg-orange-400",  D: "bg-orange-400",  "D-": "bg-orange-300",
  F:    "bg-red-500",     W: "bg-slate-400",
};

type GradeDistItem = { grade: string; count: number };

type SectionStats = {
  sectionId: string;
  sectionCode: string;
  termId: string;
  termName: string;
  courseCode: string;
  courseTitle: string;
  completed: number;
  avgGpa: number | null;
  passRate: number | null;
  distribution: GradeDistItem[];
};

function gpaTone(gpa: number | null) {
  if (gpa === null) return "text-slate-400";
  if (gpa >= 3.5) return "text-emerald-700 font-bold";
  if (gpa >= 2.5) return "text-blue-700";
  if (gpa >= 2.0) return "text-amber-700";
  return "text-red-700 font-bold";
}

function GradeBar({ distribution, total }: { distribution: GradeDistItem[]; total: number }) {
  if (total === 0) return <p className="text-xs text-slate-400">暂无成绩数据</p>;
  return (
    <div className="space-y-1">
      {distribution.map(({ grade, count }) => {
        const pct = Math.round((count / total) * 100);
        return (
          <div key={grade} className="flex items-center gap-2 text-xs">
            <span className="w-7 text-right font-mono text-slate-600">{grade}</span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
              <div
                className={`h-full rounded ${GRADE_COLORS[grade] ?? "bg-slate-400"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-14 text-slate-500">{count} ({pct}%)</span>
          </div>
        );
      })}
    </div>
  );
}

export default function FacultyGradeStatsPage() {
  const [rows, setRows] = useState<SectionStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [termFilter, setTermFilter] = useState("");

  useEffect(() => {
    void apiFetch<SectionStats[]>("/faculty/grade-stats")
      .then((d) => setRows(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const terms = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; name: string }[] = [];
    for (const r of rows) {
      if (!seen.has(r.termId)) {
        seen.add(r.termId);
        result.push({ id: r.termId, name: r.termName });
      }
    }
    return result;
  }, [rows]);

  const filtered = termFilter ? rows.filter((r) => r.termId === termFilter) : rows;

  const overallAvgGpa = useMemo(() => {
    const withGpa = filtered.filter((r) => r.avgGpa !== null);
    if (!withGpa.length) return null;
    return (withGpa.reduce((s, r) => s + r.avgGpa!, 0) / withGpa.length).toFixed(2);
  }, [filtered]);

  const overallPassRate = useMemo(() => {
    const withRate = filtered.filter((r) => r.passRate !== null);
    if (!withRate.length) return null;
    return Math.round(withRate.reduce((s, r) => s + r.passRate!, 0) / withRate.length);
  }, [filtered]);

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <h1 className="campus-title">我的成绩分布统计</h1>
        <p className="campus-subtitle">查看各班级最终成绩分布、平均绩点和通过率</p>
      </div>

      {!loading && rows.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="campus-kpi">
            <p className="campus-kpi-label">班级总数</p>
            <p className="campus-kpi-value">{filtered.length}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">平均 GPA</p>
            <p className={`campus-kpi-value ${gpaTone(overallAvgGpa ? parseFloat(overallAvgGpa) : null)}`}>
              {overallAvgGpa ?? "—"}
            </p>
          </div>
          <div className="campus-kpi border-emerald-200 bg-emerald-50/70">
            <p className="campus-kpi-label text-emerald-700">平均通过率</p>
            <p className="campus-kpi-value text-emerald-900">
              {overallPassRate !== null ? `${overallPassRate}%` : "—"}
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {terms.length > 1 ? (
        <div className="campus-toolbar">
          <select
            className="campus-select"
            value={termFilter}
            onChange={(e) => setTermFilter(e.target.value)}
          >
            <option value="">全部学期</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="campus-card p-10 text-center text-slate-400">
          {rows.length === 0 ? "暂无您主讲的班级成绩数据" : "该学期暂无数据"}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((s) => (
            <div key={s.sectionId} className="campus-card p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900">{s.courseCode}</span>
                    <span className="text-sm text-slate-600">{s.courseTitle}</span>
                    <span className="campus-chip border-slate-200 bg-slate-50 text-xs text-slate-500">
                      {s.termName} · {s.sectionCode}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">已完成学生：{s.completed} 人</p>
                </div>
                <div className="flex gap-4 text-sm">
                  <div className="text-right">
                    <p className="text-xs text-slate-400">平均 GPA</p>
                    <p className={gpaTone(s.avgGpa)}>{s.avgGpa?.toFixed(2) ?? "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">通过率</p>
                    <p className={s.passRate !== null && s.passRate < 60 ? "font-bold text-red-700" : "text-slate-700"}>
                      {s.passRate !== null ? `${s.passRate}%` : "—"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <GradeBar distribution={s.distribution} total={s.completed} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
