"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[SIS]", error.digest, error.message);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <p className="text-6xl font-black text-slate-200 dark:text-slate-800">500</p>
        <h1 className="mt-3 text-lg font-bold text-slate-800 dark:text-slate-100">出现错误</h1>
        <p className="mt-1 text-sm text-slate-500">发生了意外错误，请稍后再试。</p>
        {error.digest ? (
          <p className="mt-1 font-mono text-xs text-slate-400">ID: {error.digest}</p>
        ) : null}
        <div className="mt-5 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
          >
            重试
          </button>
          <Link
            href="/admin/dashboard"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            返回仪表盘
          </Link>
        </div>
      </div>
    </div>
  );
}
