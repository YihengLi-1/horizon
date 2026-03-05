export default function Loading() {
  return (
    <div className="campus-page animate-pulse space-y-6">
      <div className="campus-hero">
        <div className="h-6 w-48 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-72 rounded bg-slate-200" />
        <div className="mt-4 flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 w-20 rounded-full bg-slate-200" />
          ))}
        </div>
      </div>
      <div className="campus-toolbar">
        <div className="h-9 w-64 rounded-lg bg-slate-200" />
        <div className="h-9 w-32 rounded-lg bg-slate-200" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="campus-card space-y-3 p-4">
            <div className="h-4 w-3/4 rounded bg-slate-200" />
            <div className="h-3 w-1/2 rounded bg-slate-200" />
            <div className="h-3 w-full rounded bg-slate-200" />
            <div className="flex gap-2 pt-2">
              <div className="h-6 w-16 rounded-full bg-slate-200" />
              <div className="h-6 w-16 rounded-full bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
