export default function TermsLoading() {
  return (
    <div className="campus-page animate-pulse">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="h-3 w-36 rounded-full bg-slate-200" />
            <div className="h-10 w-28 rounded-xl bg-slate-200" />
            <div className="h-4 w-80 rounded-lg bg-slate-200" />
            <div className="flex gap-2">
              <div className="h-6 w-20 rounded-full bg-slate-200" />
              <div className="h-6 w-28 rounded-full bg-slate-200" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-28 rounded-xl bg-slate-200" />
            <div className="h-10 w-24 rounded-xl bg-slate-200" />
          </div>
        </div>
      </section>

      <div className="campus-card p-5 space-y-3">
        <div className="h-4 w-36 rounded-lg bg-slate-200" />
        <div className="grid gap-3 md:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <div key={i} className="h-10 rounded-xl bg-slate-200" />)}
        </div>
      </div>

      <div className="campus-card overflow-hidden">
        <div className="h-10 bg-slate-50 border-b border-slate-200" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-slate-100">
            <div className="h-4 w-28 rounded-full bg-slate-200" />
            <div className="h-4 w-40 rounded-full bg-slate-200 flex-1" />
            <div className="h-4 w-48 rounded-full bg-slate-200" />
            <div className="h-4 w-32 rounded-full bg-slate-200" />
            <div className="h-4 w-8 rounded-full bg-slate-200" />
            <div className="h-6 w-20 rounded-full bg-slate-200" />
            <div className="flex gap-2">
              <div className="h-8 w-16 rounded-xl bg-slate-200" />
              <div className="h-8 w-16 rounded-xl bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
