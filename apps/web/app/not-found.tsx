import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center">
        <p className="text-6xl font-bold text-slate-300">404</p>
        <h1 className="mt-4 font-heading text-2xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/student/dashboard"
            className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white no-underline transition hover:bg-slate-700"
          >
            Student Dashboard
          </Link>
          <Link
            href="/admin/dashboard"
            className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
          >
            Admin Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
