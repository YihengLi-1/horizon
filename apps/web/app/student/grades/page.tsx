import Link from "next/link";
import { serverApi } from "@/lib/server-api";

type GradeItem = {
  id: string;
  finalGrade: string;
  term: { name: string };
  section: {
    credits: number;
    course: { code: string; title: string };
  };
};

const GRADE_POINTS: Record<string, number> = {
  "A+": 4.0,
  A: 4.0,
  "A-": 3.7,
  "B+": 3.3,
  B: 3.0,
  "B-": 2.7,
  "C+": 2.3,
  C: 2.0,
  "C-": 1.7,
  "D+": 1.3,
  D: 1.0,
  "D-": 0.7,
  F: 0.0
};

function gradePoints(grade: string): number | null {
  return GRADE_POINTS[grade] ?? null;
}

function gradeColor(grade: string): string {
  const pts = gradePoints(grade);
  if (pts === null) return "text-slate-700";
  if (pts >= 3.7) return "text-emerald-700";
  if (pts >= 2.7) return "text-blue-700";
  if (pts >= 1.7) return "text-amber-700";
  return "text-red-700";
}

function gpaTone(gpa: number): string {
  if (gpa >= 3.5) return "text-emerald-700";
  if (gpa >= 2.5) return "text-blue-700";
  if (gpa >= 1.5) return "text-amber-700";
  return "text-red-700";
}

function calcGPA(items: GradeItem[]): { gpa: number; totalCredits: number } | null {
  let weightedSum = 0;
  let totalCredits = 0;
  for (const item of items) {
    const pts = gradePoints(item.finalGrade);
    if (pts === null) continue;
    weightedSum += pts * item.section.credits;
    totalCredits += item.section.credits;
  }
  if (totalCredits === 0) return null;
  return { gpa: weightedSum / totalCredits, totalCredits };
}

export default async function GradesPage() {
  const grades = await serverApi<GradeItem[]>("/registration/grades");

  const byTerm = new Map<string, GradeItem[]>();
  for (const item of grades) {
    const list = byTerm.get(item.term.name) ?? [];
    list.push(item);
    byTerm.set(item.term.name, list);
  }

  const terms = Array.from(byTerm.keys());
  const cumulative = calcGPA(grades);
  const completedCredits = grades.reduce((sum, item) => sum + item.section.credits, 0);

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Academic Record</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">Grades</h1>
            <p className="text-sm text-slate-600 md:text-base">
              Final grades and GPA trends across completed terms.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{grades.length} graded classes</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{terms.length} term(s)</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{completedCredits} completed credits</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/student/schedule"
              className="inline-flex h-10 items-center rounded-lg border border-white/35 bg-white/90 px-4 text-sm font-semibold text-slate-800 no-underline transition hover:bg-white"
            >
              View schedule
            </Link>
            <Link
              href="/student/catalog"
              className="inline-flex h-10 items-center rounded-lg border border-white/35 bg-white/90 px-4 text-sm font-semibold text-slate-800 no-underline transition hover:bg-white"
            >
              Browse catalog
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed Credits</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{completedCredits}</p>
        </div>
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Graded Classes</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{grades.length}</p>
        </div>
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Terms With Grades</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{terms.length}</p>
        </div>
        <div className="campus-kpi border-blue-200 bg-blue-50/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Cumulative GPA</p>
          <p className={`mt-1 text-2xl font-semibold ${cumulative ? gpaTone(cumulative.gpa) : "text-slate-700"}`}>
            {cumulative ? cumulative.gpa.toFixed(2) : "N/A"}
          </p>
        </div>
      </section>

      {grades.length === 0 ? (
        <section className="campus-card px-6 py-10 text-center">
          <p className="text-sm text-slate-600">No grades on record yet.</p>
        </section>
      ) : null}

      {terms.map((termName) => {
        const items = byTerm.get(termName) ?? [];
        const termGpa = calcGPA(items);
        const termCredits = items.reduce((sum, item) => sum + item.section.credits, 0);

        return (
          <section key={termName} className="campus-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
              <h2 className="font-heading text-2xl font-semibold text-slate-900">{termName}</h2>
              <div className="flex flex-wrap gap-2">
                <span className="campus-chip border-slate-300 bg-white text-slate-700">{termCredits} credits</span>
                <span className={`campus-chip border-slate-300 bg-white ${termGpa ? gpaTone(termGpa.gpa) : "text-slate-600"}`}>
                  {termGpa ? `Term GPA ${termGpa.gpa.toFixed(2)}` : "Term GPA N/A"}
                </span>
              </div>
            </div>

            <div className="max-h-[380px] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="border-b border-slate-200 text-left">
                    <th className="px-4 py-2.5 font-semibold text-slate-700">Course</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-700">Title</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-700">Credits</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-700">Grade</th>
                    <th className="px-4 py-2.5 font-semibold text-slate-700">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const pts = gradePoints(item.finalGrade);
                    return (
                      <tr key={item.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40">
                        <td className="px-4 py-3 font-medium text-slate-900">{item.section.course.code}</td>
                        <td className="px-4 py-3 text-slate-700">{item.section.course.title}</td>
                        <td className="px-4 py-3 text-slate-700">{item.section.credits}</td>
                        <td className={`px-4 py-3 font-semibold ${gradeColor(item.finalGrade)}`}>{item.finalGrade}</td>
                        <td className="px-4 py-3 text-slate-700">{pts !== null ? pts.toFixed(1) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
