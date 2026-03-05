export default function AuditLogsLoading() {
  return (
    <div className="campus-page animate-pulse">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="h-3 w-36 rounded-full bg-slate-200" />
            <div className="h-10 w-40 rounded-xl bg-slate-200" />
            <div className="h-4 w-96 rounded-lg bg-slate-200" />
            <div className="flex gap-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-6 w-24 rounded-full bg-slate-200" />)}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-28 rounded-xl bg-slate-200" />
            <div className="h-10 w-24 rounded-xl bg-slate-200" />
          </div>
        </div>
      </section>

      <div className="campus-toolbar">
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-xl bg-slate-200" />)}
        </div>
      </div>

      <div className="campus-card overflow-hidden">
        <div className="h-10 bg-slate-50 border-b border-slate-200" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-slate-100">
            <div className="space-y-1">
              <div className="h-3 w-20 rounded-full bg-slate-200" />
              <div className="h-3 w-12 rounded-full bg-slate-200" />
            </div>
            <div className="h-4 w-40 rounded-full bg-slate-200 flex-1" />
            <div className="h-6 w-24 rounded-full bg-slate-200" />
            <div className="h-4 w-20 rounded-full bg-slate-200" />
            <div className="h-4 w-16 rounded-full bg-slate-200 font-mono" />
          </div>
        ))}
      </div>
    </div>
  );
}
