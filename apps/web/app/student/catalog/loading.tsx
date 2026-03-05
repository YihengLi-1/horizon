export default function Loading() {
  return (
    <div className="campus-page animate-pulse space-y-6">
      <div className="campus-hero"><div className="h-7 w-44 rounded bg-slate-200" /><div className="mt-2 h-4 w-64 rounded bg-slate-200" /></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="campus-card p-4 space-y-3">
            <div className="h-4 w-3/4 rounded bg-slate-200" /><div className="h-3 w-1/2 rounded bg-slate-200" />
            <div className="h-3 w-full rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
