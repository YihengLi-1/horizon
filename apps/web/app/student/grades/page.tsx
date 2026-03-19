import { getMeServer, requireRole } from "@/lib/server-auth";
import Link from "next/link";
import { GRADE_POINTS } from "@sis/shared/constants";
import { serverApi } from "@/lib/server-api";
import CertificateButton from "./CertificateButton";
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
  if (gpa >= 3.7) return { label: "院长名单", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (gpa >= 3.0) return { label: "学业正常", cls: "border-blue-200 bg-blue-50 text-blue-700" };
  if (gpa >= 2.0) return { label: "学业警告", cls: "border-amber-200 bg-amber-50 text-amber-700" };
  return { label: "学业察看", cls: "border-red-200 bg-red-50 text-red-700" };
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
      label: "暂无GPA",
      description: "暂无成绩记录",
      cls: "border-slate-200 bg-slate-50 text-slate-700",
      icon: "📋"
    };
  }
  if (gpa >= 3.7) {
    return {
      label: "院长名单",
      description: `GPA ${gpa.toFixed(2)} — 学业表现卓越，荣登院长名单。`,
      cls: "border-emerald-200 bg-emerald-50 text-emerald-800",
      icon: "🏆"
    };
  }
  if (gpa >= 3.0) {
    return {
      label: "学业正常",
      description: `GPA ${gpa.toFixed(2)} — 学业进展良好，符合要求。`,
      cls: "border-blue-200 bg-blue-50 text-blue-800",
      icon: "✅"
    };
  }
  if (gpa >= 2.0) {
    return {
      label: "学业警告",
      description: `GPA ${gpa.toFixed(2)} — 达到最低要求，但需继续努力提升。`,
      cls: "border-amber-200 bg-amber-50 text-amber-800",
      icon: "⚠️"
    };
  }
  return {
    label: "学业察看",
    description: `GPA ${gpa.toFixed(2)} — GPA 低于最低要求（2.0），请联系注册处获取后续指导。`,
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
        className={`inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap transition-colors ${
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
        error: error instanceof Error ? error.message : "成绩单加载失败"
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
      {/* Tab nav */}
      <div className="mb-6 flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        <span className="flex-1 rounded-lg bg-white px-4 py-2 text-center text-sm font-semibold text-slate-900 shadow-sm">
          成绩
        </span>
        <Link
          href="/student/course-history"
          className="flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium text-slate-500 no-underline transition hover:bg-white hover:text-slate-900"
        >
          修课历史
        </Link>
        <Link
          href="/student/transcript"
          className="flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium text-slate-500 no-underline transition hover:bg-white hover:text-slate-900"
        >
          成绩单
        </Link>
      </div>
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">学业记录</p>
            <h1 className="campus-title">我的成绩</h1>
            <p className="campus-subtitle">查看各学期的最终成绩与 GPA 走势</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{grades.length} 门已出分课程</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{gradeTerms.length} 个学期</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">已完成 {completedCredits} 学分</span>
              {cumulative ? (
                <span className={`campus-chip ${gpaTier(cumulative.gpa).cls}`}>GPA {cumulative.gpa.toFixed(2)} · {gpaTier(cumulative.gpa).label}</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <TranscriptExportButton grades={grades} />
            <CertificateButton
              studentName={me?.profile?.legalName ?? me?.email ?? "学生"}
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
              查看课表
            </Link>
            <Link
              href="/student/catalog"
              className="inline-flex h-10 items-center rounded-lg border border-white/35 bg-white/90 px-4 text-sm font-semibold text-slate-800 no-underline transition hover:bg-white"
            >
              浏览课程目录
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
          成绩单数据暂时不可用，GPA 走势与学期明细可能不完整，请稍后再试。
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
            <p className="text-sm font-semibold text-slate-700">成绩分布</p>
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
          <p className="text-sm font-semibold text-slate-700">学期 GPA vs 累计 GPA</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">学期</th>
              <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-500">学期 GPA</th>
              <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-500">累计 GPA</th>
              <th scope="col" className="px-4 py-2 text-right text-xs font-semibold uppercase text-slate-500">学分</th>
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
          <p className="text-xs font-semibold text-slate-500">已修学分</p>
          <p className="campus-kpi-value">{completedCredits}</p>
        </div>
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold text-slate-500">已评分课程</p>
          <p className="campus-kpi-value">{grades.length}</p>
        </div>
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold text-slate-500">有成绩学期</p>
          <p className="campus-kpi-value">{gradeTerms.length}</p>
        </div>
        <div className="campus-kpi border-blue-200 bg-blue-50/70">
          <p className="text-xs font-semibold text-blue-700">累计 GPA</p>
          <p className={`campus-kpi-value ${cumulative ? gpaTone(cumulative.gpa) : "text-slate-700"}`}>
            {cumulative ? cumulative.gpa.toFixed(2) : "—"}
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
            <p className="text-sm font-medium text-slate-700">暂无成绩记录</p>
            <p className="text-xs text-slate-500">成绩将在教师提交后显示。</p>
            <Link
              href="/student/schedule"
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 no-underline transition hover:bg-slate-50"
            >
              查看课表 →
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
                <span className="campus-chip border-slate-300 bg-white text-slate-700">{termCredits} 学分</span>
                <span className={`campus-chip border-slate-300 bg-white ${termGpa ? gpaTone(termGpa.gpa) : "text-slate-600"}`}>
                  {termGpa ? `本学期GPA ${termGpa.gpa.toFixed(2)}` : "本学期GPA —"}
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
                        title={`${letter}：${dist[letter]} 门`}
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
                    <SortTh col="code"         label="课程"   sortBy={sortBy} sortDir={sortDir} />
                    <SortTh col="title"        label="名称"   sortBy={sortBy} sortDir={sortDir} />
                    <SortTh col="credits"      label="学分"   sortBy={sortBy} sortDir={sortDir} />
                    <SortTh col="grade"        label="成绩"   sortBy={sortBy} sortDir={sortDir} />
                    <SortTh col="points"       label="绩点"   sortBy={sortBy} sortDir={sortDir} />
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">评价</th>
                    <SortTh col="contribution" label="GPA贡献" sortBy={sortBy} sortDir={sortDir} right />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const pts = gradePoints(item.finalGrade);
                    const contribution = pts !== null ? pts * item.section.credits : null;
                    return (
                      <tr key={item.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40">
                        <td className="px-4 py-3 font-medium text-slate-900">{item.section.course.code}</td>
                        <td className="px-4 py-3 text-slate-700">
                          <details className="group">
                            <summary className="cursor-pointer list-none font-medium text-slate-800 transition hover:text-slate-900">
                              <span>{item.section.course.title}</span>
                              <span className="ml-2 text-[11px] font-semibold text-indigo-600 group-open:hidden">查看详情</span>
                              <span className="ml-2 hidden text-[11px] font-semibold text-indigo-600 group-open:inline">收起详情</span>
                            </summary>
                            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-600">
                              <p>学分：{item.section.credits} · 绩点：{pts !== null ? pts.toFixed(1) : "—"} · 贡献绩点：{contribution !== null ? contribution.toFixed(1) : "—"}</p>
                              <p className="mt-1">课程评教：{item.section.ratings?.[0]?.rating ? `${item.section.ratings[0].rating}/5` : "暂未填写"}</p>
                              <p className="mt-1">出勤与细分评分说明暂未开放，若对结果有疑问可前往成绩申诉页面发起申请。</p>
                              <Link href="/student/appeals" className="mt-2 inline-flex items-center gap-1 font-semibold text-indigo-700 no-underline hover:text-indigo-800">
                                前往成绩申诉 →
                              </Link>
                            </div>
                          </details>
                        </td>
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
    </div>
  );
}
