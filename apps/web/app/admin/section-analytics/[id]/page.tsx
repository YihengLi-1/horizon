"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type GradeRow = {
  grade: string;
  count: number;
};

type TimelinePoint = {
  day: number;
  date: string;
  enrolled: number;
  waitlisted: number;
};

type SectionAnalytics = {
  sectionId: string;
  sectionCode: string;
  courseCode: string;
  courseTitle: string;
  termName: string;
  capacity: number;
  enrolled: number;
  waitlisted: number;
  dropCount: number;
  avgGpa: number;
  gradeBreakdown: GradeRow[];
  enrollmentTimeline: TimelinePoint[];
};

export default function SectionAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const sectionId = typeof params?.id === "string" ? params.id : "";
  const [data, setData] = useState<SectionAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sectionId) return;
    setLoading(true);
    setError("");
    void apiFetch<SectionAnalytics>(`/admin/sections/${sectionId}/analytics`)
      .then((result) => setData(result))
      .catch((err) => {
        setData(null);
        setError(err instanceof Error ? err.message : "加载教学班分析失败");
      })
      .finally(() => setLoading(false));
  }, [sectionId]);

  const timelineMeta = useMemo(() => {
    const points = data?.enrollmentTimeline ?? [];
    const max = Math.max(1, ...points.map((point) => Math.max(point.enrolled, point.waitlisted)));
    return { points, max };
  }, [data]);

  const gradeMeta = useMemo(() => {
    const rows = data?.gradeBreakdown ?? [];
    const max = Math.max(1, ...rows.map((row) => row.count));
    return { rows, max };
  }, [data]);

  return (
    <div className="campus-page" style={{ display: "grid", gap: "1.5rem" }}>
      <section className="campus-hero">
        <p className="campus-eyebrow">班级分析</p>
        <h1 style={{ margin: 0 }}>
          {data ? `${data.courseCode} · §${data.sectionCode}` : "教学班分析"}
        </h1>
        <p style={{ marginTop: "0.5rem", color: "#64748b" }}>
          {data ? `${data.courseTitle} · ${data.termName}` : "查看单个教学班的选课与成绩分析"}
        </p>
      </section>

      <div className="campus-toolbar" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/admin/sections" className="campus-chip">返回教学班列表</Link>
      </div>

      {error ? <div className="campus-card" style={{ color: "#b91c1c" }}>{error}</div> : null}

      {loading ? (
        <div className="campus-card" style={{ textAlign: "center", color: "#64748b" }}>加载中...</div>
      ) : !data ? (
        <div className="campus-card" style={{ textAlign: "center", color: "#64748b" }}>暂无教学班分析数据</div>
      ) : (
        <>
          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            <div className="campus-kpi">
              <p className="campus-kpi-label">容量</p>
              <p className="campus-kpi-value">{data.capacity}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">已选</p>
              <p className="campus-kpi-value">{data.enrolled}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">候补</p>
              <p className="campus-kpi-value">{data.waitlisted}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">平均 GPA</p>
              <p className="campus-kpi-value">{data.avgGpa.toFixed(2)}</p>
            </div>
          </div>

          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "1.2fr 0.8fr" }}>
            <div className="campus-card">
              <p style={{ marginTop: 0, fontWeight: 700 }}>报名时间线</p>
              {timelineMeta.points.length === 0 ? (
                <p style={{ color: "#64748b" }}>暂无报名时间线数据</p>
              ) : (
                <svg viewBox="0 0 720 280" style={{ width: "100%", height: "280px" }}>
                  <line x1="60" y1="220" x2="680" y2="220" stroke="#cbd5e1" strokeWidth="1.5" />
                  <line x1="60" y1="30" x2="60" y2="220" stroke="#cbd5e1" strokeWidth="1.5" />
                  <polyline
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="3"
                    points={timelineMeta.points
                      .map((point, index) => {
                        const x = 60 + (index / Math.max(1, timelineMeta.points.length - 1)) * 620;
                        const y = 220 - (point.enrolled / timelineMeta.max) * 170;
                        return `${x},${y}`;
                      })
                      .join(" ")}
                  />
                  {timelineMeta.points.map((point, index) => {
                    const x = 60 + (index / Math.max(1, timelineMeta.points.length - 1)) * 620;
                    const y = 220 - (point.enrolled / timelineMeta.max) * 170;
                    return (
                      <g key={point.date}>
                        <circle cx={x} cy={y} r="4" fill="#2563eb" />
                        <text x={x} y="245" textAnchor="middle" fontSize="11" fill="#64748b">
                          {point.date.slice(5)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>

            <div className="campus-card">
              <p style={{ marginTop: 0, fontWeight: 700 }}>成绩分布</p>
              {gradeMeta.rows.length === 0 ? (
                <p style={{ color: "#64748b" }}>暂无成绩记录</p>
              ) : (
                <div style={{ display: "grid", gap: "0.75rem" }}>
                  {gradeMeta.rows.map((row) => (
                    <div key={row.grade} style={{ display: "grid", gap: "0.25rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>{row.grade}</span>
                        <strong>{row.count}</strong>
                      </div>
                      <div style={{ height: "12px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden" }}>
                        <div style={{ width: `${(row.count / gradeMeta.max) * 100}%`, height: "100%", background: "#4f46e5" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: "1rem", color: "#64748b", fontSize: "0.95rem" }}>退课/Withdraw 数：{data.dropCount}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
