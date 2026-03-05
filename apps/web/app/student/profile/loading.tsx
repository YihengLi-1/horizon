export default function Loading() {
  return (
    <div className="campus-page animate-pulse space-y-6">
      <div className="campus-hero"><div className="h-7 w-40 rounded bg-slate-200" /></div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="campus-card p-6 space-y-4"><div className="mx-auto h-20 w-20 rounded-full bg-slate-200" /><div className="h-4 w-32 mx-auto rounded bg-slate-200" /></div>
        <div className="lg:col-span-2 campus-card p-6 space-y-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="space-y-1"><div className="h-3 w-20 rounded bg-slate-200" /><div className="h-9 w-full rounded-lg bg-slate-200" /></div>)}
        </div>
      </div>
    </div>
  );
}
