export default function AdminDashboardLoading() {
  return (
    <div className="campus-page animate-pulse">
      <section className="campus-hero">
        <div className="space-y-3">
          <div className="h-3 w-32 rounded bg-white/30" />
          <div className="h-10 w-64 rounded bg-white/30" />
          <div className="h-4 w-96 rounded bg-white/20" />
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="campus-kpi border-slate-200">
            <div className="h-3 w-28 rounded bg-slate-200" />
            <div className="mt-2 h-8 w-16 rounded bg-slate-200" />
          </div>
        ))}
      </section>
      <div className="grid gap-5 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="campus-card p-5 space-y-3">
            <div className="h-4 w-32 rounded bg-slate-200" />
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="h-10 rounded-lg bg-slate-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
