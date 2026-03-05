import Link from "next/link";
import { serverApi } from "@/lib/server-api";
import { GradesCsvButton } from "@/components/grades-csv-button";

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

function gpaTier(gpa: number): { label: string; cls: string } {
  if (gpa >= 3.7) return { label: "Dean's List", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (gpa >= 3.0) return { label: "Good Standing", cls: "border-blue-200 bg-blue-50 text-blue-700" };
  if (gpa >= 2.0) return { label: "Satisfactory", cls: "border-slate-200 bg-slate-50 text-slate-600" };
  return { label: "Academic Warning", cls: "border-amber-200 bg-amber-50 text-amber-700" };
}

function gradeDistribution(items: GradeItem[]): { A: number; B: number; C: number; D: number; F: number; other: number } {
  const dist = { A: 0, B: 0, C: 0, D: 0, F: 0, other: 0 };
  for (const item of items) {
    const g = item.finalGrade;
    if (g.startsWith("A")) dist.A += 1;
    else if (g.startsWith("B")) dist.B += 1;
    else if (g.startsWith("C")) dist.C += 1;
    else if (g.startsWith("D")) dist.D += 1;
    else if (g === "F") dist.F += 1;
    else dist.other += 1;
  }
  return dist;
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

type SortCol = "code" | "title" | "credits" | "grade" | "points" | "contribution";

function sortItems(items: GradeItem[], sortBy: SortCol, sortDir: "asc" | "desc"): GradeItem[] {
  const dir = sortDir === "desc" ? -1 : 1;
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case "title":
        return dir * a.section.course.title.localeCompare(b.section.course.title);
      case "credits":
        return dir * (a.section.credits - b.section.credits);
      case "grade":
      case "points": {
        const ap = gradePoints(a.finalGrade) ?? -1;
        const bp = gradePoints(b.finalGrade) ?? -1;
        return dir * (ap - bp);
      }
      case "contribution": {
        const ac = (gradePoints(a.finalGrade) ?? 0) * a.section.credits;
        const bc = (gradePoints(b.finalGrade) ?? 0) * b.section.credits;
        return dir * (ac - bc);
      }
      default:
        return dir * a.section.course.code.localeCompare(b.section.course.code);
    }
  });
}

function SortTh({
  col, label, sortBy, sortDir, right,
}: {
  col: SortCol; label: string; sortBy: SortCol; sortDir: "asc" | "desc"; right?: boolean;
}) {
  const active  = sortBy === col;
  const nextDir = active && sortDir === "asc" ? "desc" : "asc";
  return (
    <th className={`px-4 py-2 ${right ? "text-right" : ""}`}>
      <Link
        href={`?sortBy=${col}&sortDir=${nextDir}`}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide whitespace-nowrap transition-colors ${
          active ? "text-slate-900" : "text-slate-400 hover:text-slate-700"
        } ${right ? "flex-row-reverse" : ""}`}
      >
        {label}
        <span className="text-[9px] leading-none">
          {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </Link>
    </th>
  );
}

export default async function GradesPage({
  searchParams,
}: {
  searchParams: Promise<{ sortBy?: string; sortDir?: string }>;
}) {
  const params  = await searchParams;
  const sortBy  = (params.sortBy  ?? "code") as SortCol;
  const sortDir = (params.sortDir === "desc" ? "desc" : "asc") as "asc" | "desc";

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
            <GradesCsvButton
              rows={grades.map((item) => {
                const pts = gradePoints(item.finalGrade);
                return {
                  term: item.term.name,
                  courseCode: item.section.course.code,
                  courseTitle: item.section.course.title,
                  credits: item.section.credits,
                  grade: item.finalGrade,
                  points: pts !== null ? pts.toFixed(1) : "N/A"
                };
              })}
              gpa={cumulative ? cumulative.gpa.toFixed(2) : "N/A"}
            />
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
          {cumulative ? (
            <span className={`mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${gpaTier(cumulative.gpa).cls}`}>
              {gpaTier(cumulative.gpa).label}
            </span>
          ) : null}
        </div>
      </section>

      {grades.length === 0 ? (
        <section className="campus-card px-6 py-10 text-center">
          <p className="text-sm text-slate-600">No grades on record yet.</p>
        </section>
      ) : null}

      {terms.map((termName) => {
        const rawItems = byTerm.get(termName) ?? [];
        const items = sortItems(rawItems, sortBy, sortDir);
        const termGpa = calcGPA(items);
        const termCredits = items.reduce((sum, item) => sum + item.section.credits, 0);
        const dist = gradeDistribution(items);
        const total = items.length;

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

            {total > 0 ? (
              <div className="flex h-1.5 overflow-hidden">
                {(["A", "B", "C", "D", "F"] as const).map((letter) =>
                  dist[letter] > 0 ? (
                    <div
                      key={letter}
                      title={`${letter}: ${dist[letter]} course${dist[letter] !== 1 ? "s" : ""}`}
                      className={`h-full transition-all ${
                        letter === "A" ? "bg-emerald-400"
                        : letter === "B" ? "bg-blue-400"
                        : letter === "C" ? "bg-amber-400"
                        : letter === "D" ? "bg-orange-400"
                        : "bg-red-500"
                      }`}
                      style={{ width: `${(dist[letter] / total) * 100}%` }}
                    />
                  ) : null
                )}
              </div>
            ) : null}

            <div className="max-h-[380px] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50">
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <SortTh col="code"         label="Course"       sortBy={sortBy} sortDir={sortDir} />
                    <SortTh col="title"        label="Title"        sortBy={sortBy} sortDir={sortDir} />
                    <SortTh col="credits"      label="Credits"      sortBy={sortBy} sortDir={sortDir} />
                    <SortTh col="grade"        label="Grade"        sortBy={sortBy} sortDir={sortDir} />
                    <SortTh col="points"       label="Points"       sortBy={sortBy} sortDir={sortDir} />
                    <SortTh col="contribution" label="Contribution" sortBy={sortBy} sortDir={sortDir} right />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const pts = gradePoints(item.finalGrade);
                    const contribution = pts !== null ? pts * item.section.credits : null;
                    return (
                      <tr key={item.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40">
                        <td className="px-4 py-3 font-medium text-slate-900">{item.section.course.code}</td>
                        <td className="px-4 py-3 text-slate-700">{item.section.course.title}</td>
                        <td className="px-4 py-3 text-slate-700">{item.section.credits}</td>
                        <td className={`px-4 py-3 font-semibold ${gradeColor(item.finalGrade)}`}>{item.finalGrade}</td>
                        <td className="px-4 py-3 text-slate-700">{pts !== null ? pts.toFixed(1) : "-"}</td>
                        <td className="px-4 py-3 text-right text-slate-500 text-xs">
                          {contribution !== null ? contribution.toFixed(1) : "-"}
                        </td>
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
