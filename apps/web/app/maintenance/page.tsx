export default function MaintenancePage() {
  return (
    <div className="campus-page flex min-h-screen items-center justify-center">
      <div className="campus-card max-w-md p-8 text-center space-y-4">
        <p className="text-5xl">🔧</p>
        <h1 className="text-2xl font-bold text-slate-900">系统维护中</h1>
        <p className="text-slate-600">
          我们正在进行系统升级，预计很快恢复，感谢您的耐心等待。
        </p>
        <p className="text-xs text-slate-400">
          系统正在计划内维护中，请稍后再试。
        </p>
        <a
          href="/"
          className="inline-block rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition"
        >
          刷新重试
        </a>
      </div>
    </div>
  );
}
