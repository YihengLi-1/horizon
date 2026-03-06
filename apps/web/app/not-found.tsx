import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 dark:bg-gray-900 dark:text-white dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md text-center">
        <div className="relative">
          <p className="select-none text-[120px] font-black leading-none text-slate-200 dark:text-slate-800">404</p>
          <span className="absolute inset-0 flex items-center justify-center text-5xl">🔍</span>
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-800 dark:text-slate-100">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">The page you're looking for doesn't exist or has been moved.</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/student/dashboard"
            className="w-full rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-slate-900 sm:w-auto"
          >
            Student Dashboard
          </Link>
          <Link
            href="/admin/dashboard"
            className="w-full rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:w-auto"
          >
            Admin Dashboard
          </Link>
        </div>
        <p className="mt-10 text-xs text-slate-400">地平线 SIS · v1.0</p>
      </div>
    </div>
  );
}
