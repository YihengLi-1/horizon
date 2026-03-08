"use client";

type Dist = { A: number; B: number; C: number; D: number; F: number; total: number };

const GRADES = [
  { key: "A" as const, color: "#10b981", label: "A" },
  { key: "B" as const, color: "#6366f1", label: "B" },
  { key: "C" as const, color: "#f59e0b", label: "C" },
  { key: "D" as const, color: "#f97316", label: "D" },
  { key: "F" as const, color: "#ef4444", label: "F" }
];

export default function GradeDistBar({ dist }: { dist: Dist }) {
  if (!dist || dist.total === 0) return null;

  return (
    <div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        {GRADES.map(({ key, color }) => {
          const pct = (dist[key] / dist.total) * 100;
          return pct > 0 ? (
            <div key={key} style={{ width: `${pct}%`, backgroundColor: color }} title={`${key}: ${dist[key]}`} />
          ) : null;
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
        {GRADES.filter((grade) => dist[grade.key] > 0).map(({ key, color }) => (
          <span key={key} className="text-xs font-medium" style={{ color }}>
            {key} {Math.round((dist[key] / dist.total) * 100)}%
          </span>
        ))}
        <span className="ml-auto text-xs text-slate-400">n={dist.total}</span>
      </div>
    </div>
  );
}
