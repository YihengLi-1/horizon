"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type TrendPoint = {
  date: string;
  count: number;
};

export default function EnrollmentTrendChart() {
  const [days, setDays] = useState<7 | 14>(14);
  const [data, setData] = useState<TrendPoint[]>([]);

  useEffect(() => {
    let alive = true;
    void apiFetch<TrendPoint[]>(`/admin/stats/enrollment-trend?days=${days}`)
      .then((rows) => {
        if (alive) setData(rows ?? []);
      })
      .catch(() => {
        if (alive) setData([]);
      });
    return () => {
      alive = false;
    };
  }, [days]);

  const chart = useMemo(() => {
    const width = 400;
    const height = 80;
    const pad = 20;
    const safe = data.length > 0 ? data : [{ date: new Date().toISOString().slice(0, 10), count: 0 }];
    const maxCount = Math.max(...safe.map((item) => item.count), 1);
    const points = safe.map((item, index) => ({
      x: pad + (index * (width - pad * 2)) / Math.max(1, safe.length - 1),
      y: height - pad - (item.count / maxCount) * (height - pad * 2),
      item
    }));
    const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
    return { width, height, pad, points, path };
  }, [data]);

  return (
    <div className="campus-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-slate-400">注册人数趋势</p>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
          {[7, 14].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDays(value as 7 | 14)}
              className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
                days === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {value}天
            </button>
          ))}
        </div>
      </div>

      <svg width={chart.width} height={chart.height} viewBox={`0 0 ${chart.width} ${chart.height}`} className="w-full overflow-visible">
        <defs>
          <linearGradient id="trend-grad-client" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`${chart.path} L${chart.points[chart.points.length - 1]?.x ?? chart.pad},${chart.height - chart.pad} L${chart.points[0]?.x ?? chart.pad},${chart.height - chart.pad} Z`}
          fill="url(#trend-grad-client)"
          opacity="0.4"
        />
        <path d={chart.path} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {chart.points.map((point) => (
          <g key={point.item.date}>
            <circle cx={point.x} cy={point.y} r={3} fill="#6366f1" />
            <text x={point.x} y={chart.height - 4} textAnchor="middle" fontSize="8" fill="#94a3b8">
              {point.item.date.slice(5)}
            </text>
            {point.item.count > 0 ? (
              <text x={point.x} y={point.y - 6} textAnchor="middle" fontSize="8" fill="#4f46e5" fontWeight="600">
                {point.item.count}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}
