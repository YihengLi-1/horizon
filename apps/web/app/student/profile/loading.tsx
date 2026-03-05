export default function Loading() {
  return (
    <div className="campus-page animate-pulse space-y-6">
      <div className="campus-hero">
        <div className="h-6 w-40 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-56 rounded bg-slate-200" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="campus-card space-y-4 p-6">
          <div className="mx-auto h-20 w-20 rounded-full bg-slate-200" />
          <div className="mx-auto h-4 w-32 rounded bg-slate-200" />
          <div className="mx-auto h-3 w-24 rounded bg-slate-200" />
        </div>
        <div className="campus-card space-y-4 p-6 lg:col-span-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-20 rounded bg-slate-200" />
              <div className="h-9 w-full rounded-lg bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
