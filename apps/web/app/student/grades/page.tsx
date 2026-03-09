import { getMeServer, requireRole } from "@/lib/server-auth";
import Link from "next/link";
import { serverApi } from "@/lib/server-api";
import CertificateButton from "./CertificateButton";
import GpaCalculator from "./GpaCalculator";
import GpaTrendChart from "./GpaTrendChart";
import StarRating from "./StarRating";
import TranscriptExportButton from "./TranscriptExportButton";

export type GradeItem = {
  id: string;
  sectionId: string;
  finalGrade: string;
  term: { name: string };
  section: {
    credits: number;
    course: { code: string; title: string };
    ratings?: Array<{ rating: number }>;
  };
};

type Term = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  dropDeadline: string;
};

type TranscriptTerm = {
  termId: string;
  termName: string;
  semesterGpa: number | null;
  cumulativeGpa: number | null;
  enrollments: Array<{
    id: string;
    finalGrade: string | null;
    section: {
      credits: number;
    };
  }>;
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
  if (pts === null) return "text-slate-700 dark:text-slate-300";
  if (pts >= 3.7) return "text-emerald-700 dark:text-emerald-400";
  if (pts >= 2.7) return "text-blue-700 dark:text-blue-400";
  if (pts >= 1.7) return "text-amber-700 dark:text-amber-400";
  return "text-red-700 dark:text-red-400";
}

function gpaTone(gpa: number): string {
  if (gpa >= 3.5) return "text-emerald-700 dark:text-emerald-400";
  if (gpa >= 2.5) return "text-blue-700 dark:text-blue-400";
  if (gpa >= 1.5) return "text-amber-700 dark:text-amber-400";
  return "text-red-700 dark:text-red-400";
}

