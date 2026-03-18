"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="campus-page">
      <p className="text-sm text-red-600">导师仪表盘页面加载失败。</p>
      <button onClick={reset} className="mt-2 text-sm underline">重试</button>
    </div>
  );
}
