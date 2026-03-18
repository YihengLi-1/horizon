"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="campus-page">
      <div className="campus-card p-8 text-center">
        <p className="text-sm font-semibold text-red-700">群组消息暂时不可用</p>
        <p className="mt-1 text-xs text-slate-500">{error.message}</p>
        <button onClick={reset} className="mt-4 campus-btn-ghost text-xs">重试</button>
      </div>
    </div>
  );
}