function gpaTier(gpa: number): { label: string; cls: string } {
  if (gpa >= 3.7) return { label: "Dean's List", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (gpa >= 3.0) return { label: "Good Standing", cls: "border-blue-200 bg-blue-50 text-blue-700" };
  if (gpa >= 2.0) return { label: "Warning", cls: "border-amber-200 bg-amber-50 text-amber-700" };
  return { label: "Academic Probation", cls: "border-red-200 bg-red-50 text-red-700" };
}

interface Standing {
  label: string;
  description: string;
  cls: string;
  icon: string;
}

function getStanding(gpa: number | null): Standing {
  if (gpa === null) {
    return {
      label: "No GPA",
      description: "No grades recorded yet.",
      cls: "border-slate-200 bg-slate-50 text-slate-700",
      icon: "📋"
    };
  }
  if (gpa >= 3.7) {
    return {
      label: "Dean's List",
      description: `GPA ${gpa.toFixed(2)} — Outstanding academic performance.`,
      cls: "border-emerald-200 bg-emerald-50 text-emerald-800",
      icon: "🏆"
    };
  }
  if (gpa >= 3.0) {
    return {
      label: "Good Standing",
      description: `GPA ${gpa.toFixed(2)} — Satisfactory academic progress.`,
      cls: "border-blue-200 bg-blue-50 text-blue-800",
      icon: "✅"
    };
  }
  if (gpa >= 2.0) {
    return {
      label: "Warning",
      description: `GPA ${gpa.toFixed(2)} — Minimum progression met, but improvement is needed.`,
      cls: "border-amber-200 bg-amber-50 text-amber-800",
      icon: "⚠️"
    };
  }
  return {
    label: "Academic Probation",
    description: `GPA ${gpa.toFixed(2)} — Below minimum GPA requirement (2.0). Please contact registrar support for next steps.`,
    cls: "border-red-200 bg-red-50 text-red-800",
    icon: "🚨"
  };
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
  await requireRole("STUDENT");

  const params  = await searchParams;
  const sortBy  = (params.sortBy  ?? "code") as SortCol;
  const sortDir = (params.sortDir === "desc" ? "desc" : "asc") as "asc" | "desc";

  const [grades, transcriptResult, termsData, me] = await Promise.all([
    serverApi<GradeItem[]>("/registration/grades"),
    serverApi<TranscriptTerm[]>("/students/transcript")
      .then((data) => ({ data, error: "" }))
      .catch((error) => ({
        data: [] as TranscriptTerm[],
        error: error instanceof Error ? error.message : "Failed to load transcript"
      })),
    serverApi<Term[]>("/academics/terms").catch(() => [] as Term[]),
    getMeServer().catch(() => null)
  ]);
  const transcriptTerms = transcriptResult.data;

  const byTerm = new Map<string, GradeItem[]>();
  for (const item of grades) {
    const list = byTerm.get(item.term.name) ?? [];
    list.push(item);
    byTerm.set(item.term.name, list);
  }

  const gradeTerms = Array.from(byTerm.keys());
  const cumulative = calcGPA(grades);
  const completedCredits = grades.reduce((sum, item) => sum + item.section.credits, 0);
  const standing = getStanding(cumulative?.gpa ?? null);
  const overallGradeDistribution = gradeDistribution(grades);
  const overallGradeTotal =
    overallGradeDistribution.A +
    overallGradeDistribution.B +
    overallGradeDistribution.C +
    overallGradeDistribution.D +
    overallGradeDistribution.F;
  const activeTerm =
    termsData.find((term) => {
      const now = Date.now();
      return now >= new Date(term.startDate).getTime() && now <= new Date(term.endDate).getTime();
    }) ?? null;
  const dropDeadline = activeTerm?.dropDeadline ? new Date(activeTerm.dropDeadline) : null;
  const daysLeft = dropDeadline ? Math.ceil((dropDeadline.getTime() - Date.now()) / 86_400_000) : null;
  const trendData = transcriptTerms
    .filter((term) => term.semesterGpa !== null)
    .map((term) => ({ term: term.termName, gpa: term.semesterGpa as number }));

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
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{grades.length} graded courses</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{gradeTerms.length} term{gradeTerms.length === 1 ? "" : "s"}</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{completedCredits} credits completed</span>
              {cumulative ? (
                <span className={`campus-chip ${gpaTier(cumulative.gpa).cls}`}>GPA {cumulative.gpa.toFixed(2)} · {gpaTier(cumulative.gpa).label}</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <TranscriptExportButton grades={grades} />
            <CertificateButton
              studentName={me?.profile?.legalName ?? me?.email ?? "Student"}
              completedCourses={grades.map((item) => ({
                code: item.section.course.code,
                title: item.section.course.title,
                credits: item.section.credits,
                grade: item.finalGrade
              }))}
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

      <section className={`flex items-start gap-3 rounded-xl border p-4 ${standing.cls}`}>
        <span className="text-2xl">{standing.icon}</span>
        <div>
          <p className="text-sm font-bold">{standing.label}</p>
          <p className="mt-0.5 text-sm">{standing.description}</p>
        </div>
      </section>

      {transcriptResult.error ? (
        <section className="campus-card border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Transcript data is temporarily unavailable. GPA trend and semester breakdowns may be incomplete until the service recovers.
        </section>
      ) : null}

      {daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 ? (
        <section
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:bg-amber-900/20"
        >
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="text-sm font-semibold">退课截止日</p>
            <p className="mt-0.5 text-xs">
              {dropDeadline?.toLocaleDateString()}，还有 {daysLeft} 天
            </p>
          </div>
        </section>
      ) : null}

      <GpaTrendChart data={trendData} />

      {overallGradeTotal > 0 ? (
        <section className="campus-card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">Grade Distribution</p>
          </div>
          <div className="space-y-3 px-4 py-4">
            {(["A", "B", "C", "D", "F"] as const).map((grade) => {
              const count = overallGradeDistribution[grade];
              const width = overallGradeTotal ? Math.max(6, Math.round((count / overallGradeTotal) * 100)) : 0;
              const tone =
                grade === "A"
                  ? "bg-emerald-500"
                  : grade === "B"
                    ? "bg-blue-500"
                    : grade === "C"
                      ? "bg-amber-500"
                      : grade === "D"
                        ? "bg-orange-500"
                        : "bg-red-500";
              return (
                <div key={grade} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 text-sm">
                  <span className={`font-semibold ${gradeColor(grade)}`}>{grade}</span>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-xs text-slate-500">{count} 门</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {transcriptTerms.length > 1 ? (
      <section className="campus-card overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-700">Semester vs Cumulative GPA</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">Term</th>
              <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-500">Semester GPA</th>
              <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-500">Cumulative GPA</th>
              <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-500">Credits</th>
            </tr>
          </thead>
          <tbody>
            {transcriptTerms.map((term) => {
              const credits = term.enrollments.reduce((sum, item) => sum + (item.section?.credits ?? 0), 0);
              return (
                <tr key={term.termId} className="border-t border-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-700">{term.termName}</td>
                  <td
                    className={`px-4 py-2 text-right font-bold ${
                      term.semesterGpa === null
                        ? "text-slate-300"
                        : term.semesterGpa >= 3.7
                          ? "text-emerald-600"
                          : term.semesterGpa >= 3
                            ? "text-blue-600"
                            : term.semesterGpa >= 2
                              ? "text-amber-600"
                              : "text-red-600"
                    }`}
                  >
                    {term.semesterGpa?.toFixed(3) ?? "—"}
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-bold ${
                      term.cumulativeGpa === null
                        ? "text-slate-300"
                        : term.cumulativeGpa >= 3.7
                          ? "text-emerald-600"
                          : term.cumulativeGpa >= 3
                            ? "text-blue-600"
                            : term.cumulativeGpa >= 2
                              ? "text-amber-600"
                              : "text-red-600"
                    }`}
                  >
                    {term.cumulativeGpa?.toFixed(3) ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500">{credits}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      ) : null}

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
          <p className="mt-1 text-2xl font-semibold text-slate-900">{gradeTerms.length}</p>
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
        <section className="campus-card px-6 py-14 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="text-4xl">🎓</span>
            <p className="text-sm font-medium text-slate-700">No grades on record yet</p>
            <p className="text-xs text-slate-500">Grades will appear here once instructors submit them for your completed courses.</p>
            <Link
              href="/student/schedule"
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 no-underline transition hover:bg-slate-50"
            >
              View Schedule →
            </Link>
          </div>
        </section>
      ) : null}

      {gradeTerms.map((termName) => {
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
              <div>
                <div className="flex h-2 overflow-hidden">
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
                <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-slate-100 bg-slate-50/60 px-5 py-2">
                  {(["A", "B", "C", "D", "F"] as const).filter((l) => dist[l] > 0).map((letter) => (
                    <span key={letter} className="flex items-center gap-1 text-[11px] text-slate-600">
                      <span className={`inline-block size-2 rounded-sm ${
                        letter === "A" ? "bg-emerald-400"
                        : letter === "B" ? "bg-blue-400"
                        : letter === "C" ? "bg-amber-400"
                        : letter === "D" ? "bg-orange-400"
                        : "bg-red-500"
                      }`} />
                      {letter} · {dist[letter]}
                    </span>
                  ))}
                </div>
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
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Rating</th>
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
                        <td className="px-4 py-3">
                          <StarRating
                            sectionId={item.sectionId}
                            initial={item.section.ratings?.[0]?.rating ?? 0}
                            apiBase={process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}
                          />
                        </td>
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
      <GpaCalculator />
    </div>
  );
}
