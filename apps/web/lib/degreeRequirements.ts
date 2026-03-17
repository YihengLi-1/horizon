/**
 * Degree requirements configuration.
 * Requirements are evaluated client-side against the student's enrollment history.
 *
 * A "bucket" is fulfilled when enough credits from matching courses have been COMPLETED.
 */

import { GRADE_POINTS } from "@sis/shared/constants";

export type RequirementBucket = {
  id: string;
  label: string;
  description: string;
  requiredCredits: number;
  /** Course code prefixes that satisfy this bucket (e.g. ["CS", "MATH"]) */
  prefixes?: string[];
  /** Exact course codes that satisfy this bucket */
  exactCodes?: string[];
  /** If true, any course code satisfies this bucket */
  any?: boolean;
};

export type RequirementGroup = {
  id: string;
  label: string;
  buckets: RequirementBucket[];
};

/** Total degree credits required */
export const DEGREE_TOTAL_CREDITS = 120;

/** Minimum cumulative GPA required to graduate */
export const DEGREE_MIN_GPA = 2.0;

/**
 * Degree requirement groups (Computer Science B.Sc.)
 * Adjust codes/prefixes to match your institution's catalog.
 */
export const DEGREE_REQUIREMENTS: RequirementGroup[] = [
  {
    id: "gened",
    label: "通识教育 (General Education)",
    buckets: [
      {
        id: "math",
        label: "数学基础",
        description: "微积分、线性代数等数学课程",
        requiredCredits: 12,
        prefixes: ["MATH"]
      },
      {
        id: "science",
        label: "自然科学",
        description: "物理、化学、生物等理科课程",
        requiredCredits: 8,
        prefixes: ["PHYS", "CHEM", "BIO"]
      },
      {
        id: "humanities",
        label: "人文社科",
        description: "英语写作、历史、哲学、经济等人文课程",
        requiredCredits: 12,
        prefixes: ["ENG", "HIST", "PHIL", "ECON", "SOC", "PSY"]
      }
    ]
  },
  {
    id: "core",
    label: "专业核心 (CS Core)",
    buckets: [
      {
        id: "cs-core",
        label: "计算机科学核心课",
        description: "CS 专业必修课程（CS100-CS399）",
        requiredCredits: 36,
        prefixes: ["CS"]
      }
    ]
  },
  {
    id: "advanced",
    label: "专业方向 (Advanced Electives)",
    buckets: [
      {
        id: "cs-advanced",
        label: "计算机科学高阶选修",
        description: "CS 400 级及以上专业选修课",
        requiredCredits: 18,
        prefixes: ["CS"]
      }
    ]
  },
  {
    id: "elective",
    label: "自由选修 (Free Electives)",
    buckets: [
      {
        id: "free",
        label: "自由选修学分",
        description: "任意课程均可计入",
        requiredCredits: 34,
        any: true
      }
    ]
  }
];

export type CompletedCourse = {
  code: string;
  credits: number;
  grade: string | null;
  termName: string;
};

export function computeGpa(courses: CompletedCourse[]): number {
  let totalPoints = 0;
  let totalCredits = 0;
  for (const c of courses) {
    const pts = c.grade ? GRADE_POINTS[c.grade] : undefined;
    if (pts == null || Number.isNaN(pts)) continue;
    totalPoints += pts * c.credits;
    totalCredits += c.credits;
  }
  return totalCredits > 0 ? totalPoints / totalCredits : 0;
}

/** Returns which courses from `completed` satisfy a given bucket */
export function coursesForBucket(bucket: RequirementBucket, all: CompletedCourse[]): CompletedCourse[] {
  return all.filter((c) => {
    if (bucket.any) return true;
    if (bucket.exactCodes?.includes(c.code)) return true;
    if (bucket.prefixes) {
      // CS core bucket: only 100-399
      if (bucket.id === "cs-core") {
        const match = /^([A-Z]+)(\d+)/.exec(c.code);
        if (!match) return false;
        const [, prefix, numStr] = match;
        const num = parseInt(numStr, 10);
        return bucket.prefixes.includes(prefix) && num >= 100 && num <= 399;
      }
      // CS advanced bucket: only 400+
      if (bucket.id === "cs-advanced") {
        const match = /^([A-Z]+)(\d+)/.exec(c.code);
        if (!match) return false;
        const [, prefix, numStr] = match;
        const num = parseInt(numStr, 10);
        return bucket.prefixes.includes(prefix) && num >= 400;
      }
      return bucket.prefixes.some((p) => c.code.startsWith(p));
    }
    return false;
  });
}

export type BucketProgress = {
  bucket: RequirementBucket;
  earnedCredits: number;
  requiredCredits: number;
  pct: number;
  satisfied: boolean;
  courses: CompletedCourse[];
};

export type GroupProgress = {
  group: RequirementGroup;
  buckets: BucketProgress[];
  earnedCredits: number;
  requiredCredits: number;
  satisfied: boolean;
};

export function computeProgress(completed: CompletedCourse[]): {
  groups: GroupProgress[];
  totalEarned: number;
  totalRequired: number;
  gpa: number;
  overallPct: number;
  allSatisfied: boolean;
} {
  const groups: GroupProgress[] = DEGREE_REQUIREMENTS.map((group) => {
    // Track which courses have been used already (avoid double-counting across buckets)
    const usedCodes = new Set<string>();
    const buckets: BucketProgress[] = group.buckets.map((bucket) => {
      const candidates = coursesForBucket(bucket, completed).filter((c) => !usedCodes.has(c.code));
      // Sort by credits desc to maximise coverage
      const sorted = [...candidates].sort((a, b) => b.credits - a.credits);
      let earned = 0;
      const used: CompletedCourse[] = [];
      for (const c of sorted) {
        earned += c.credits;
        used.push(c);
        usedCodes.add(c.code);
        if (earned >= bucket.requiredCredits) break;
      }
      const pct = Math.min(100, Math.round((earned / bucket.requiredCredits) * 100));
      return { bucket, earnedCredits: earned, requiredCredits: bucket.requiredCredits, pct, satisfied: earned >= bucket.requiredCredits, courses: used };
    });
    const groupEarned = buckets.reduce((s, b) => s + b.earnedCredits, 0);
    const groupRequired = buckets.reduce((s, b) => s + b.requiredCredits, 0);
    return { group, buckets, earnedCredits: groupEarned, requiredCredits: groupRequired, satisfied: buckets.every((b) => b.satisfied) };
  });

  const totalEarned = completed.reduce((s, c) => s + c.credits, 0);
  const totalRequired = DEGREE_TOTAL_CREDITS;
  const gpa = computeGpa(completed);
  const overallPct = Math.min(100, Math.round((totalEarned / totalRequired) * 100));
  const allSatisfied = groups.every((g) => g.satisfied) && totalEarned >= totalRequired && gpa >= DEGREE_MIN_GPA;

  return { groups, totalEarned, totalRequired, gpa, overallPct, allSatisfied };
}
