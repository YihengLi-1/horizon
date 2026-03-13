"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = {
  id: string;
  name: string;
};

type Course = {
  id: string;
  code: string;
  title: string;
};

type GradeBreakdownRow = {
  grade: string;
  count: number;
};

type GradeDistributionReport = {
  courseCode: string;
  courseTitle: string;
  termName: string;
  gradeBreakdown: GradeBreakdownRow[];
  meanGpa: number;
  passRate: number;
};

export default function GradeDistributionPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [termId, setTermId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [report, setReport] = useState<GradeDistributionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      apiFetch<Term[]>("/academics/terms"),
      apiFetch<Array<{ id: string; code: string; title: string }>>("/admin/courses")
    ])
      .then(([termData, courseData]) => {
        const nextTerms = (termData ?? []).sort((a, b) => b.name.localeCompare(a.name));
        const nextCourses = (courseData ?? []).map((course) => ({
          id: course.id,
          code: course.code,
          title: course.title
        }));
        setTerms(nextTerms);
        setCourses(nextCourses);
        if (nextTerms[0]) setTermId(nextTerms[0].id);
        if (nextCourses[0]) setCourseId(nextCourses[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "加载筛选条件失败"));
  }, []);

  useEffect(() => {
    if (!termId || !courseId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ termId, courseId });
    void apiFetch<GradeDistributionReport>(`/admin/grade-distribution?${params.toString()}`)
      .then((data) => setReport(data))
      .catch((err) => {
        setReport(null);
        setError(err instanceof Error ? err.message : "加载成绩分布失败");
      })
      .finally(() => setLoading(false));
  }, [termId, courseId]);

  const totalCount = useMemo(
    () => (report?.gradeBreakdown ?? []).reduce((sum, row) => sum + row.count, 0),
    [report]
  );

  const maxCount = useMemo(
    () => Math.max(1, ...(report?.gradeBreakdown ?? []).map((row) => row.count)),
    [report]
  );

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Outcomes</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">成绩分布</h1>
        <p className="mt-1 text-sm text-slate-500">按课程与学期查看成绩分布、均值 GPA 和通过率</p>
      </section>

      <div className="campus-toolbar flex-wrap gap-3">
        <select className="campus-select" value={termId} onChange={(event) => setTermId(event.target.value)}>
          <option value="">选择学期</option>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.name}
            </option>
          ))}
        </select>
        <select className="campus-select" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
          <option value="">选择课程</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.code} · {course.title}
            </option>
          ))}
        </select>
      </div>

      {error ? <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : !report || !report.courseCode ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">请选择课程与学期查看成绩分布</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">课程</p>
              <p className="campus-kpi-value text-indigo-600">{report.courseCode}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">学期</p>
              <p className="campus-kpi-value">{report.termName}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">均值 GPA</p>
              <p className="campus-kpi-value text-emerald-600">{report.meanGpa.toFixed(2)}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">通过率</p>
              <p className="campus-kpi-value text-amber-600">{report.passRate.toFixed(1)}%</p>
            </div>
          </div>

          <div className="campus-card p-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">{report.courseTitle}</h2>
              <p className="text-sm text-slate-500">总样本数：{totalCount}</p>
            </div>

            {report.gradeBreakdown.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
                当前筛选没有成绩记录
              </div>
            ) : (
              <svg viewBox={`0 0 720 ${report.gradeBreakdown.length * 54 + 24}`} className="w-full">
                {report.gradeBreakdown.map((row, index) => {
                  const y = 20 + index * 54;
                  const barWidth = Math.max(12, (row.count / maxCount) * 460);
                  return (
                    <g key={row.grade} transform={`translate(0 ${y})`}>
                      <text x="0" y="22" fontSize="13" fill="#334155">{row.grade}</text>
                      <rect x="80" y="4" width="520" height="24" rx="12" fill="#e2e8f0" />
                      <rect x="80" y="4" width={barWidth} height="24" rx="12" fill="#4f46e5" />
                      <text x={Math.min(620, 92 + barWidth)} y="22" fontSize="12" fill="#0f172a">
                        {row.count}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </>
      )}
    </div>
  );
}
