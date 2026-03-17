export type TermStatus = "UPCOMING" | "REGISTRATION_OPEN" | "REGISTRATION_CLOSED" | "IN_PROGRESS" | "GRADING" | "CLOSED";

export type TermStatusInput = {
  registrationOpenAt: Date;
  registrationCloseAt: Date;
  startDate: Date;
  endDate: Date;
};

export const TERM_GRADING_LOCK_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getTermGradesLockDate(term: Pick<TermStatusInput, "endDate">): Date {
  return new Date(term.endDate.getTime() + TERM_GRADING_LOCK_DAYS * DAY_MS);
}

export function getTermStatus(term: TermStatusInput, now = new Date()): TermStatus {
  const nowMs = now.getTime();
  const registrationOpenMs = term.registrationOpenAt.getTime();
  const registrationCloseMs = term.registrationCloseAt.getTime();
  const startMs = term.startDate.getTime();
  const endMs = term.endDate.getTime();
  const gradesLockMs = getTermGradesLockDate(term).getTime();

  if (nowMs < registrationOpenMs) return "UPCOMING";
  if (nowMs <= registrationCloseMs) return "REGISTRATION_OPEN";
  if (nowMs < startMs) return "REGISTRATION_CLOSED";
  if (nowMs <= endMs) return "IN_PROGRESS";
  if (nowMs <= gradesLockMs) return "GRADING";
  return "CLOSED";
}
