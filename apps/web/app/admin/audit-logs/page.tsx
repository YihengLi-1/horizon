import { serverApi } from "@/lib/server-api";

type AuditLog = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor?: {
    email?: string;
    studentId?: string | null;
  } | null;
};

export default async function AuditLogsPage() {
  const logs = await serverApi<AuditLog[]>("/admin/audit-logs?limit=200");

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Operational Visibility</p>
            <h1 className="font-heading text-4xl font-bold text-white md:text-5xl">Audit Logs</h1>
            <p className="text-sm text-blue-100/90 md:text-base">
              Track user actions and administrative operations across authentication, enrollment, grading, and waitlist workflows.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-blue-200/30 bg-white/10 text-blue-50">{logs.length} recent events</span>
              <span className="campus-chip border-blue-200/30 bg-white/10 text-blue-50">
                Updated {new Date().toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="campus-card overflow-hidden">
        <div className="max-h-[620px] overflow-auto rounded-3xl">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">Time</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Actor</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Action</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Entity</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Entity ID</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No audit logs found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/60">
                    <td className="px-4 py-3 text-slate-700">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-700">{log.actor?.email || log.actor?.studentId || "system"}</td>
                    <td className="px-4 py-3 text-slate-800">
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{log.entityType}</td>
                    <td className="px-4 py-3 text-slate-700">{log.entityId || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
