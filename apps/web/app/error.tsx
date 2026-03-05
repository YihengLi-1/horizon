"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[SIS]", error.digest, error.message);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md text-center">
        <p className="text-7xl font-black text-slate-200 dark:text-slate-800">500</p>
        <h1 className="mt-4 text-xl font-bold text-slate-800 dark:text-slate-100">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-500">An unexpected error occurred.</p>
        {error.digest ? <p className="mt-1 font-mono text-xs text-slate-400">ID: {error.digest}</p> : null}
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Go Home
          </Link>
        </div>
        <p className="mt-8 text-xs text-slate-400">地平线 SIS</p>
      </div>
    </div>
  );
}
