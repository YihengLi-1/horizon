export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen px-4 py-8 md:px-10">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200/80 bg-white/70 shadow-[0_28px_80px_-45px_rgba(15,23,42,0.8)] backdrop-blur lg:grid-cols-[1.15fr_0.85fr]">
        <section className="relative hidden overflow-hidden bg-[#102a4d] p-8 text-white lg:block">
          <div className="absolute left-0 right-0 top-0 h-1.5 bg-amber-400" />
          <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/90">地平线学籍管理系统</p>
              <h1 className="mt-3 max-w-md font-heading text-4xl font-bold leading-tight text-white">
                Student Information & Registration Portal
              </h1>
              <p className="mt-4 max-w-md text-sm text-slate-200">
                A focused academic workspace inspired by modern university service portals:
                clear tasks, registration readiness, and registrar-friendly workflows.
              </p>
            </div>
            <div className="space-y-2 text-xs text-slate-200/90">
              <p>系统功能</p>
              <ul className="space-y-1.5 text-sm">
                <li>课程目录，含先修课与容量提示</li>
                <li>提交前购物车预检，提供可操作的错误引导</li>
                <li>管理员候补晋升与 CSV 导入管控</li>
              </ul>
            </div>
          </div>
        </section>
        <section className="flex items-center justify-center bg-white/90 p-5 md:p-8">
          <div className="w-full max-w-md">{children}</div>
        </section>
      </div>
    </main>
  );
}
