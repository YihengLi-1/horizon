"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type DropoutRiskRow = {
  userId: string;
  name: string;
  email: string;
  programMajor: string;
  dropCount: number;
  gpa: number;
  enrolledCredits: number;
  riskScore: number;
};

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function riskTone(score: number) {
  if (score >= 80) return { label: "高", color: "#dc2626", bg: "#fee2e2" };
  if (score >= 50) return { label: "中", color: "#d97706", bg: "#fef3c7" };
  return { label: "低", color: "#2563eb", bg: "#dbeafe" };
}

export default function DropoutRiskPage() {
  const [rows, setRows] = useState<DropoutRiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    void apiFetch<DropoutRiskRow[]>("/admin/dropout-risk")
      .then((data) => setRows(data ?? []))
      .catch((err) => {
        setRows([]);
        setError(err instanceof Error ? err.message : "加载退课风险失败");
      })
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    const highRiskCount = rows.length;
    const avgRiskScore = rows.length > 0 ? rows.reduce((sum, row) => sum + row.riskScore, 0) / rows.length : 0;
    const avgGpa = rows.length > 0 ? rows.reduce((sum, row) => sum + row.gpa, 0) / rows.length : 0;
    return {
      highRiskCount,
      avgRiskScore: Math.round(avgRiskScore * 10) / 10,
      avgGpa: Math.round(avgGpa * 100) / 100
    };
  }, [rows]);

  function exportCsv() {
    const lines = [
      ["name", "email", "programMajor", "dropCount", "gpa", "enrolledCredits", "riskScore"].join(","),
      ...rows.map((row) =>
        [row.name, row.email, row.programMajor, row.dropCount, row.gpa.toFixed(2), row.enrolledCredits, row.riskScore]
          .map(csvCell)
          .join(",")
      )
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dropout-risk.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="campus-page" style={{ display: "grid", gap: "1.5rem" }}>
      <section className="campus-hero">
        <p className="campus-eyebrow">Retention Watch</p>
        <h1 style={{ margin: 0 }}>退课风险</h1>
        <p style={{ marginTop: "0.5rem", color: "#64748b" }}>根据退课历史、GPA 和当前选课学分识别高退课风险学生</p>
      </section>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <div className="campus-kpi">
          <p className="campus-kpi-label">高风险人数</p>
          <p className="campus-kpi-value">{summary.highRiskCount}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">平均风险分</p>
          <p className="campus-kpi-value">{summary.avgRiskScore.toFixed(1)}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">平均 GPA</p>
          <p className="campus-kpi-value">{summary.avgGpa.toFixed(2)}</p>
        </div>
      </div>

      <div className="campus-toolbar" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#64748b", fontSize: "0.9rem" }}>仅展示风险分大于等于 30 的学生</span>
        <button type="button" className="campus-chip" onClick={exportCsv} disabled={rows.length === 0}>
          CSV 导出
        </button>
      </div>

      {error ? <div className="campus-card" style={{ color: "#b91c1c" }}>{error}</div> : null}

      {loading ? (
        <div className="campus-card" style={{ textAlign: "center", color: "#64748b" }}>加载中...</div>
      ) : rows.length === 0 ? (
        <div className="campus-card" style={{ textAlign: "center", color: "#64748b" }}>暂无高退课风险学生</div>
      ) : (
        <div className="campus-card" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "860px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "0.9rem" }}>学生</th>
                <th style={{ padding: "0.9rem" }}>专业</th>
                <th style={{ padding: "0.9rem" }}>W/退课次数</th>
                <th style={{ padding: "0.9rem" }}>GPA</th>
                <th style={{ padding: "0.9rem" }}>当前学分</th>
                <th style={{ padding: "0.9rem" }}>风险评分</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const tone = riskTone(row.riskScore);
                return (
                  <tr key={row.userId} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "0.9rem" }}>
                      <div style={{ display: "grid", gap: "0.15rem" }}>
                        <strong>{row.name}</strong>
                        <span style={{ fontSize: "0.85rem", color: "#64748b" }}>{row.email}</span>
                      </div>
                    </td>
                    <td style={{ padding: "0.9rem" }}>{row.programMajor}</td>
                    <td style={{ padding: "0.9rem" }}>{row.dropCount}</td>
                    <td style={{ padding: "0.9rem" }}>{row.gpa.toFixed(2)}</td>
                    <td style={{ padding: "0.9rem" }}>{row.enrolledCredits}</td>
                    <td style={{ padding: "0.9rem" }}>
                      <div style={{ display: "grid", gap: "0.35rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span className="campus-chip" style={{ background: tone.bg, color: tone.color }}>{tone.label}风险</span>
                          <strong style={{ color: tone.color }}>{row.riskScore}</strong>
                        </div>
                        <div style={{ height: "10px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden" }}>
                          <div style={{ width: `${row.riskScore}%`, height: "100%", background: tone.color }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
