"use client";

interface Course {
  id: string;
  code: string;
  title: string;
  credits: number;
  department?: string;
}

interface Props {
  allCourses: Course[];
  enrolledCourseCodes: string[];
}

export default function RecommendedCourses({ allCourses, enrolledCourseCodes }: Props) {
  const enrolledDepts = new Set(enrolledCourseCodes.map((code) => code.slice(0, 2)));
  const recs = allCourses
    .filter((course) => enrolledDepts.has(course.code.slice(0, 2)) && !enrolledCourseCodes.includes(course.code))
    .slice(0, 4);

  if (!recs.length) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recommended for You</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {recs.map((course) => (
          <div key={course.id} className="campus-card flex items-start gap-3 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 font-mono text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              {course.code.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-400">{course.code}</p>
              <p className="leading-tight text-sm font-medium text-slate-800 dark:text-slate-100">{course.title}</p>
              <p className="text-xs text-slate-400">{course.credits} cr</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
