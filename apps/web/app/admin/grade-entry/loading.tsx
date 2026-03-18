export default function Loading() {
  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-7 w-48 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="campus-card p-6">
        <div className="h-10 w-64 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}
