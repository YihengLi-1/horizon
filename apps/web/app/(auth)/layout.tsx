export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen px-4 py-8 md:px-10">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200/80 bg-white/70 shadow-[0_28px_80px_-45px_rgba(15,23,42,0.8)] backdrop-blur lg:grid-cols-[1.15fr_0.85fr]">
        <section className="relative hidden overflow-hidden bg-[#102a4d] p-8 text-white lg:block">
          <div className="absolute left-0 right-0 top-0 h-1.5 bg-amber-400" />
          <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-100/90">地平线学籍管理系统</p>
              <h1 className="mt-3 max-w-md font-heading text-4xl font-bold leading-tight text-white">
                学生信息与教务管理系统
              </h1>
              <p className="mt-4 max-w-md text-sm text-slate-200">
                支持选课注册、成绩管理、学籍审核与教师教务的一体化高校信息平台。
              </p>
            </div>
            <div className="space-y-3 text-sm text-slate-200/90">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-amber-300">✓</span>
                <span>在线选课、候补排队与注册状态实时追踪</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-amber-300">✓</span>
                <span>成绩查询、成绩单查看与学业进度跟踪</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-amber-300">✓</span>
                <span>候补、超学分审批与学籍限制的完整教务流程</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-amber-300">✓</span>
                <span>管理端数据统计、学生预警与教学班管理</span>
              </div>
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
