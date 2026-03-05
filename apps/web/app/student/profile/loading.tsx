export default function ProfileLoading() {
  return (
    <div className="campus-page animate-pulse">
      <section className="campus-hero">
        <div className="space-y-3">
          <div className="h-3 w-32 rounded-full bg-slate-200" />
          <div className="h-10 w-48 rounded-xl bg-slate-200" />
          <div className="h-4 w-72 rounded-lg bg-slate-200" />
        </div>
      </section>

      {/* Personal info card skeleton */}
      <div className="campus-card p-5 space-y-4">
        <div className="h-5 w-40 rounded-lg bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-20 rounded-full bg-slate-200" />
              <div className="h-10 w-full rounded-xl bg-slate-200" />
            </div>
          ))}
        </div>
        <div className="h-10 w-32 rounded-xl bg-slate-200" />
      </div>

      {/* Change password card skeleton */}
      <div className="campus-card p-5 space-y-4">
        <div className="h-5 w-36 rounded-lg bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-24 rounded-full bg-slate-200" />
              <div className="h-10 w-full rounded-xl bg-slate-200" />
            </div>
          ))}
        </div>
        <div className="h-10 w-36 rounded-xl bg-slate-200" />
      </div>
    </div>
  );
}
