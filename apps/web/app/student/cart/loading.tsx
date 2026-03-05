export default function Loading() {
  return (
    <div className="campus-page animate-pulse space-y-6">
      <div className="campus-hero">
        <div className="h-6 w-36 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-64 rounded bg-slate-200" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="campus-kpi">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="mt-2 h-7 w-12 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="campus-card space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="h-4 w-1/3 rounded bg-slate-200" />
            <div className="h-4 w-1/4 rounded bg-slate-200" />
            <div className="ml-auto h-4 w-16 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
