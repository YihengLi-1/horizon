export function SkeletonKpiRow({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="campus-kpi">
          <div className="skeleton skeleton-text w-20" />
          <div className="skeleton skeleton-card mt-3 h-14" />
        </div>
      ))}
    </div>
  );
}
