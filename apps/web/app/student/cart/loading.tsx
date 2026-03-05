export default function CartLoading() {
  return (
    <div className="campus-page animate-pulse">
      <section className="campus-hero">
        <div className="space-y-3">
          <div className="h-3 w-28 rounded-full bg-slate-200" />
          <div className="h-10 w-56 rounded-xl bg-slate-200" />
          <div className="h-4 w-80 rounded-lg bg-slate-200" />
        </div>
      </section>

      {/* Stepper skeleton */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-slate-200" />
            <div className="h-3 w-20 rounded-full bg-slate-200" />
            {i < 3 && <div className="h-px w-12 bg-slate-200" />}
          </div>
        ))}
      </div>

      {/* Submit readiness card */}
      <div className="campus-card p-5 space-y-3">
        <div className="h-4 w-32 rounded-lg bg-slate-200" />
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-200" />
          ))}
        </div>
      </div>

      {/* Cart items skeleton */}
      <div className="campus-card overflow-hidden">
        <div className="divide-y divide-slate-100">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between px-5 py-4">
              <div className="space-y-2">
                <div className="h-4 w-48 rounded-lg bg-slate-200" />
                <div className="h-3 w-32 rounded-full bg-slate-200" />
              </div>
              <div className="h-8 w-20 rounded-xl bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
