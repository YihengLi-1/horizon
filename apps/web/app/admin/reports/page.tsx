import { serverApi } from "@/lib/server-api";
import AllTranscriptsExport from "./AllTranscriptsExport";
import DeptStats from "./DeptStats";
import PrintButton from "@/app/student/schedule/PrintButton";

export const dynamic = "force-dynamic";

type EnrollmentRow = {
  id: string;
  status: "ENROLLED" | "WAITLISTED" | "PENDING_APPROVAL" | "DROPPED" | "COMPLETED";
  finalGrade?: string | null;
  student?: {
    email?: string;
    studentProfile?: {
      legalName?: string;
    };
  };
  term?: {
    name?: string;
  };
  section?: {
    sectionCode?: string;
    course?: {
      code?: string;
      title?: string;
      credits?: number;
    };
  };
};

type SectionRow = {
  id: string;
  capacity: number;
  course?: {
    code?: string;
    title?: string;
  };
  enrollments?: Array<{
    status: string;
  }>;
};

type StudentRow = {
  id: string;
  gpa?: number | null;
};

type RegistrationStats = {
  total: number;
  byStatus: Record<string, number>;
};

type DeptBreakdownRow = {
  dept: string;
  enrolled: number;
  waitlisted: number;
  dropped: number;
};

type TopSectionRow = {
  sectionId: string;
  courseCode: string;
  title: string;
  enrolled: number;
  capacity: number;
  fillRate: number;
};

type GpaDistributionRow = {
  tier: string;
  count: number;
};

type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

async function fetchAllEnrollments(): Promise<EnrollmentRow[]> {
  const rows: EnrollmentRow[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const result = await serverApi<PaginatedResponse<EnrollmentRow>>(
      `/admin/enrollments?page=${page}&pageSize=200`
    ).catch(() => null);
    if (!result) break;
    rows.push(...result.data);
    totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
    page += 1;
  }

  return rows;
}

async function fetchStudents(): Promise<StudentRow[]> {
  const result = await serverApi<{ items?: StudentRow[] } | StudentRow[]>("/admin/students?page=1&pageSize=500").catch(() => []);
  if (Array.isArray(result)) return result;
  return result.items ?? [];
}

