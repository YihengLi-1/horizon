"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type StandingData = {
  standing: string;
  gpa: number;
  totalCredits: number;
  enrolledCredits: number;
  termHistory: { termId: string; termName: string; credits: number; gpa: number | null }[];
  graduationTarget: number;
};

const GRADE_POINTS: Record<string, number> = {
  "A+": 4.0, "A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7,
  "C+": 2.3, "C": 2.0, "C-": 1.7, "D+": 1.3, "D": 1.0, "D-": 0.7, "F": 0.0,
};

const MILESTONES = [
  { label: "学业正常", gpa: 2.0 },
  { label: "院长名单", gpa: 3.5 },
  { label: "荣誉院长", gpa: 3.8 },
  { label: "满绩", gpa: 4.0 },
];

export default function GpaGoalPage() {
  const [data, setData] = useState<StandingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [targetGpa, setTargetGpa] = useState(3.5);
  const [futureCredits, setFutureCredits] = useState(15);
  const [futureGrade, setFutureGrade] = useState("A");

  useEffect(() => {
    void apiFetch<StandingData>("/students/standing")
      .then((d) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const currentGpa = data?.gpa ?? 0;
  const completedCredits = data?.totalCredits ?? 0;

  // How many more credits at a given GPA are needed to reach targetGpa?
  // (currentGpa * completedCredits + X * futureGpaPerCredit) / (completedCredits + X) = targetGpa
  // X * (futureGpaPerCredit - targetGpa) = targetGpa * completedCredits - currentGpa * completedCredits
  // X = completedCredits * (targetGpa - currentGpa) / (futureGpaPerCredit - targetGpa)
  const { creditsNeeded, creditsNeededAt4, projectedGpa, isAchievable } = useMemo(() => {
    if (completedCredits === 0) {
      return { creditsNeeded: null, creditsNeededAt4: null, projectedGpa: null, isAchievable: true };
    }

    const futureGpaPerCredit = GRADE_POINTS[futureGrade] ?? 4.0;

    // Projected GPA after future credits
    const projectedGpa = (currentGpa * completedCredits + futureGpaPerCredit * futureCredits) / (completedCredits + futureCredits);

    // Credits needed at futureGrade to hit targetGpa
    const denominator = futureGpaPerCredit - targetGpa;
    let creditsNeeded: number | null = null;
    const isAchievable = denominator > 0 || currentGpa >= targetGpa;

    if (currentGpa >= targetGpa) {
      creditsNeeded = 0;
    } else if (denominator > 0) {
      creditsNeeded = Math.ceil((completedCredits * (targetGpa - currentGpa)) / denominator);
    }

    // Credits needed if grading all A (4.0)
    let creditsNeededAt4: number | null = null;
    if (currentGpa >= targetGpa) {
      creditsNeededAt4 = 0;
    } else if ((4.0 - targetGpa) > 0) {
      creditsNeededAt4 = Math.ceil((completedCredits * (targetGpa - currentGpa)) / (4.0 - targetGpa));
    }

    return { creditsNeeded, creditsNeededAt4, projectedGpa, isAchievable };
  }, [currentGpa, completedCredits, targetGpa, futureCredits, futureGrade]);

  // Projection data for chart
  const chartData = useMemo(() => {
    if (!data?.termHistory?.length) return [];
    const pts: { label: string; gpa: number }[] = [];
    let wp = 0, cr = 0;
    for (const t of data.termHistory) {
      if (t.gpa == null) continue;
      cr += t.credits;
      wp += t.gpa * t.credits;
      pts.push({ label: t.termName, gpa: wp / cr });
    }
    // Add projection point
    if (pts.length > 0) {
      const futPts = GRADE_POINTS[futureGrade] ?? 4.0;
      const projCr = cr + futureCredits;
      const projWp = wp + futPts * futureCredits;
      pts.push({ label: "预测", gpa: projCr > 0 ? projWp / projCr : 0 });
    }
    return pts;
  }, [data, futureCredits, futureGrade]);

  const svgW = 300, svgH = 80;
  const minGpa = 2.0;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业工具</p>
        <h1 className="campus-hero-title">GPA 目标追踪</h1>
        <p className="campus-hero-subtitle">设置 GPA 目标，计算所需课程数量与成绩要求</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">当前 GPA</p>
          <p className={`campus-kpi-value ${currentGpa >= 3.5 ? "text-emerald-600" : currentGpa >= 2.0 ? "text-slate-800" : "text-red-600"}`}>
            {loading ? "—" : currentGpa.toFixed(3)}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已完成学分</p>
          <p className="campus-kpi-value">{loading ? "—" : completedCredits}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">预测 GPA</p>
          <p className={`campus-kpi-value ${(projectedGpa ?? 0) >= 3.5 ? "text-emerald-600" : (projectedGpa ?? 0) >= 2.0 ? "text-slate-800" : "text-red-600"}`}>
            {loading ? "—" : projectedGpa != null ? projectedGpa.toFixed(3) : "—"}
          </p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : (
        <>
          {/* Goal setter */}
          <section className="campus-card p-5 space-y-4">
            <p className="font-semibold text-slate-800">设置目标</p>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">目标 GPA</label>
                <input
                  type="number"
                  className="campus-input w-full"
                  value={targetGpa}
                  min={0}
                  max={4.0}
                  step={0.1}
                  onChange={(e) => setTargetGpa(Math.min(4.0, Math.max(0, Number(e.target.value))))}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">预计修读学分</label>
                <input
                  type="number"
                  className="campus-input w-full"
                  value={futureCredits}
                  min={1}
                  max={200}
                  onChange={(e) => setFutureCredits(Math.max(1, Number(e.target.value)))}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">预期平均等级</label>
                <select className="campus-select w-full" value={futureGrade} onChange={(e) => setFutureGrade(e.target.value)}>
                  {Object.keys(GRADE_POINTS).map((g) => <option key={g} value={g}>{g} ({GRADE_POINTS[g].toFixed(1)})</option>)}
                </select>
              </div>
            </div>

            {/* Quick milestone buttons */}
            <div className="flex flex-wrap gap-2">
              {MILESTONES.map((m) => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => setTargetGpa(m.gpa)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${targetGpa === m.gpa ? "bg-[hsl(221_83%_43%)] text-white border-[hsl(221_83%_43%)]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  {m.label} ({m.gpa.toFixed(1)})
                </button>
              ))}
            </div>
          </section>

          {/* Result card */}
          <section className={`campus-card p-5 border-l-4 ${!isAchievable ? "border-red-400 bg-red-50/20" : currentGpa >= targetGpa ? "border-emerald-400 bg-emerald-50/20" : "border-[hsl(221_83%_43%)] bg-blue-50/20"}`}>
            <p className="font-semibold text-slate-800 mb-3">分析结果</p>
            {currentGpa >= targetGpa ? (
              <p className="text-emerald-700 font-semibold">✅ 你的当前 GPA ({currentGpa.toFixed(3)}) 已满足目标 ({targetGpa.toFixed(1)})！</p>
            ) : !isAchievable ? (
              <p className="text-red-700 font-semibold">
                ❌ 即使在未来所有 {futureCredits} 学分中取得 {futureGrade}，GPA 也无法达到 {targetGpa.toFixed(1)}。
                需要更高的平均成绩或更多学分。
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-slate-700">
                  以 <strong>{futureGrade}</strong> 等级（{GRADE_POINTS[futureGrade]?.toFixed(1)} 绩点）修读 <strong>{futureCredits}</strong> 学分后，
                  GPA 预计为 <strong className="text-[hsl(221_83%_43%)]">{projectedGpa?.toFixed(3)}</strong>
                  {(projectedGpa ?? 0) >= targetGpa
                    ? <span className="text-emerald-600 ml-1">✓ 可达目标</span>
                    : <span className="text-amber-600 ml-1">（尚未达到 {targetGpa.toFixed(1)}）</span>
                  }
                </p>
                {creditsNeeded != null && creditsNeeded > 0 ? (
                  <p className="text-slate-700">
                    以 <strong>{futureGrade}</strong> 成绩达标需至少修读 <strong className="text-[hsl(221_83%_43%)]">{creditsNeeded}</strong> 学分
                  </p>
                ) : null}
                {creditsNeededAt4 != null && creditsNeededAt4 > 0 && futureGrade !== "A+" && futureGrade !== "A" ? (
                  <p className="text-slate-500 text-sm">
                    若全取 A/A+，则最少需要 <strong>{creditsNeededAt4}</strong> 学分
                  </p>
                ) : null}
              </div>
            )}
          </section>

          {/* Milestones table */}
          <section className="campus-card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <p className="font-semibold text-slate-800">里程碑参考</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 text-left">目标</th>
                  <th className="px-5 py-3 text-right">目标 GPA</th>
                  <th className="px-5 py-3 text-right">差距</th>
                  <th className="px-5 py-3 text-right">全取A所需学分</th>
                  <th className="px-5 py-3 text-center">状态</th>
                </tr>
              </thead>
              <tbody>
                {MILESTONES.map((m) => {
                  const diff = m.gpa - currentGpa;
                  const crNeeded = diff > 0 && (4.0 - m.gpa) > 0
                    ? Math.ceil((completedCredits * diff) / (4.0 - m.gpa))
                    : 0;
                  const achieved = currentGpa >= m.gpa;
                  return (
                    <tr key={m.label} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-5 py-3 font-semibold text-slate-800">{m.label}</td>
                      <td className="px-5 py-3 text-right font-mono text-slate-700">{m.gpa.toFixed(1)}</td>
                      <td className={`px-5 py-3 text-right font-mono font-bold ${diff > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                        {diff > 0 ? `+${diff.toFixed(3)}` : "已达到"}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-slate-600">
                        {achieved ? "—" : crNeeded > 0 ? crNeeded : "无法达到"}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {achieved ? (
                          <span className="text-emerald-600 font-bold">✓</span>
                        ) : (
                          <span className="text-slate-300">○</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* GPA trend sparkline */}
          {chartData.length >= 2 ? (
            <section className="campus-card p-5">
              <p className="font-semibold text-slate-800 mb-4">累计 GPA 趋势（含预测）</p>
              <svg viewBox={`0 0 ${svgW} ${svgH + 20}`} className="w-full max-h-32">
                {/* target line */}
                <line
                  x1={0} y1={svgH - ((targetGpa - minGpa) / (4.0 - minGpa)) * svgH}
                  x2={svgW} y2={svgH - ((targetGpa - minGpa) / (4.0 - minGpa)) * svgH}
                  stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" opacity={0.7}
                />
                <text
                  x={svgW - 2}
                  y={svgH - ((targetGpa - minGpa) / (4.0 - minGpa)) * svgH - 3}
                  textAnchor="end"
                  style={{ fontSize: 8, fill: "#f59e0b" }}
                >
                  目标 {targetGpa.toFixed(1)}
                </text>
                {/* actual line */}
                <polyline
                  points={chartData.slice(0, -1).map((t, i) => {
                    const x = (i / (chartData.length - 1)) * (svgW - 20) + 10;
                    const y = svgH - ((Math.max(minGpa, Math.min(4.0, t.gpa)) - minGpa) / (4.0 - minGpa)) * svgH + 2;
                    return `${x},${y}`;
                  }).join(" ")}
                  fill="none" stroke="hsl(221 83% 43%)" strokeWidth="2" strokeLinejoin="round"
                />
                {/* projected dashed line */}
                {chartData.length >= 2 ? (
                  <line
                    x1={(( chartData.length - 2) / (chartData.length - 1)) * (svgW - 20) + 10}
                    y1={svgH - ((Math.max(minGpa, Math.min(4.0, chartData[chartData.length - 2].gpa)) - minGpa) / (4.0 - minGpa)) * svgH + 2}
                    x2={((chartData.length - 1) / (chartData.length - 1)) * (svgW - 20) + 10}
                    y2={svgH - ((Math.max(minGpa, Math.min(4.0, chartData[chartData.length - 1].gpa)) - minGpa) / (4.0 - minGpa)) * svgH + 2}
                    stroke="hsl(221 65% 65%)" strokeWidth="2" strokeDasharray="4 3"
                  />
                ) : null}
                {chartData.map((t, i) => {
                  const x = (i / (chartData.length - 1)) * (svgW - 20) + 10;
                  const y = svgH - ((Math.max(minGpa, Math.min(4.0, t.gpa)) - minGpa) / (4.0 - minGpa)) * svgH + 2;
                  const isLast = i === chartData.length - 1;
                  return (
                    <g key={i}>
                      <circle cx={x} cy={y} r={3} fill={isLast ? "hsl(221 65% 65%)" : "hsl(221 83% 43%)"} />
                      {i === 0 || isLast || i === chartData.length - 2 ? (
                        <text x={x} y={svgH + 14} textAnchor="middle" style={{ fontSize: 7, fill: "#94a3b8" }}>
                          {t.label.slice(0, 6)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </svg>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
