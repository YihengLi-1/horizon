import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md text-center">
        <p className="text-7xl font-bold text-slate-200">404</p>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/student/dashboard"
            className="inline-flex h-10 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90"
          >
            Student Dashboard
          </Link>
          <Link
            href="/admin/dashboard"
            className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Admin Dashboard
          </Link>
        </div>
        <p className="mt-6 text-xs text-slate-400">地平线 SIS</p>
      </div>
    </div>
  );
}
