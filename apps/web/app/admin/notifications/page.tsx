import Link from "next/link";
import { serverApi } from "@/lib/server-api";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type NotificationLogRow = {
  id: number;
  type: string;
  subject: string;
  sentAt: string;
  user: {
    email: string;
    studentProfile?: {
      legalName?: string;
    } | null;
  };
};

type NotificationLogResponse = {
  data: NotificationLogRow[];
  total: number;
  page: number;
  pageSize: number;
};

export default async function AdminNotificationsPage({
  searchParams
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  await requireRole("ADMIN");

  const params = (await searchParams) ?? {};
  const page = Math.max(1, Number(params.page) || 1);
  const result = await serverApi<NotificationLogResponse>(`/admin/notification-log?page=${page}`).catch(() => ({
    data: [],
    total: 0,
    page,
    pageSize: 50
  }));
  const totalPages = Math.max(1, Math.ceil(result.total / Math.max(1, result.pageSize)));

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="campus-eyebrow">Delivery Trace</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">Notification Log</h1>
            <p className="mt-2 text-sm text-slate-600">Newest outbound and in-app notification events.</p>
          </div>
          <div className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{result.total} total records</div>
        </div>
      </section>

      <section className="campus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Sent At</th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">User</th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Type</th>
                <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Subject</th>
              </tr>
            </thead>
            <tbody>
              {result.data.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-400">No notification log records yet.</td>
                </tr>
              ) : (
                result.data.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-500">{new Date(row.sentAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{row.user.studentProfile?.legalName ?? row.user.email}</p>
                      <p className="text-xs text-slate-400">{row.user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`campus-chip text-xs ${
                          row.type === "email"
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      >
                        {row.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.subject || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          Page {result.page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Link
            href={`/admin/notifications?page=${Math.max(1, result.page - 1)}`}
            className={`rounded-lg border px-3 py-1.5 ${result.page <= 1 ? "pointer-events-none border-slate-100 text-slate-300" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            Previous
          </Link>
          <Link
            href={`/admin/notifications?page=${Math.min(totalPages, result.page + 1)}`}
            className={`rounded-lg border px-3 py-1.5 ${result.page >= totalPages ? "pointer-events-none border-slate-100 text-slate-300" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            Next
          </Link>
        </div>
      </div>
    </div>
  );
}
