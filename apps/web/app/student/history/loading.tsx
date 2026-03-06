export default function Loading() {
  return (
    <div className="campus-page animate-pulse space-y-6">
      <div className="campus-hero">
        <div className="h-7 w-48 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-64 rounded bg-slate-200" />
      </div>
      {[1, 2].map((item) => (
        <div key={item} className="space-y-3">
          <div className="mx-auto h-4 w-32 rounded bg-slate-200" />
          {[1, 2, 3].map((row) => (
            <div key={row} className="campus-card h-14 rounded-xl bg-slate-100 p-3" />
          ))}
        </div>
      ))}
    </div>
  );
}
