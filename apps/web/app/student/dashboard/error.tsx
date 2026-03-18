"use client";

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="campus-page">
      <div className="campus-card px-6 py-10 text-center">
        <p className="text-sm font-semibold text-red-700">仪表盘加载失败</p>
        <p className="mt-1 text-xs text-slate-500">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          重试
        </button>
      </div>
    </div>
  );
}
