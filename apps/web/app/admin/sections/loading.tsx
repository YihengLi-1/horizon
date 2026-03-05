export default function Loading() {
  return (
    <div className="campus-page animate-pulse">
      <div className="campus-hero">
        <div className="h-8 w-48 rounded-lg bg-slate-200" />
        <div className="mt-2 h-4 w-72 rounded bg-slate-100" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="campus-kpi border-slate-200">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="mt-2 h-7 w-12 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="campus-card h-64" />
    </div>
  );
}
