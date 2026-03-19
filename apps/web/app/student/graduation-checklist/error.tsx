"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">错误</p>
        <h1 className="campus-title">页面加载失败</h1>
      </section>
      <div className="campus-card px-6 py-8 text-center space-y-4">
        <p className="text-sm text-red-600">{error.message}</p>
        <button type="button" onClick={reset} className="campus-btn-ghost">重试</button>
      </div>
    </div>
  );
}
