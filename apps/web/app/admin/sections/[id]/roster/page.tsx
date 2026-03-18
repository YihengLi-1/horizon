import Link from "next/link";
import { serverApi } from "@/lib/server-api";
import { requireRole } from "@/lib/server-auth";
import RosterExport from "./RosterExport";

export const dynamic = "force-dynamic";

type RosterEnrollment = {
  id: string;
  status: string;
  finalGrade?: string | null;
  student?: {
    email?: string;
    studentId?: string | null;
    studentProfile?: {
      legalName?: string;
    } | null;
  } | null;
};

export default async function SectionRosterPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("ADMIN");

  const { id } = await params;
  const rows = await serverApi<RosterEnrollment[]>(`/admin/sections/${id}/enrollments`).catch(() => []);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">教学班名单</h1>
            <p className="mt-1 text-sm text-slate-500">{rows.length} enrollment record(s)</p>
          </div>
          <div className="flex gap-2">
            <RosterExport rows={rows} />
            <Link
              href="/admin/sections"
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              返回 Sections
            </Link>
          </div>
        </div>
      </section>

      <section className="campus-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">姓名</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">邮箱</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">学号</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">状态</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">成绩</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">暂无名单记录。</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-800">{row.student?.studentProfile?.legalName ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{row.student?.email ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.student?.studentId ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="campus-chip text-xs">{row.status}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{row.finalGrade ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
