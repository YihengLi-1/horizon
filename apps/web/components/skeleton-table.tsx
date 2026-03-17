export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  const widths = Array.from({ length: cols }, (_, index) => (index === 0 ? "20%" : `${80 / Math.max(1, cols - 1)}%`));

  return (
    <div className="campus-card overflow-hidden">
      <div className="campus-table">
        <div className="grid border-b border-slate-200 bg-[hsl(221_30%_97%)] px-3 py-3" style={{ gridTemplateColumns: widths.join(" ") }}>
          {widths.map((width, index) => (
            <div key={`head-${index}`} className="px-2">
              <div className="skeleton skeleton-text" style={{ width: index === 0 ? "70%" : "55%" }} />
            </div>
          ))}
        </div>
        <div>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div
              key={`row-${rowIndex}`}
              className="skeleton-row grid items-center px-3"
              style={{ gridTemplateColumns: widths.join(" ") }}
            >
              {widths.map((_, colIndex) => (
                <div key={`cell-${rowIndex}-${colIndex}`} className="px-2">
                  <div
                    className="skeleton skeleton-text"
                    style={{ width: colIndex === 0 ? "78%" : colIndex === cols - 1 ? "48%" : "62%" }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
