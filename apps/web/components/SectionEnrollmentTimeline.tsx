"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";

type Point = { day: number; date: string; enrolled: number; waitlisted: number };
type Timeline = { sectionId: string; points: Point[] };

const W = 560;
const H = 140;
const PAD = { top: 10, right: 16, bottom: 30, left: 36 };

function polyline(pts: Array<{ x: number; y: number }>) {
  return pts.map((p) => `${p.x},${p.y}`).join(" ");
}

export default function SectionEnrollmentTimeline({ sectionId }: { sectionId: string }) {
  const [data, setData] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<Timeline>(`/admin/sections/${sectionId}/enrollment-timeline`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [sectionId]);

  if (loading) return <p className="text-xs text-slate-400 py-2">加载选课历史…</p>;
  if (error) return <p className="text-xs text-red-500 py-2">{error}</p>;
  if (!data || data.points.length === 0) return <p className="text-xs text-slate-400 py-2">暂无选课记录</p>;

  const pts = data.points;
  const maxY = Math.max(...pts.map((p) => p.enrolled + p.waitlisted), 1);
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  function toX(day: number) {
    return PAD.left + (day / Math.max(pts.length - 1, 1)) * chartW;
  }
  function toY(val: number) {
    return PAD.top + chartH - (val / maxY) * chartH;
  }

  const enrolledPts = pts.map((p) => ({ x: toX(p.day), y: toY(p.enrolled) }));
  const waitlistedPts = pts.map((p) => ({ x: toX(p.day), y: toY(p.waitlisted) }));

  // Labels: show first, middle, last dates
  const labelIdxs = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].filter((v, i, a) => a.indexOf(v) === i);

  const peak = Math.max(...pts.map((p) => p.enrolled));
  const peakDay = pts.find((p) => p.enrolled === peak);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>选课趋势（天）</span>
        <span className="font-medium text-indigo-600">峰值: {peak} 人 {peakDay ? `(${peakDay.date})` : ""}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = PAD.top + f * chartH;
          const val = Math.round((1 - f) * maxY);
          return (
            <g key={f}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#e2e8f0" strokeWidth={0.5} />
              <text x={PAD.left - 4} y={y + 3} textAnchor="end" fontSize={8} fill="#94a3b8">{val}</text>
            </g>
          );
        })}

        {/* Enrolled area fill */}
        <polyline
          points={[
            `${toX(0)},${PAD.top + chartH}`,
            ...enrolledPts.map((p) => `${p.x},${p.y}`),
            `${toX(pts.length - 1)},${PAD.top + chartH}`
          ].join(" ")}
          fill="rgba(99,102,241,0.12)"
          stroke="none"
        />

        {/* Enrolled line */}
        <polyline
          points={polyline(enrolledPts)}
          fill="none"
          stroke="#6366f1"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Waitlisted line */}
        {pts.some((p) => p.waitlisted > 0) && (
          <polyline
            points={polyline(waitlistedPts)}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            strokeLinejoin="round"
          />
        )}

        {/* X-axis labels */}
        {labelIdxs.map((i) => (
          <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize={8} fill="#94a3b8">
            {pts[i].date.slice(5)}
          </text>
        ))}
      </svg>

      <div className="flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded-sm bg-indigo-500" /> 已选课
        </span>
        {pts.some((p) => p.waitlisted > 0) && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-amber-400" /> 候补
          </span>
        )}
      </div>
    </div>
  );
}
