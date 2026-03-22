import { BadRequestException } from "@nestjs/common";
import { VALID_GRADES } from "@sis/shared/constants";

export const VALID_GRADE_SET = new Set<string>(VALID_GRADES);

export function normalizeGradeValue(grade: string): string {
  return grade.trim().toUpperCase();
}

export function assertValidGrade(grade: string): void {
  const normalized = normalizeGradeValue(grade);
  if (!VALID_GRADE_SET.has(normalized)) {
    throw new BadRequestException(
      `无效成绩值 "${grade}"，合法值：${[...VALID_GRADE_SET].join(", ")}`
    );
  }
}
