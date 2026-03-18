"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };

type TopSection = {
  id: string;
  sectionCode: string;
  courseCode: string;
  courseTitle: string;
  enrolled: number;
  capacity: number;
};

type DeptBreakdown = {
  dept: string;
  enrolled: number;
  sections: number;
};

type GpaRow = {
  bucket: string;
  count: number;
};

type ReportsSummary = {
  totalStudents: number;
  totalCourses: number;
  totalSections: number;
  enrollmentByStatus: Record<string, number>;
  avgCreditsPerStudent: number;
  topSections: TopSection[];
  deptBreakdown: DeptBreakdown[];
  gpaDistribution: GpaRow[];
};

const STATUS_LABEL: Record<string, string> = {
  ENROLLED: "已注册",
  WAITLISTED: "候补中",
  DROPPED: "已退课",
  COMPLETED: "已完成",
  PENDING_APPROVAL: "待审批",
};

export default function ReportsSummaryPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [data, setData] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms")
      .then((d) => setTerms(d ?? []))
      .catch(() => {});
  }, []);

  const load = useCallback(async (tid: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (tid) params.set("termId", tid);
      const d = await apiFetch<ReportsSummary>(`/admin/reports/summary${params.size ? `?${params}` : ""}`);
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "报告加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(termId);
  }, [load, termId]);

  const maxDept = data ? Math.max(1, ...data.deptBreakdown.map((d) => d.enrolled)) : 1;
  const maxGpa = data ? Math.max(1, ...data.gpaDistribution.map((g) => g.count)) : 1;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">管理员</p>
        <h1 className="font-heading text-3xl font-bold text-slate-900">报告汇总</h1>
        <p className="mt-2 text-sm text-slate-600">
          查看全校招生、选课及成绩的综合报告概览。
        </p>
      </section>

      <section className="campus-toolbar">
        <select
          className="campus-select w-52"
          value={termId}
          onChange={(e) => setTermId(e.target.value)}
        >
          <option value="">全部学期</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </section>

      {error ? (
        <section className="campus-card p-6 text-sm text-red-600">报告暂时不可用：{error}</section>
      ) : null}

      {loading ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="campus-kpi animate-pulse">
              <div className="h-4 w-24 rounded bg-slate-200" />
              <div className="mt-3 h-8 w-16 rounded bg-slate-100" />
            </div>
          ))}
        </section>
      ) : null}

      {!loading && data ? (
        <>
          {/* KPI row */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">在校学生</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{data.totalStudents.toLocaleString()}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">开设课程</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{data.totalCourses.toLocaleString()}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">教学班数</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{data.totalSections.toLocaleString()}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">人均已注册学分</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{data.avgCreditsPerStudent}</p>
            </div>
          </section>

          {/* Enrollment by status */}
          <section className="campus-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">注册状态分布</h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(data.enrollmentByStatus).map(([status, count]) => (
                <div key={status} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center min-w-[100px]">
                  <p className="text-xs text-slate-500">{STATUS_LABEL[status] ?? status}</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{count.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            {/* Top sections */}
            <section className="campus-card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-800">选课人数最多教学班</h2>
              {data.topSections.length === 0 ? (
                <p className="text-sm text-slate-400">暂无数据。</p>
              ) : (
                <div className="space-y-2">
                  {data.topSections.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <span className="text-xs font-bold text-slate-400 w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 truncate">
                          {s.courseCode} §{s.sectionCode}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{s.courseTitle}</p>
                      </div>
                      <span className="campus-chip text-xs whitespace-nowrap">
                        {s.enrolled} / {s.capacity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* GPA Distribution */}
            <section className="campus-card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-800">GPA 分布</h2>
              {data.gpaDistribution.length === 0 ? (
                <p className="text-sm text-slate-400">暂无数据。</p>
              ) : (
                <div className="space-y-2">
                  {data.gpaDistribution.map((g) => (
                    <div key={g.bucket} className="flex items-center gap-2 text-xs">
                      <span className="w-12 text-right text-slate-500">{g.bucket}</span>
                      <div className="flex-1 rounded-full bg-slate-100 h-5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${Math.round((g.count / maxGpa) * 100)}%` }}
                        />
                      </div>
                      <span className="w-10 text-slate-700 font-medium">{g.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Dept breakdown */}
          <section className="campus-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-800">院系选课分布</h2>
            {data.deptBreakdown.length === 0 ? (
              <p className="text-sm text-slate-400">暂无数据。</p>
            ) : (
              <div className="space-y-2">
                {data.deptBreakdown.map((d) => (
                  <div key={d.dept} className="flex items-center gap-3 text-sm">
                    <span className="w-28 truncate text-xs text-slate-600 text-right">{d.dept || "未分组"}</span>
                    <div className="flex-1 rounded-full bg-slate-100 h-5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${Math.round((d.enrolled / maxDept) * 100)}%` }}
                      />
                    </div>
                    <span className="w-16 text-xs text-slate-700">
                      {d.enrolled} 人 · {d.sections} 班
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
