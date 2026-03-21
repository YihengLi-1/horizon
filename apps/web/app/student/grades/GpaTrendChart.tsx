"use client";

interface DataPoint {
  term: string;
  gpa: number;
}

export default function GpaTrendChart({ data }: { data: DataPoint[] }) {
  if (data.length < 2) return null;

  const width = 300;
  const height = 80;
  const pad = 24;
  const min = Math.min(...data.map((item) => item.gpa), 0);
  const max = Math.max(...data.map((item) => item.gpa), 4);
  const range = max - min || 1;

  const xs = data.map((_, index) => pad + (index / (data.length - 1)) * (width - pad * 2));
  const ys = data.map((item) => height - pad - ((item.gpa - min) / range) * (height - pad * 2));
  const path = xs.map((x, index) => `${index === 0 ? "M" : "L"}${x},${ys[index]}`).join(" ");
  const area = `${path} L${xs[xs.length - 1]},${height - pad} L${xs[0]},${height - pad} Z`;

  return (
    <div className="campus-card p-4">
      <p className="mb-2 text-xs font-semibold text-slate-500">GPA 走势</p>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        <defs>
          <linearGradient id="gpa-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#gpa-grad)" />
        <path d={path} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((item, index) => {
          // Handle Chinese terms like "2025年春季学期" → "25春"
          const label = (() => {
            const yearMatch = item.term.match(/(\d{2,4})年/);
            const seasonMap: Record<string, string> = { 春: "春", 夏: "夏", 秋: "秋", 冬: "冬" };
            const seasonChar = Object.keys(seasonMap).find((k) => item.term.includes(k));
            if (yearMatch && seasonChar) return yearMatch[1].slice(-2) + seasonChar;
            return item.term.slice(0, 4);
          })();
          return (
            <g key={`${item.term}-${index}`}>
              <circle cx={xs[index]} cy={ys[index]} r={4} fill="#10b981" />
              <text x={xs[index]} y={height - 4} textAnchor="middle" fontSize="9" fill="#94a3b8">
                {label}
              </text>
              <text x={xs[index]} y={ys[index] - 8} textAnchor="middle" fontSize="9" fontWeight="600" fill="#064e3b">
                {item.gpa.toFixed(2)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
