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
  "A+": "text-green-800", A: "text-green-800", "A-": "text-green-700",
  "B+": "text-blue-700", B: "text-blue-700", "B-": "text-blue-600",
  "C+": "text-amber-800", C: "text-amber-800", "C-": "text-amber-700",
  "D+": "text-orange-700", D: "text-orange-700", "D-": "text-orange-600",
  F: "text-red-700",
};

export default function DegreeAuditPage() {
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const projected = useMemo(() => {
    const extra = Math.max(0, whatIfCredits);
    const extraGpa = parseFloat(whatIfGpa);
    const projTotal = audit.totalCredits + extra;
    const projRemaining = Math.max(0, 120 - projTotal);
    let projGpa = audit.gpa;
    if (extra > 0 && !isNaN(extraGpa) && extraGpa >= 0 && extraGpa <= 4) {
      const currentWeight = audit.gpa * audit.totalCredits;
      const extraWeight = extraGpa * extra;
      projGpa = projTotal > 0 ? (currentWeight + extraWeight) / projTotal : audit.gpa;
    }
    return { projTotal, projRemaining, projGpa };
  }, [audit, whatIfCredits, whatIfGpa]);

  const coreRows = audit.rows.filter((r) => r.isCore);
  const electiveRows = audit.rows.filter((r) => !r.isCore);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">毕业进度</p>
        <h1 className="campus-title">毕业审计</h1>
        <p className="campus-subtitle">
          {profile?.legalName ?? "学生"} · {profile?.programMajor ?? "未申报专业"} 的当前毕业完成度
        </p>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="campus-card p-10 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : !profile ? (
        <div className="campus-card p-10 text-center text-sm text-slate-400">无法加载毕业审计数据</div>
      ) : (
        <>
          {/* Progress buckets */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {audit.buckets.map((bucket) => {
              const pct = Math.max(0, Math.min(100, (bucket.current / bucket.required) * 100));
              return (
                <div key={bucket.label} className="campus-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900">{bucket.label}</p>
                    <span className={`campus-chip text-xs ${bucket.complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                      {bucket.complete ? "达标" : "未达标"}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${bucket.complete ? "bg-emerald-500" : "bg-amber-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-sm text-slate-600">
                    {bucket.label === "GPA"
                      ? `${audit.gpa.toFixed(2)} / ${bucket.required.toFixed(1)} ${bucket.unit}`
                      : `${bucket.current} / ${bucket.required} ${bucket.unit}`}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Gap summary */}
          <div className="campus-card p-4">
            <p className="mb-2 text-sm font-bold text-slate-900">毕业差距</p>
            <div className="flex flex-wrap gap-6 text-sm text-slate-700">
              <span>还差 <strong className="text-slate-900">{audit.remainingCredits}</strong> 学分</span>
              <span>已修 <strong className="text-slate-900">{audit.totalCredits}</strong> 学分（核心 {audit.coreCredits} + 选修 {audit.electiveCredits}）</span>
              <span>当前 GPA <strong className="text-slate-900">{audit.gpa.toFixed(2)}</strong></span>
            </div>
          </div>

          {/* Completed courses table */}
          {audit.rows.length > 0 && (
            <div className="campus-card overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-3">
                <p className="text-sm font-bold text-slate-900">已修课程明细</p>
                <p className="mt-0.5 text-xs text-slate-500">共 {audit.rows.length} 门 · {audit.totalCredits} 学分</p>
              </div>

              {[
                { title: `核心课程（${coreRows.length} 门 · ${audit.coreCredits} 学分）`, rows: coreRows },
                { title: `选修课程（${electiveRows.length} 门 · ${audit.electiveCredits} 学分）`, rows: electiveRows },
              ].map(({ title, rows }) =>
                rows.length === 0 ? null : (
                  <details key={title} open className="border-t border-slate-100">
                    <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                      <span className="text-[10px] text-slate-300">▶</span>
                      {title}
                    </summary>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50">
                            <th className="px-5 py-2 text-left text-xs font-semibold text-slate-500">课程</th>
                            <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500">学分</th>
                            <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500">成绩</th>
                            <th className="px-5 py-2 text-right text-xs font-semibold text-slate-500">学期</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr key={r.enrollmentId} className="border-b border-slate-50 hover:bg-slate-50/50">
                              <td className="px-5 py-2.5">
                                <span className="font-mono font-bold text-indigo-600">{r.code}</span>
                                <span className="ml-2 text-slate-500">
                                  {r.title.length > 36 ? r.title.slice(0, 36) + "…" : r.title}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center text-slate-600">{r.credits}</td>
                              <td className="px-3 py-2.5 text-center">
                                <span className={`font-mono font-bold ${GRADE_COLOR[r.grade] ?? "text-slate-800"}`}>
                                  {r.grade}
                                </span>
                              </td>
                              <td className="px-5 py-2.5 text-right text-slate-400">{r.term}</td>
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
          <details className="campus-card overflow-hidden">
            <summary className="flex cursor-pointer select-none list-none items-center gap-2 px-5 py-4 font-bold text-slate-800 hover:bg-slate-50">
              <span className="text-[10px] text-slate-300">▶</span>
              模拟未来学期
              <span className="ml-auto text-sm font-normal text-slate-400">假设多修若干学分后的预测毕业进度</span>
            </summary>
            <div className="space-y-4 border-t border-slate-100 p-5">
              <div className="flex flex-wrap items-end gap-6">
                <label className="grid gap-1 text-sm text-slate-600">
                  假设再修学分
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={whatIfCredits}
                    onChange={(e) => setWhatIfCredits(Math.max(0, parseInt(e.target.value) || 0))}
                    className="campus-input w-28"
                  />
                </label>
                <label className="grid gap-1 text-sm text-slate-600">
                  假设这些课 GPA（留空沿用当前）
                  <input
                    type="number"
                    min={0}
                    max={4}
                    step={0.1}
                    placeholder={audit.gpa.toFixed(2)}
                    value={whatIfGpa}
                    onChange={(e) => setWhatIfGpa(e.target.value)}
                    className="campus-input w-28"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
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
                    className={`rounded-xl border p-3 ${ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
                  >
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className={`mt-1 text-xl font-bold ${ok ? "text-emerald-800" : "text-amber-800"}`}>{value}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
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
