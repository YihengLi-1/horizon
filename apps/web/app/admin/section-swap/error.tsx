"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="campus-page">
      <section className="campus-hero">
        <h1 className="campus-title">出现错误</h1>
      </section>
      <div className="campus-card border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-semibold text-red-700">{error.message || "页面加载失败"}</p>
        <button type="button" onClick={reset} className="campus-btn-ghost mt-4 text-sm">重试</button>
      </div>
    </div>
  );
}
