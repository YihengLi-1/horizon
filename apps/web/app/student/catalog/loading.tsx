export default function CatalogLoading() {
  return (
    <div className="campus-page animate-pulse">
      <section className="campus-hero">
        <div className="space-y-3">
          <div className="h-3 w-24 rounded-full bg-slate-200" />
          <div className="h-10 w-64 rounded-xl bg-slate-200" />
          <div className="h-4 w-96 rounded-lg bg-slate-200" />
        </div>
      </section>

      {/* Toolbar skeleton */}
      <section className="campus-toolbar">
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-xl bg-slate-200" />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 w-20 rounded-full bg-slate-200" />
          ))}
        </div>
      </section>

      {/* Cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="campus-card p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-2 flex-1">
                <div className="h-3 w-16 rounded-full bg-slate-200" />
                <div className="h-5 w-48 rounded-lg bg-slate-200" />
              </div>
              <div className="h-6 w-16 rounded-full bg-slate-200" />
            </div>
            <div className="h-3 w-full rounded-full bg-slate-200" />
            <div className="h-3 w-4/5 rounded-full bg-slate-200" />
            <div className="flex gap-2 pt-1">
              <div className="h-5 w-14 rounded-full bg-slate-200" />
              <div className="h-5 w-14 rounded-full bg-slate-200" />
              <div className="h-5 w-14 rounded-full bg-slate-200" />
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200" />
            <div className="h-9 w-full rounded-xl bg-slate-200 mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
