const gradePoints: Record<string, number> = {
  "A+": 4.3,
  A: 4,
  "A-": 3.7,
  "B+": 3.3,
  B: 3,
  "B-": 2.7,
  "C+": 2.3,
  C: 2,
  "C-": 1.7,
  "D+": 1.3,
  D: 1,
  F: 0
};

export function isPassingGrade(grade?: string | null): boolean {
  if (!grade) return false;
  const normalized = grade.toUpperCase().trim();
  const points = gradePoints[normalized];
  if (points === undefined) return false;
  return points >= 2;
}

export function toDateOrNull(value?: string | null): Date | null {
  if (!value) return null;
  return new Date(value);
}
