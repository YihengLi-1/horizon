"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type MeResponse = {
  legalName?: string;
  programMajor?: string | null;
  gpa?: number | null;
  enrollments?: Array<{
    id: string;
    status: string;
    finalGrade: string | null;
    section: {
      credits: number;
      sectionCode: string;
      course: {
        id: string;
        code: string;
        title: string;
      };
      term: {
        id: string;
        name: string;
      };
    };
  }>;
};

type Course = {
  id: string;
  code: string;
  title: string;
  credits: number;
};

type Bucket = {
  label: string;
  current: number;
  required: number;
  unit: string;
  complete: boolean;
};

type CompletedRow = {
  enrollmentId: string;
  code: string;
  title: string;
  credits: number;
  grade: string;
  term: string;
  isCore: boolean;
};

function majorPrefixes(programMajor: string | null | undefined) {
  const major = (programMajor ?? "").toLowerCase();
  if (major.includes("计算机") || major.includes("软件") || major.includes("computer") || major.includes("software")) return ["CS"];
  if (major.includes("数学") || major.includes("math")) return ["MATH"];
  if (major.includes("工商") || major.includes("管理") || major.includes("business") || major.includes("management")) return ["BUS"];
  if (major.includes("英语") || major.includes("english")) return ["ENG"];
  if (major.includes("生物") || major.includes("biology") || major.includes("bio")) return ["BIO"];
  if (major.includes("化学") || major.includes("chem")) return ["CHEM"];
  if (major.includes("物理") || major.includes("phys")) return ["PHYS"];
  const token = (programMajor ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
  return token ? [token.slice(0, Math.min(4, token.length))] : [];
}

const GRADE_COLOR: Record<string, string> = {
  "A+": "#166534", A: "#166534", "A-": "#15803d",
  "B+": "#1d4ed8", B: "#1d4ed8", "B-": "#2563eb",
  "C+": "#92400e", C: "#92400e", "C-": "#b45309",
  "D+": "#9a3412", D: "#9a3412", "D-": "#c2410c",
  F: "#991b1b",
};

export default function DegreeAuditPage() {
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // What-if state: extra hypothetical credits
  const [whatIfCredits, setWhatIfCredits] = useState(0);
  const [whatIfGpa, setWhatIfGpa] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    void Promise.all([
      apiFetch<MeResponse>("/students/me"),
      apiFetch<Course[]>("/academics/courses"),
    ])
      .then(([me, catalog]) => {
        setProfile(me);
        setCourses(catalog ?? []);
      })
      .catch((err) => {
        setProfile(null);
        setCourses([]);
        setError(err instanceof Error ? err.message : "加载毕业审计失败");
      })
      .finally(() => setLoading(false));
  }, []);

  const audit = useMemo(() => {
    const courseMap = new Map(courses.map((c) => [c.id, c]));
    const completed = (profile?.enrollments ?? []).filter(
      (e) => e.status === "COMPLETED" && e.finalGrade && e.finalGrade !== "W"
    );
    const prefixes = majorPrefixes(profile?.programMajor);

    let coreCredits = 0;
    let totalCredits = 0;
    const rows: CompletedRow[] = [];

    for (const e of completed) {
      const course = courseMap.get(e.section.course.id) ?? {
        id: e.section.course.id,
        code: e.section.course.code,
        title: e.section.course.title,
        credits: e.section.credits,
      };
      totalCredits += e.section.credits;
      const isCore = prefixes.some((p) => course.code.toUpperCase().startsWith(p));
      if (isCore) coreCredits += e.section.credits;
      rows.push({
        enrollmentId: e.id,
        code: course.code,
        title: course.title,
        credits: e.section.credits,
        grade: e.finalGrade ?? "",
        term: e.section.term.name,
        isCore,
      });
    }

    // sort by term then code
    rows.sort((a, b) => a.term.localeCompare(b.term) || a.code.localeCompare(b.code));

    const electiveCredits = Math.max(0, totalCredits - coreCredits);
    const gpa = profile?.gpa ?? 0;
    const gpaProgress = Math.max(0, Math.min(2, gpa));

    const buckets: Bucket[] = [
      { label: "核心课程", current: coreCredits, required: 30, unit: "学分", complete: coreCredits >= 30 },
      { label: "选修", current: electiveCredits, required: 15, unit: "学分", complete: electiveCredits >= 15 },
      { label: "总学分", current: totalCredits, required: 120, unit: "学分", complete: totalCredits >= 120 },
      { label: "GPA", current: gpaProgress, required: 2, unit: "GPA", complete: gpa >= 2.0 },
    ];

    return {
      buckets,
      totalCredits,
      coreCredits,
      electiveCredits,
      remainingCredits: Math.max(0, 120 - totalCredits),
      gpa,
      rows,
    };
  }, [courses, profile]);

  // What-if projected values
  const projected = useMemo(() => {
    const extra = Math.max(0, whatIfCredits);
    const extraGpa = parseFloat(whatIfGpa);
    const projTotal = audit.totalCredits + extra;
    const projRemaining = Math.max(0, 120 - projTotal);
    let projGpa = audit.gpa;
    if (extra > 0 && !isNaN(extraGpa) && extraGpa >= 0 && extraGpa <= 4) {
      // weighted average: (currentGpa * currentCredits + extraGpa * extra) / projTotal
      const currentWeight = audit.gpa * audit.totalCredits;
      const extraWeight = extraGpa * extra;
      projGpa = projTotal > 0 ? (currentWeight + extraWeight) / projTotal : audit.gpa;
    }
    return { projTotal, projRemaining, projGpa };
  }, [audit, whatIfCredits, whatIfGpa]);

  const coreRows = audit.rows.filter((r) => r.isCore);
  const electiveRows = audit.rows.filter((r) => !r.isCore);

  return (
    <div className="campus-page" style={{ display: "grid", gap: "1.5rem" }}>
      <section className="campus-hero">
        <p className="campus-eyebrow">毕业进度</p>
        <h1 style={{ margin: 0 }}>毕业审计</h1>
        <p style={{ marginTop: "0.5rem", color: "#64748b" }}>
          {profile?.legalName ?? "学生"} · {profile?.programMajor ?? "未申报专业"} 的当前毕业完成度
        </p>
      </section>

      {error ? <div className="campus-card" style={{ color: "#b91c1c" }}>{error}</div> : null}

      {loading ? (
        <div className="campus-card" style={{ textAlign: "center", color: "#64748b" }}>加载中...</div>
      ) : !profile ? (
        <div className="campus-card" style={{ textAlign: "center", color: "#64748b" }}>无法加载毕业审计数据</div>
      ) : (
        <>
          {/* Progress buckets */}
          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            {audit.buckets.map((bucket) => {
              const pct = Math.max(0, Math.min(100, (bucket.current / bucket.required) * 100));
              return (
                <div key={bucket.label} className="campus-card" style={{ display: "grid", gap: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{bucket.label}</p>
                    <span
                      className="campus-chip"
                      style={{
                        color: bucket.complete ? "#166534" : "#b45309",
                        background: bucket.complete ? "#dcfce7" : "#fef3c7",
                      }}
                    >
                      {bucket.complete ? "达标" : "未达标"}
                    </span>
                  </div>
                  <div style={{ height: "10px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: bucket.complete ? "#16a34a" : "#f59e0b",
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                  <div style={{ color: "#475569", fontSize: "0.95rem" }}>
                    {bucket.label === "GPA"
                      ? `${audit.gpa.toFixed(2)} / ${bucket.required.toFixed(1)} ${bucket.unit}`
                      : `${bucket.current} / ${bucket.required} ${bucket.unit}`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Gap summary */}
          <div className="campus-card" style={{ display: "grid", gap: "0.5rem" }}>
            <p style={{ margin: 0, fontWeight: 700 }}>毕业差距</p>
            <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", color: "#334155", fontSize: "0.95rem" }}>
              <span>还差 <strong>{audit.remainingCredits}</strong> 学分</span>
              <span>已修 <strong>{audit.totalCredits}</strong> 学分（核心 {audit.coreCredits} + 选修 {audit.electiveCredits}）</span>
              <span>当前 GPA <strong>{audit.gpa.toFixed(2)}</strong></span>
            </div>
          </div>

          {/* Completed courses table — grouped */}
          {audit.rows.length > 0 && (
            <div className="campus-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "1rem 1.25rem 0.75rem", borderBottom: "1px solid #e2e8f0" }}>
                <p style={{ margin: 0, fontWeight: 700 }}>已修课程明细</p>
                <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                  共 {audit.rows.length} 门 · {audit.totalCredits} 学分
                </p>
              </div>

              {[
                { title: `核心课程（${coreRows.length} 门 · ${audit.coreCredits} 学分）`, rows: coreRows },
                { title: `选修课程（${electiveRows.length} 门 · ${audit.electiveCredits} 学分）`, rows: electiveRows },
              ].map(({ title, rows }) =>
                rows.length === 0 ? null : (
                  <details key={title} open style={{ borderTop: "1px solid #f1f5f9" }}>
                    <summary
                      style={{
                        padding: "0.65rem 1.25rem",
                        fontWeight: 600,
                        fontSize: "0.875rem",
                        color: "#475569",
                        cursor: "pointer",
                        listStyle: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        userSelect: "none",
                      }}
                    >
                      <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>▶</span>
                      {title}
                    </summary>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #e2e8f0", color: "#94a3b8" }}>
                            <th style={{ textAlign: "left", padding: "0.4rem 1.25rem", fontWeight: 600 }}>课程</th>
                            <th style={{ textAlign: "center", padding: "0.4rem 0.75rem", fontWeight: 600 }}>学分</th>
                            <th style={{ textAlign: "center", padding: "0.4rem 0.75rem", fontWeight: 600 }}>成绩</th>
                            <th style={{ textAlign: "right", padding: "0.4rem 1.25rem", fontWeight: 600 }}>学期</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr
                              key={r.enrollmentId}
                              style={{ borderBottom: "1px solid #f8fafc" }}
                            >
                              <td style={{ padding: "0.5rem 1.25rem" }}>
                                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#4f46e5" }}>{r.code}</span>
                                <span style={{ color: "#64748b", marginLeft: "0.5rem" }}>
                                  {r.title.length > 36 ? r.title.slice(0, 36) + "…" : r.title}
                                </span>
                              </td>
                              <td style={{ padding: "0.5rem 0.75rem", textAlign: "center", color: "#475569" }}>{r.credits}</td>
                              <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                                <span style={{ fontFamily: "monospace", fontWeight: 700, color: GRADE_COLOR[r.grade] ?? "#334155" }}>
                                  {r.grade}
                                </span>
                              </td>
                              <td style={{ padding: "0.5rem 1.25rem", textAlign: "right", color: "#94a3b8" }}>{r.term}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )
              )}
            </div>
          )}

          {/* What-if panel */}
          <details className="campus-card" style={{ padding: 0, overflow: "hidden" }}>
            <summary
              style={{
                padding: "0.9rem 1.25rem",
                fontWeight: 700,
                cursor: "pointer",
                listStyle: "none",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                userSelect: "none",
              }}
            >
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>▶</span>
              模拟未来学期
              <span style={{ marginLeft: "auto", fontSize: "0.8rem", fontWeight: 400, color: "#94a3b8" }}>
                假设多修若干学分后的预测毕业进度
              </span>
            </summary>
            <div style={{ padding: "1rem 1.25rem 1.25rem", borderTop: "1px solid #e2e8f0", display: "grid", gap: "1rem" }}>
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem", color: "#475569" }}>
                  假设再修学分
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={whatIfCredits}
                    onChange={(e) => setWhatIfCredits(Math.max(0, parseInt(e.target.value) || 0))}
                    className="campus-input"
                    style={{ width: "110px" }}
                  />
                </label>
                <label style={{ display: "grid", gap: "0.3rem", fontSize: "0.875rem", color: "#475569" }}>
                  假设这些课 GPA（留空沿用当前）
                  <input
                    type="number"
                    min={0}
                    max={4}
                    step={0.1}
                    placeholder={audit.gpa.toFixed(2)}
                    value={whatIfGpa}
                    onChange={(e) => setWhatIfGpa(e.target.value)}
                    className="campus-input"
                    style={{ width: "110px" }}
                  />
                </label>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "0.75rem",
                }}
              >
                {[
                  {
                    label: "预测总学分",
                    value: `${projected.projTotal}`,
                    sub: `距毕业还差 ${projected.projRemaining}`,
                    ok: projected.projTotal >= 120,
                  },
                  {
                    label: "预测 GPA",
                    value: projected.projGpa.toFixed(2),
                    sub: projected.projGpa >= 2 ? "满足毕业要求" : "仍低于 2.0",
                    ok: projected.projGpa >= 2,
                  },
                  {
                    label: "毕业可行性",
                    value: projected.projTotal >= 120 && projected.projGpa >= 2 ? "✓ 可毕业" : "✗ 尚未达标",
                    sub: projected.projTotal >= 120 && projected.projGpa >= 2
                      ? "学分与 GPA 均满足"
                      : [projected.projTotal < 120 && `学分差 ${120 - projected.projTotal}`, projected.projGpa < 2 && "GPA 不足 2.0"].filter(Boolean).join("，"),
                    ok: projected.projTotal >= 120 && projected.projGpa >= 2,
                  },
                ].map(({ label, value, sub, ok }) => (
                  <div
                    key={label}
                    style={{
                      background: ok ? "#f0fdf4" : "#fffbeb",
                      border: `1px solid ${ok ? "#bbf7d0" : "#fde68a"}`,
                      borderRadius: "0.5rem",
                      padding: "0.75rem 1rem",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>{label}</p>
                    <p style={{ margin: "0.25rem 0 0", fontSize: "1.25rem", fontWeight: 700, color: ok ? "#166534" : "#92400e" }}>
                      {value}
                    </p>
                    <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "#94a3b8" }}>{sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
