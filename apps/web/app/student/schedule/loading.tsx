export default function ScheduleLoading() {
  return (
    <div className="campus-page animate-pulse">
      <section className="campus-hero">
        <div className="space-y-3">
          <div className="h-3 w-28 rounded-full bg-slate-200" />
          <div className="h-10 w-52 rounded-xl bg-slate-200" />
          <div className="h-4 w-72 rounded-lg bg-slate-200" />
        </div>
      </section>

      {/* KPI row skeleton */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="campus-card p-4 space-y-2">
            <div className="h-3 w-16 rounded-full bg-slate-200" />
            <div className="h-8 w-10 rounded-lg bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Week grid skeleton */}
      <div className="campus-card overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-6 border-b border-slate-200">
          <div className="h-10 bg-slate-100" />
          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
            <div key={d} className="h-10 border-l border-slate-200 bg-slate-50" />
          ))}
        </div>
        {/* Hour rows */}
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="grid grid-cols-6 border-b border-slate-100">
            <div className="h-14 bg-slate-50/50" />
            {[1, 2, 3, 4, 5].map((d) => (
              <div key={d} className="h-14 border-l border-slate-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
