import { serverApi } from "@/lib/server-api";
import DeptStats from "./DeptStats";

export const dynamic = "force-dynamic";

type EnrollmentRow = {
  id: string;
  status: "ENROLLED" | "WAITLISTED" | "PENDING_APPROVAL" | "DROPPED" | "COMPLETED";
  section?: {
    course?: {
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

export default async function ReportsPage() {
  const [enrollments, sections, students] = await Promise.all([
    fetchAllEnrollments(),
    serverApi<SectionRow[]>("/admin/sections").catch(() => []),
    serverApi<StudentRow[]>("/students").catch(() => []),
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

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-500">Enrollment statistics and section utilization</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="campus-chip border-slate-200 bg-white text-slate-600">
            {students?.length ?? 0} Students
          </span>
          <span className="campus-chip border-slate-200 bg-white text-slate-600">
            {sections?.length ?? 0} Sections
          </span>
          <span className="campus-chip border-slate-200 bg-white text-slate-600">
            {enrollments?.length ?? 0} Enrollments
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {(Object.entries(statusCounts) as [string, number][]).map(([status, count]) => (
          <div key={status} className="campus-kpi">
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
    </div>
  );
}
