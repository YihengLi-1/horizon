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

function majorPrefixes(programMajor: string | null | undefined) {
  const major = (programMajor ?? "").toLowerCase();
  if (major.includes("computer")) return ["CS"];
  if (major.includes("math")) return ["MATH"];
  if (major.includes("business")) return ["BUS"];
  if (major.includes("english")) return ["ENG"];
  if (major.includes("biology")) return ["BIO"];
  if (major.includes("chem")) return ["CHEM"];
  if (major.includes("phys")) return ["PHYS"];
  const token = (programMajor ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
  return token ? [token.slice(0, Math.min(4, token.length))] : [];
}

export default function DegreeAuditPage() {
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    void Promise.all([
      apiFetch<MeResponse>("/students/me"),
      apiFetch<Course[]>("/academics/courses")
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
    const courseMap = new Map(courses.map((course) => [course.id, course]));
    const completed = (profile?.enrollments ?? []).filter(
      (enrollment) => enrollment.status === "COMPLETED" && enrollment.finalGrade && enrollment.finalGrade !== "W"
    );
    const prefixes = majorPrefixes(profile?.programMajor);

    let coreCredits = 0;
    let totalCredits = 0;

    for (const enrollment of completed) {
      const course = courseMap.get(enrollment.section.course.id) ?? {
        id: enrollment.section.course.id,
        code: enrollment.section.course.code,
        title: enrollment.section.course.title,
        credits: enrollment.section.credits
      };
      totalCredits += enrollment.section.credits;
      const isCore = prefixes.some((prefix) => course.code.toUpperCase().startsWith(prefix));
      if (isCore) {
        coreCredits += enrollment.section.credits;
      }
    }

    const electiveCredits = Math.max(0, totalCredits - coreCredits);
    const gpa = profile?.gpa ?? 0;
    const gpaProgress = gpa >= 2 ? 2 : Math.max(0, gpa);
    const buckets: Bucket[] = [
      { label: "核心课程", current: coreCredits, required: 30, unit: "学分", complete: coreCredits >= 30 },
      { label: "选修", current: electiveCredits, required: 15, unit: "学分", complete: electiveCredits >= 15 },
      { label: "总学分", current: totalCredits, required: 120, unit: "学分", complete: totalCredits >= 120 },
      { label: "GPA", current: gpaProgress, required: 2, unit: "GPA", complete: gpa >= 2.0 }
    ];

    return {
      buckets,
      totalCredits,
      remainingCredits: Math.max(0, 120 - totalCredits),
      gpa
    };
  }, [courses, profile]);

  return (
    <div className="campus-page" style={{ display: "grid", gap: "1.5rem" }}>
      <section className="campus-hero">
        <p className="campus-eyebrow">Degree Progress</p>
        <h1 style={{ margin: 0 }}>毕业审计</h1>
        <p style={{ marginTop: "0.5rem", color: "#64748b" }}>
          {(profile?.legalName ?? "学生")} · {(profile?.programMajor ?? "Undeclared")} 的当前毕业完成度
        </p>
      </section>

      {error ? <div className="campus-card" style={{ color: "#b91c1c" }}>{error}</div> : null}

      {loading ? (
        <div className="campus-card" style={{ textAlign: "center", color: "#64748b" }}>加载中...</div>
      ) : !profile ? (
        <div className="campus-card" style={{ textAlign: "center", color: "#64748b" }}>无法加载毕业审计数据</div>
      ) : (
        <>
          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            {audit.buckets.map((bucket) => {
              const pct = Math.max(0, Math.min(100, (bucket.current / bucket.required) * 100));
              return (
                <div key={bucket.label} className="campus-card" style={{ display: "grid", gap: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{bucket.label}</p>
                    <span className="campus-chip" style={{ color: bucket.complete ? "#166534" : "#b45309", background: bucket.complete ? "#dcfce7" : "#fef3c7" }}>
                      {bucket.complete ? "达标" : "未达标"}
                    </span>
                  </div>
                  <div style={{ height: "10px", background: "#e2e8f0", borderRadius: "999px", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: bucket.complete ? "#16a34a" : "#f59e0b" }} />
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

          <div className="campus-card" style={{ display: "grid", gap: "0.75rem" }}>
            <p style={{ margin: 0, fontWeight: 700 }}>毕业线差距</p>
            <p style={{ margin: 0, color: "#334155" }}>还差 {audit.remainingCredits} 学分达到毕业线</p>
            <div style={{ color: "#64748b", fontSize: "0.95rem" }}>当前累计学分 {audit.totalCredits}，当前 GPA {audit.gpa.toFixed(2)}</div>
          </div>
        </>
      )}
    </div>
  );
}
