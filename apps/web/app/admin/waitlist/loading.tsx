export default function WaitlistLoading() {
  return (
    <div className="campus-page animate-pulse">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="h-3 w-24 rounded-full bg-slate-200" />
            <div className="h-10 w-36 rounded-xl bg-slate-200" />
            <div className="h-4 w-80 rounded-lg bg-slate-200" />
            <div className="flex gap-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-6 w-20 rounded-full bg-slate-200" />)}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-36 rounded-xl bg-slate-200" />
            <div className="h-10 w-28 rounded-xl bg-slate-200" />
            <div className="h-10 w-24 rounded-xl bg-slate-200" />
          </div>
        </div>
      </section>

      {[1, 2, 3].map((i) => (
        <div key={i} className="campus-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-4 w-48 rounded-lg bg-slate-200" />
            <div className="h-8 w-28 rounded-xl bg-slate-200" />
          </div>
          {[1, 2].map((j) => (
            <div key={j} className="flex items-center gap-4 py-2 border-t border-slate-100">
              <div className="h-4 w-8 rounded-full bg-slate-200" />
              <div className="h-4 w-32 rounded-full bg-slate-200 flex-1" />
              <div className="h-4 w-20 rounded-full bg-slate-200" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
