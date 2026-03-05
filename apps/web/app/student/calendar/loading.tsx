export default function Loading() {
  return (
    <div className="campus-page animate-pulse space-y-6">
      <div className="campus-hero">
        <div className="h-7 w-40 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-72 rounded bg-slate-200" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="campus-card p-5 space-y-4">
            <div className="h-5 w-40 rounded bg-slate-200" />
            <div className="h-4 w-56 rounded bg-slate-200" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((__, row) => (
                <div key={row} className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="h-4 w-32 rounded bg-slate-200" />
                    <div className="h-3 w-48 rounded bg-slate-200" />
                  </div>
                  <div className="h-6 w-16 rounded-full bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
