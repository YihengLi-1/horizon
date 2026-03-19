import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { serverApi } from "@/lib/server-api";

type AdviseeAssignment = {
  id: string;
  assignedAt: string;
  student: {
    id: string;
    email: string;
    studentId?: string | null;
    studentProfile?: {
      legalName?: string;
      programMajor?: string | null;
      academicStatus?: string | null;
      enrollmentStatus?: string | null;
    } | null;
  };
};

const STATUS_STYLE: Record<string, string> = {
  GOOD_STANDING: "text-emerald-700 bg-emerald-50 border-emerald-200",
  ACADEMIC_PROBATION: "text-amber-700 bg-amber-50 border-amber-200",
  ACADEMIC_SUSPENSION: "text-red-800 bg-red-100 border-red-300",
  Active: "text-emerald-700 bg-emerald-50 border-emerald-200",
  Inactive: "text-slate-600 bg-slate-50 border-slate-200",
  Suspended: "text-red-800 bg-red-100 border-red-300",
  Probation: "text-amber-700 bg-amber-50 border-amber-200",
};
const STATUS_LABEL: Record<string, string> = {
  GOOD_STANDING: "学业良好",
  ACADEMIC_PROBATION: "学业观察",
  ACADEMIC_SUSPENSION: "学业暂停",
  Active: "在读",
  Inactive: "未活跃",
  Suspended: "已停学",
  Probation: "察看期",
};

export default async function AdvisorDashboardPage() {
  await requireRole("ADVISOR");
  let assignments: AdviseeAssignment[] = [];
  let error = "";
  try {
    assignments = await serverApi<AdviseeAssignment[]>("/advising/advisees");
  } catch (err) {
    error = err instanceof Error ? err.message : "顾问工作台加载失败";
  }

  const atRisk = assignments.filter(
    (a) => ["ACADEMIC_PROBATION", "ACADEMIC_SUSPENSION", "Probation", "Suspended"].includes(a.student.studentProfile?.academicStatus ?? "")
  );

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">顾问工作台</p>
        <h1 className="campus-title">我的学生</h1>
        <p className="campus-subtitle">查看您负责辅导的学生，记录学业指导意见</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">辅导学生总数</p>
          <p className="campus-kpi-value">{assignments.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">需关注学生</p>
          <p className={`campus-kpi-value ${atRisk.length > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {atRisk.length}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">待审批请求</p>
          <p className="campus-kpi-value">
            <Link href="/advisor/requests" className="hover:underline text-blue-600">查看</Link>
          </p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      ) : null}

      {!error && assignments.length === 0 ? (
        <div className="campus-card p-10 text-center text-slate-400">
          <p className="text-sm">您目前尚未被分配任何学生</p>
        </div>
      ) : null}

      {!error && assignments.length > 0 ? (
        <>
          {atRisk.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              ⚠ 有 <strong>{atRisk.length}</strong> 名学生处于学业风险状态，建议优先约谈。
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {assignments.map((assignment) => {
              const profile = assignment.student.studentProfile;
              const academicStatus = profile?.academicStatus ?? "";
              return (
                <article key={assignment.id} className="campus-card p-5 space-y-3 hover:border-blue-300 transition">
                  <div>
                    <p className="text-base font-semibold text-slate-900">
                      {profile?.legalName ?? assignment.student.email}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{assignment.student.email}</p>
                  </div>
                  <div className="space-y-1 text-sm text-slate-600">
                    <p className="text-xs">{profile?.programMajor ?? "专业未申报"}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    {academicStatus ? (
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[academicStatus] ?? "border-slate-200 bg-slate-50 text-slate-500"}`}>
                        {STATUS_LABEL[academicStatus] ?? academicStatus}
                      </span>
                    ) : (
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-400">—</span>
                    )}
                    <Link
                      href={`/advisor/students/${assignment.student.id}`}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      查看详情 →
                    </Link>
                  </div>
                </article>
              );
            })}
          </section>
        </>
      ) : null}
    </div>
  );
}
