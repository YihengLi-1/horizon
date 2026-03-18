"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="campus-page flex flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="text-lg font-semibold text-slate-700">出错了</p>
      <p className="text-sm text-slate-500">发生了意外错误，请稍后再试。</p>
      <button onClick={reset} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
        重试
      </button>
    </div>
  );
}
