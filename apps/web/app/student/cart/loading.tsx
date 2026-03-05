export default function Loading() {
  return (
    <div className="campus-page animate-pulse space-y-6">
      <div className="campus-hero"><div className="h-7 w-32 rounded bg-slate-200" /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => <div key={i} className="campus-kpi"><div className="h-3 w-20 rounded bg-slate-200" /><div className="mt-2 h-7 w-12 rounded bg-slate-200" /></div>)}
      </div>
    </div>
  );
}
