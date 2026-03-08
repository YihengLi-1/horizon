import Link from "next/link";
import { serverApi } from "@/lib/server-api";
import AllTranscriptsExport from "./AllTranscriptsExport";
import PrintButton from "@/app/student/schedule/PrintButton";

export const dynamic = "force-dynamic";

type SearchParams = {
  termId?: string;
};

type TermRow = {
  id: string;
  name: string;
};

type EnrollmentRow = {
  id: string;
  finalGrade?: string | null;
  term?: { name?: string };
  student?: {
    email?: string;
    studentProfile?: {
      legalName?: string;
    };
  };
  section?: {
    course?: {
      code?: string;
      title?: string;
      credits?: number;
    };
  };
};

type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

type ReportsSummary = {
  totalStudents: number;
  totalCourses: number;
  totalSections: number;
  avgCreditsPerStudent: number;
  enrollmentByStatus: Record<string, number>;
  topSections: Array<{
    sectionId: string;
    courseCode: string;
    title: string;
    enrolled: number;
    capacity: number;
    fillRate: number;
  }>;
  deptBreakdown: Array<{
    dept: string;
    enrolled: number;
    waitlisted: number;
    dropped: number;
  }>;
  gpaDistribution: Array<{
    tier: string;
    count: number;
  }>;
};

type DataQuality = {
  sectionsNoInstructor: Array<{ id: string; course?: { code?: string; title?: string } }>;
  sectionsNoMeetings: Array<{ id: string; course?: { code?: string; title?: string } }>;
  enrollmentsNoGrade: number;
  studentsNoProfile: number;
  coursesNoSections: Array<{ id: string; code?: string; title?: string }>;
};

const emptySummary: ReportsSummary = {
  totalStudents: 0,
  totalCourses: 0,
  totalSections: 0,
  avgCreditsPerStudent: 0,
  enrollmentByStatus: {},
  topSections: [],
  deptBreakdown: [],
  gpaDistribution: []
};

async function fetchCompletedEnrollments(termId?: string): Promise<EnrollmentRow[]> {
  const rows: EnrollmentRow[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const params = new URLSearchParams({ page: String(page), pageSize: "500", status: "COMPLETED" });
    if (termId) params.set("termId", termId);
    const result = await serverApi<PaginatedResponse<EnrollmentRow>>(`/admin/enrollments?${params.toString()}`).catch(() => null);
    if (!result) break;
    rows.push(...result.data);
    totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
    page += 1;
  }

  return rows;
}

function gradePoints(grade: string): number {
  const map: Record<string, number> = {
    "A+": 4,
    A: 4,
    "A-": 3.7,
    "B+": 3.3,
    B: 3,
    "B-": 2.7,
    "C+": 2.3,
    C: 2,
    "C-": 1.7,
    "D+": 1.3,
    D: 1,
    "D-": 0.7,
    F: 0
  };
  return map[grade] ?? 0;
}

