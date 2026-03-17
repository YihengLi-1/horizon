export const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const GRID_START = 8 * 60;
export const GRID_END = 21 * 60;
export const GRID_SLOT = 30;
export const GRID_ROW_COUNT = (GRID_END - GRID_START) / GRID_SLOT;

export const COURSE_TONES = [
  { start: "#2563eb", end: "#1d4ed8", soft: "#dbeafe" },
  { start: "#7c3aed", end: "#6d28d9", soft: "#ede9fe" },
  { start: "#0f766e", end: "#0f766e", soft: "#ccfbf1" },
  { start: "#ea580c", end: "#c2410c", soft: "#ffedd5" },
  { start: "#be123c", end: "#9f1239", soft: "#ffe4e6" },
  { start: "#0891b2", end: "#0e7490", soft: "#cffafe" }
] as const;

export function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function deriveStudentCohortYear(studentId?: string | null, createdAt?: string) {
  const match = studentId?.match(/^U(\d{2})/i);
  if (match) {
    const yy = Number(match[1]);
    return yy >= 80 ? 1900 + yy : 2000 + yy;
  }
  return createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
}

export function registrationPriorityOffsetDays(cohortYear: number) {
  if (cohortYear <= 2022) return 0;
  if (cohortYear === 2023) return 2;
  if (cohortYear === 2024) return 4;
  return 6;
}

export function registrationPriorityLabel(cohortYear: number) {
  if (cohortYear <= 2022) return "大四";
  if (cohortYear === 2023) return "大三";
  if (cohortYear === 2024) return "大二";
  return "大一";
}

export function hashCourseTone(courseKey: string) {
  let hash = 0;
  for (let index = 0; index < courseKey.length; index += 1) {
    hash = (hash * 31 + courseKey.charCodeAt(index)) >>> 0;
  }
  return COURSE_TONES[hash % COURSE_TONES.length];
}