export default async function ReportsPage() {
  const [enrollments, sections, students, registrationStats, deptBreakdown, topSections, gpaDistribution] = await Promise.all([
    fetchAllEnrollments(),
    serverApi<SectionRow[]>("/admin/sections").catch(() => []),
    fetchStudents(),
    serverApi<RegistrationStats>("/admin/stats/registration").catch(() => ({ total: 0, byStatus: {} })),
    serverApi<DeptBreakdownRow[]>("/admin/stats/dept-breakdown").catch(() => []),
    serverApi<TopSectionRow[]>("/admin/stats/top-sections").catch(() => []),
    serverApi<GpaDistributionRow[]>("/admin/stats/gpa-distribution").catch(() => [])
  ]);

  const statusCounts = { ENROLLED: 0, WAITLISTED: 0, PENDING_APPROVAL: 0, DROPPED: 0, COMPLETED: 0 };
  for (const enrollment of enrollments ?? []) {
    if (enrollment.status in statusCounts) {
      statusCounts[enrollment.status as keyof typeof statusCounts] += 1;
    }
  }

  const enrolled = enrollments?.filter((enrollment) => enrollment.status === "ENROLLED") ?? [];
  const totalCredits = enrolled.reduce(
    (sum, enrollment) => sum + (enrollment.section?.course?.credits ?? 0),
    0
  );
  const avgCredits = students?.length ? (totalCredits / students.length).toFixed(1) : "—";

  const utilization = (sections ?? [])
    .map((section) => {
      const enrolledCount = section.enrollments?.filter((item) => item.status === "ENROLLED").length ?? 0;
      const capacity = section.capacity ?? 0;
      return {
        code: section.course?.code ?? "—",
        title: section.course?.title ?? "",
        enrolled: enrolledCount,
        capacity,
        pct: capacity > 0 ? Math.round((enrolledCount / capacity) * 100) : 0,
      };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10);

  const STATUS_LABEL: Record<string, string> = {
    ENROLLED: "Enrolled",
    WAITLISTED: "Waitlisted",
    PENDING_APPROVAL: "Pending",
    DROPPED: "Dropped",
    COMPLETED: "Completed",
  };
  const STATUS_COLOR: Record<string, string> = {
    ENROLLED: "text-emerald-700",
    WAITLISTED: "text-amber-700",
    PENDING_APPROVAL: "text-blue-700",
    DROPPED: "text-red-700",
    COMPLETED: "text-slate-700",
  };
  const noGpaStudents = (students ?? []).filter((student) => student.gpa == null).length;
  const noInstructorSections = (sections ?? []).filter((section: any) => !section.instructor).length;
  const noGradeCompleted = (enrollments ?? []).filter(
    (enrollment) => enrollment.status === "COMPLETED" && !enrollment.finalGrade
  ).length;
  const maxGpaTierCount = Math.max(...gpaDistribution.map((item) => item.count), 1);
  const sortedDeptBreakdown = [...deptBreakdown].sort((a, b) => b.enrolled - a.enrolled);

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="reports-title text-2xl font-bold text-slate-900">Reports</h1>
            <p className="mt-1 text-sm text-slate-500">Enrollment statistics and section utilization</p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <AllTranscriptsExport
              enrollments={enrollments.map((enrollment) => ({
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
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="campus-chip border-slate-200 bg-white text-slate-600">
            {students?.length ?? 0} Students
          </span>
          <span className="campus-chip border-slate-200 bg-white text-slate-600">
            {sections?.length ?? 0} Sections
          </span>
          <span className="campus-chip border-slate-200 bg-white text-slate-600">
            {registrationStats.total || enrollments?.length || 0} Enrollments
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {(Object.entries(statusCounts) as [string, number][]).map(([status, count]) => (
          <div key={status} className="campus-kpi reports-kpi">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {STATUS_LABEL[status] ?? status}
            </p>
            <p className={`mt-1 text-2xl font-bold ${STATUS_COLOR[status] ?? "text-slate-900"}`}>{count}</p>
          </div>
        ))}
      </div>

      <div className="campus-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Avg Enrolled Credits / Student
        </p>
        <p className="mt-1 text-3xl font-bold text-slate-900">{avgCredits}</p>
      </div>

      <div className="campus-card overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-700">Top 10 Section Fill Rate</p>
        </div>
        <table className="w-full text-sm" aria-label="Section utilization report">
          <thead className="bg-slate-50">
            <tr>
              {["Course", "Title", "Enrolled", "Capacity", "Fill Rate"].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {utilization.map((section) => (
              <tr key={`${section.code}-${section.title}`} className="border-t border-slate-50 hover:bg-slate-50/60">
                <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-800">{section.code}</td>
                <td className="max-w-[180px] truncate px-4 py-2 text-slate-600">{section.title}</td>
                <td className="px-4 py-2 text-right text-slate-700">{section.enrolled}</td>
                <td className="px-4 py-2 text-right text-slate-700">{section.capacity}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          section.pct >= 90 ? "bg-red-400" : section.pct >= 70 ? "bg-amber-400" : "bg-emerald-400"
                        }`}
                        style={{ width: `${Math.min(section.pct, 100)}%` }}
                      />
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        section.pct >= 90 ? "text-red-600" : section.pct >= 70 ? "text-amber-600" : "text-emerald-600"
                      }`}
                    >
                      {section.pct}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
            {utilization.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                  No report data available yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <DeptStats sections={sections} />

      <div className="campus-card overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-700">Department Breakdown</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {["Dept", "Enrolled", "Waitlisted", "Dropped", "Total"].map((heading) => (
                <th key={heading} scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedDeptBreakdown.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No department stats available.</td>
              </tr>
            ) : (
              sortedDeptBreakdown.map((row) => (
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

      <div className="campus-card overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-700">热门课程 Top 10</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {["Course", "Code", "Enrolled", "Capacity", "Fill Rate"].map((heading) => (
                <th key={heading} scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topSections.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No section demand data available.</td>
              </tr>
            ) : (
              topSections.map((section) => (
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
                            section.fillRate > 90 ? "bg-red-500" : section.fillRate > 70 ? "bg-amber-500" : "bg-emerald-500"
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
        <p className="text-sm font-semibold text-slate-700">GPA Distribution</p>
        {gpaDistribution.length === 0 ? (
          <p className="text-sm text-slate-400">No GPA distribution available.</p>
        ) : (
          gpaDistribution.map((row) => {
            const width = Math.round((row.count / maxGpaTierCount) * 100);
            const barClass =
              row.tier === "4.0"
                ? "bg-emerald-500"
                : row.tier === "3.7-3.9"
                  ? "bg-blue-500"
                  : row.tier === "3.3-3.6"
                    ? "bg-sky-500"
                    : row.tier === "3.0-3.2"
                      ? "bg-indigo-500"
                      : row.tier === "2.0-2.9"
                        ? "bg-amber-500"
                        : row.tier === "<2.0"
                          ? "bg-red-500"
                          : "bg-slate-400";
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

      <div className="campus-card p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Data Quality Report</p>
        {[
          { label: "Students without GPA", count: noGpaStudents, ok: noGpaStudents === 0 },
          { label: "Sections without instructor", count: noInstructorSections, ok: noInstructorSections === 0 },
          { label: "Completed enrollments without grade", count: noGradeCompleted, ok: noGradeCompleted === 0 }
        ].map((item) => (
          <div
            key={item.label}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
              item.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
            }`}
          >
            <span className={`text-sm ${item.ok ? "text-emerald-700" : "text-amber-700"}`}>{item.label}</span>
            <span className={`text-sm font-bold ${item.ok ? "text-emerald-600" : "text-amber-700"}`}>
              {item.ok ? "✓ All good" : `${item.count} issue${item.count !== 1 ? "s" : ""}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
