export default function EnrollmentsLoading() {
  return (
    <div className="campus-page animate-pulse">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="h-3 w-24 rounded-full bg-slate-200" />
            <div className="h-10 w-52 rounded-xl bg-slate-200" />
            <div className="h-4 w-80 rounded-lg bg-slate-200" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-28 rounded-xl bg-slate-200" />
            <div className="h-10 w-24 rounded-xl bg-slate-200" />
          </div>
        </div>
      </section>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="campus-card p-4 space-y-2">
            <div className="h-3 w-20 rounded-full bg-slate-200" />
            <div className="h-8 w-12 rounded-lg bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="campus-card overflow-hidden">
        <div className="h-10 bg-slate-50 border-b border-slate-200" />
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-slate-100">
            <div className="h-4 w-4 rounded bg-slate-200" />
            <div className="h-4 w-24 rounded-full bg-slate-200" />
            <div className="h-4 w-40 rounded-full bg-slate-200 flex-1" />
            <div className="h-6 w-20 rounded-full bg-slate-200" />
            <div className="h-8 w-16 rounded-xl bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