export default async function ReportsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = (await searchParams) ?? {};
  const selectedTermId = params.termId ?? "";

  const [terms, summary, dataQuality, completedEnrollments] = await Promise.all([
    serverApi<TermRow[]>("/academics/terms").catch(() => []),
    serverApi<ReportsSummary>(`/admin/reports/summary${selectedTermId ? `?termId=${selectedTermId}` : ""}`).catch(() => emptySummary),
    serverApi<DataQuality>("/admin/data-quality").catch(() => ({
      sectionsNoInstructor: [],
      sectionsNoMeetings: [],
      enrollmentsNoGrade: 0,
      studentsNoProfile: 0,
      coursesNoSections: []
    })),
    fetchCompletedEnrollments(selectedTermId || undefined)
  ]);

  const maxGpaTierCount = Math.max(...summary.gpaDistribution.map((item) => item.count), 1);
  const enrollmentByStatus = summary.enrollmentByStatus;
  const noGpaStudents = dataQuality.studentsNoProfile;
  const noInstructor = dataQuality.sectionsNoInstructor.length;
  const noGrade = dataQuality.enrollmentsNoGrade;
  const statusEntries = [
    ["ENROLLED", "Enrolled"],
    ["WAITLISTED", "Waitlisted"],
    ["PENDING_APPROVAL", "Pending"],
    ["DROPPED", "Dropped"],
    ["COMPLETED", "Completed"]
  ] as const;
  const dataQualityRows = [
    {
      label: "教学班无授课教师",
      count: noInstructor,
      href: "/admin/sections",
      ok: noInstructor === 0
    },
    {
      label: "教学班无上课时间",
      count: dataQuality.sectionsNoMeetings.length,
      href: "/admin/sections",
      ok: dataQuality.sectionsNoMeetings.length === 0
    },
    {
      label: "已完成选课缺少成绩",
      count: noGrade,
      href: "/admin/enrollments?status=COMPLETED",
      ok: noGrade === 0
    },
    {
      label: "学生缺少档案",
      count: noGpaStudents,
      href: "/admin/students",
      ok: noGpaStudents === 0
    },
    {
      label: "课程没有教学班",
      count: dataQuality.coursesNoSections.length,
      href: "/admin/courses",
      ok: dataQuality.coursesNoSections.length === 0
    }
  ];

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="reports-title text-2xl font-bold text-slate-900">Reports</h1>
            <p className="mt-1 text-sm text-slate-500">Enrollment, GPA, and data-quality overview by term.</p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <AllTranscriptsExport
              enrollments={completedEnrollments.map((enrollment) => ({
                studentName: enrollment.student?.studentProfile?.legalName ?? "",
                studentEmail: enrollment.student?.email ?? "",
                termName: enrollment.term?.name ?? "",
                courseCode: enrollment.section?.course?.code ?? "",
                courseTitle: enrollment.section?.course?.title ?? "",
                credits: enrollment.section?.course?.credits ?? 0,
                finalGrade: enrollment.finalGrade ?? ""
              }))}
            />
            <PrintButton label="Print Report" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form className="flex flex-wrap items-center gap-2" action="/admin/reports" method="GET">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">学期选择</label>
            <select name="termId" defaultValue={selectedTermId} className="campus-select min-w-[220px]">
              <option value="">全部学期</option>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>{term.name}</option>
              ))}
            </select>
            <button className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              应用
            </button>
          </form>
          {selectedTermId ? (
            <Link href="/admin/reports" className="text-sm font-medium text-slate-500 hover:text-slate-700">
              清除筛选
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Students</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{summary.totalStudents}</p>
        </div>
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Courses</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{summary.totalCourses}</p>
        </div>
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sections</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{summary.totalSections}</p>
        </div>
        <div className="campus-kpi border-blue-200 bg-blue-50/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Avg Credits / Student</p>
          <p className="mt-1 text-2xl font-bold text-blue-900">{summary.avgCreditsPerStudent || 0}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {statusEntries.map(([status, label]) => (
          <div key={status} className="campus-kpi reports-kpi">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{enrollmentByStatus[status] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="campus-card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">热门课程 Top 10</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Course', 'Code', 'Enrolled', 'Capacity', 'Fill Rate'].map((heading) => (
                  <th key={heading} scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.topSections.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No section demand data available.</td>
                </tr>
              ) : (
                summary.topSections.map((section) => (
                  <tr key={section.sectionId} className="border-t border-slate-50">
                    <td className="px-4 py-2 text-slate-700">{section.title}</td>
                    <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-700">{section.courseCode}</td>
                    <td className="px-4 py-2 text-slate-700">{section.enrolled}</td>
                    <td className="px-4 py-2 text-slate-700">{section.capacity}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                          <div
                            style={{ width: `${section.fillRate}%` }}
                            className={`h-full rounded-full ${
                              section.fillRate > 90 ? 'bg-red-500' : section.fillRate > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                          />
                        </div>
                        <span className="text-xs font-semibold text-slate-600">{section.fillRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="campus-card p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">数据质量</p>
          {dataQualityRows.every((row) => row.ok) ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              ✅ 数据质量良好
            </div>
          ) : null}
          {dataQualityRows.map((item) => (
            <div
              key={item.label}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                item.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
              }`}
            >
              <span className={`text-sm ${item.ok ? 'text-emerald-700' : 'text-amber-700'}`}>{item.label}</span>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold ${item.ok ? 'text-emerald-600' : 'text-amber-700'}`}>
                  {item.ok ? '✓ 0' : item.count}
                </span>
                <Link href={item.href} className="text-xs font-medium text-slate-500 hover:text-slate-700">
                  前往修复
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="campus-card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">Department Breakdown</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Dept', 'Enrolled', 'Waitlisted', 'Dropped', 'Total'].map((heading) => (
                  <th key={heading} scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.deptBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No department stats available.</td>
                </tr>
              ) : (
                [...summary.deptBreakdown].sort((a, b) => b.enrolled - a.enrolled).map((row) => (
                  <tr key={row.dept} className="border-t border-slate-50">
                    <td className="px-4 py-2 font-mono font-semibold text-slate-700">{row.dept}</td>
                    <td className="px-4 py-2 text-slate-700">{row.enrolled}</td>
                    <td className="px-4 py-2 text-amber-700">{row.waitlisted}</td>
                    <td className="px-4 py-2 text-red-700">{row.dropped}</td>
                    <td className="px-4 py-2 font-semibold text-slate-800">{row.enrolled + row.waitlisted + row.dropped}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="campus-card p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">GPA Distribution</p>
          {summary.gpaDistribution.length === 0 ? (
            <p className="text-sm text-slate-400">No GPA distribution available.</p>
          ) : (
            summary.gpaDistribution.map((row) => {
              const width = Math.round((row.count / maxGpaTierCount) * 100);
              const barClass =
                row.tier === '4.0'
                  ? 'bg-emerald-500'
                  : row.tier === '3.7-3.9'
                    ? 'bg-blue-500'
                    : row.tier === '3.3-3.6'
                      ? 'bg-sky-500'
                      : row.tier === '3.0-3.2'
                        ? 'bg-indigo-500'
                        : row.tier === '2.0-2.9'
                          ? 'bg-amber-500'
                          : row.tier === '<2.0'
                            ? 'bg-red-500'
                            : 'bg-slate-400';
              return (
                <div key={row.tier} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{row.tier}</span>
                    <span className="text-slate-500">{row.count}</span>
                  </div>
                  <div className="h-4 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${barClass}`} style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
