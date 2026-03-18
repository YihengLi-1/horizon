"use client";

import Link from "next/link";
import { Suspense, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Search, Star } from "lucide-react";
import { RegistrationStepper } from "@/components/registration-stepper";
import { SkeletonTable } from "@/components/skeleton-table";
import { useToast } from "@/components/Toast";
import GradeDistBar from "@/components/GradeDistBar";
import CoursePairings from "@/components/CoursePairings";
import MultiDimRating from "@/components/MultiDimRating";
import SectionReviews from "@/components/SectionReviews";
import { apiFetch } from "@/lib/api";
import {
  WEEKDAY,
  deriveStudentCohortYear,
  fmt,
  registrationPriorityLabel,
  registrationPriorityOffsetDays
} from "@/lib/schedule-utils";
import RecommendedCourses from "./RecommendedCourses";

type MeetingTime = {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
};

type Term = {
  id: string;
  name: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  dropDeadline: string;
  maxCredits: number;
};

type StudentProfileSummary = {
  user?: {
    studentId?: string | null;
    createdAt?: string;
  };
};

type Section = {
  id: string;
  sectionCode: string;
  credits: number;
  modality: string;
  capacity: number;
  gradeDistribution?: { A: number; B: number; C: number; D: number; F: number; total: number };
  ratings?: Array<{ rating: number; difficulty?: number | null; workload?: number | null; wouldRecommend?: boolean | null }>;
  instructorName: string;
  location: string | null;
  requireApproval: boolean;
  myStatus?: "ENROLLED" | "WAITLISTED" | "IN_CART" | "NONE";
  myWaitlistPosition?: number | null;
  meetingTimes: MeetingTime[];
  enrollments: Array<{ status: string }>;
  course: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    weeklyHours?: number | null;
    prerequisiteLinks?: Array<{ prerequisiteCourse: { code: string } }>;
  };
};

type CartItem = {
  id: string;
  section: {
    id: string;
    meetingTimes: MeetingTime[];
  };
};

type StudentEnrollment = {
  id: string;
  status: string;
  section: {
    id: string;
    course: { code: string };
  };
};

type GradeEnrollment = {
  section: {
    course: {
      code: string;
    };
  };
};

function meetingChip(mt: MeetingTime): string {
  return `${WEEKDAY[mt.weekday] ?? mt.weekday} ${fmt(mt.startMinutes)}–${fmt(mt.endMinutes)}`;
}

function timeOverlap(a: MeetingTime[], b: MeetingTime[]): boolean {
  return a.some((m1) =>
    b.some(
      (m2) =>
        m1.weekday === m2.weekday &&
        m1.startMinutes < m2.endMinutes &&
        m2.startMinutes < m1.endMinutes
    )
  );
}

function getEnrolledCount(section: Section): number {
  return (section.enrollments ?? []).filter((enrollment) => enrollment.status === "ENROLLED").length;
}

function getWaitlistedCount(section: Section): number {
  return (section.enrollments ?? []).filter((enrollment) => enrollment.status === "WAITLISTED").length;
}

function getRemainingSeats(section: Section): number {
  if (section.capacity === 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, section.capacity - getEnrolledCount(section));
}

function getPrerequisiteCodes(section: Section): string[] {
  return (section.course.prerequisiteLinks ?? [])
    .map((link) => link.prerequisiteCourse?.code)
    .filter((code): code is string => Boolean(code));
}

function averageRating(section: Section): number | null {
  if (!section.ratings || section.ratings.length === 0) return null;
  return section.ratings.reduce((sum, r) => sum + r.rating, 0) / section.ratings.length;
}

function sectionStats(section: Section) {
  const r = section.ratings;
  if (!r || r.length === 0) return null;
  const avg = (arr: (number | null | undefined)[]) => {
    const v = arr.filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const recommends = r.filter((x) => x.wouldRecommend === true).length;
  return {
    count: r.length,
    avgRating: avg(r.map((x) => x.rating)),
    avgDifficulty: avg(r.map((x) => x.difficulty)),
    avgWorkload: avg(r.map((x) => x.workload)),
    recommendPct: Math.round((recommends / r.length) * 100)
  };
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={`${part}-${index}`} className="rounded bg-amber-200 px-0.5 dark:bg-amber-700">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}

function Alert({
  type,
  message,
  action
}: {
  type: "success" | "error" | "info" | "warning";
  message: string;
  action?: ReactNode;
}) {
  const cls =
    type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : type === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : type === "warning"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      className={`rounded-xl border px-4 py-3 text-sm ${cls}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{message}</span>
        {action ? <div>{action}</div> : null}
      </div>
    </div>
  );
}

function seatToneText(availableSeats: number) {
  if (availableSeats <= 0) return { text: "已满", className: "text-red-700" };
  if (availableSeats <= 2) return { text: `最后 ${availableSeats} 席`, className: "animate-pulse text-red-700" };
  if (availableSeats <= 10) return { text: `仅剩 ${availableSeats} 席`, className: "text-amber-700" };
  return { text: `剩 ${availableSeats} 席`, className: "text-slate-500" };
}

function RegistrationWindowBanner({
  term,
  student
}: {
  term: Term | null;
  student: StudentProfileSummary | null;
}) {
  if (!term) return null;

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const cohortYear = deriveStudentCohortYear(student?.user?.studentId, student?.user?.createdAt);
  const priorityLabel = registrationPriorityLabel(cohortYear);
  const adjustedOpen = new Date(
    new Date(term.registrationOpenAt).getTime() + registrationPriorityOffsetDays(cohortYear) * 24 * 60 * 60 * 1000
  );
  const open = adjustedOpen.getTime();
  const close = new Date(term.registrationCloseAt).getTime();
  const countdownMs = Math.max(0, open - now);
  const countdown = {
    days: Math.floor(countdownMs / (24 * 60 * 60 * 1000)),
    hours: Math.floor((countdownMs / (60 * 60 * 1000)) % 24),
    minutes: Math.floor((countdownMs / (60 * 1000)) % 60),
    seconds: Math.floor((countdownMs / 1000) % 60)
  };

  if (now < open) {
    return (
      <Alert
        type="info"
        message={`你的选课开放时间：${adjustedOpen.toLocaleString()}（优先级：${priorityLabel}）。倒计时 ${countdown.days}天 ${countdown.hours}小时 ${countdown.minutes}分 ${countdown.seconds}秒。`}
      />
    );
  }
  if (now > close) {
    return (
      <Alert
        type="warning"
        message={`Registration window is closed (closed ${new Date(term.registrationCloseAt).toLocaleDateString()}). To make changes, contact registrar support.`}
      />
    );
  }
  return (
    <Alert
      type="success"
      message={`Registration window is OPEN — closes ${new Date(term.registrationCloseAt).toLocaleDateString()} at ${new Date(term.registrationCloseAt).toLocaleTimeString()}.`}
    />
  );
}

const PAGE_SIZE = 20;
const SAVED_COURSES_KEY = "saved_courses";

export default function StudentCatalogPage() {
  const toast = useToast();
  const [terms, setTerms] = useState<Term[]>([]);
  const [studentProfile, setStudentProfile] = useState<StudentProfileSummary | null>(null);
  const [termId, setTermId] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [filters, setFilters] = useState({
    dept: "ALL",
    modality: "ALL",
    credits: "ALL",
    days: [] as number[],
    availableOnly: false,
    search: "",
    sort: "RELEVANCE"
  });
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterPrereqReady, setFilterPrereqReady] = useState(false);
  const [filterApprovalOnly, setFilterApprovalOnly] = useState(false);
  const [filterNoConflict, setFilterNoConflict] = useState(false);
  const [termEnrollments, setTermEnrollments] = useState<StudentEnrollment[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [addingSectionId, setAddingSectionId] = useState("");
  const [removingSectionId, setRemovingSectionId] = useState("");
  const [passedCourseCodes, setPassedCourseCodes] = useState<string[]>([]);
  const [hydratedFilters, setHydratedFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [watches, setWatches] = useState<Set<string>>(new Set());
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [recentlyViewed, setRecentlyViewed] = useState<Array<{ sectionId: string; code: string; title: string }>>([]);
  const [savedCourseIds, setSavedCourseIds] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const search = filters.search;
  const filterModality = filters.modality;
  const filterCredits = filters.credits;
  const filterDept = filters.dept;
  const availableOnly = filters.availableOnly;
  const filterAvailable = filters.availableOnly;
  const sortBy = filters.sort;

  // Wrapper setters for backward-compat with all existing JSX/handlers
  const setSearch = (v: string) => setFilters(p => ({ ...p, search: v }));
  const setFilterModality = (v: string) => setFilters(p => ({ ...p, modality: v }));
  const setFilterCredits = (v: string) => setFilters(p => ({ ...p, credits: v }));
  const setFilterDept = (v: string) => setFilters(p => ({ ...p, dept: v }));
  const setFilterAvailable = (v: boolean) => setFilters(p => ({ ...p, availableOnly: v }));
  const setSortBy = (v: string) => setFilters(p => ({ ...p, sort: v }));
  const setFilterDays = (v: number[]) => setFilters(p => ({ ...p, days: v }));

  // Press "/" to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "SELECT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => window.clearTimeout(timer);
  }, [filters.search]);

  // Load recently viewed from sessionStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(
        window.sessionStorage.getItem("recently_viewed") ??
          window.sessionStorage.getItem("sis-recently-viewed") ??
          "[]"
      );
      if (Array.isArray(saved)) setRecentlyViewed(saved.slice(0, 5));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(SAVED_COURSES_KEY) ?? "[]");
      const ids = Array.isArray(saved) ? saved.map((item) => item?.courseId).filter(Boolean) : [];
      setSavedCourseIds(new Set(ids));
    } catch {
      setSavedCourseIds(new Set());
    }
  }, []);

  const trackView = (section: Section) => {
    setRecentlyViewed(prev => {
      const entry = { sectionId: section.id, code: section.course.code, title: section.course.title };
      const filtered = prev.filter(x => x.sectionId !== section.id);
      const next = [entry, ...filtered].slice(0, 5);
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem("recently_viewed", JSON.stringify(next));
          window.sessionStorage.setItem("sis-recently-viewed", JSON.stringify(next));
        } catch { /* ignore */ }
      }
      return next;
    });
  };

  const toggleSavedCourse = (section: Section) => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(SAVED_COURSES_KEY) ?? "[]");
      const list = Array.isArray(saved) ? saved : [];
      const exists = list.some((item) => item?.courseId === section.course.id);
      const next = exists
        ? list.filter((item) => item?.courseId !== section.course.id)
        : [
            ...list,
            {
              courseId: section.course.id,
              code: section.course.code,
              title: section.course.title,
              credits: section.credits
            }
          ];
      window.localStorage.setItem(SAVED_COURSES_KEY, JSON.stringify(next));
      setSavedCourseIds(new Set(next.map((item) => item.courseId)));
      if (exists) {
        toast.info(`${section.course.code} 已取消收藏`);
      } else {
        toast.success(`${section.course.code} 已加入收藏`);
      }
    } catch {
      toast.error("保存收藏失败");
    }
  };

  const activeTerm = useMemo(() => terms.find((t) => t.id === termId) ?? null, [terms, termId]);

  const isRegistrationOpen = useMemo(() => {
    if (!activeTerm) return false;
    const now = Date.now();
    return now >= new Date(activeTerm.registrationOpenAt).getTime() && now <= new Date(activeTerm.registrationCloseAt).getTime();
  }, [activeTerm]);

  const cartSectionIds = useMemo(
    () => new Set(cartItems.map((item) => item.section?.id).filter((id): id is string => Boolean(id))),
    [cartItems]
  );
  const cartMeetingTimes = useMemo(
    () => cartItems.flatMap((item) => item.section?.meetingTimes ?? []),
    [cartItems]
  );
  const passedCourseCodeSet = useMemo(() => new Set(passedCourseCodes), [passedCourseCodes]);

  // Track which section IDs and course codes the student is already enrolled in for this term
  const enrolledSectionIdSet = useMemo(
    () => new Set(
      termEnrollments
        .filter((e) => e.status === "ENROLLED" || e.status === "PENDING_APPROVAL")
        .map((e) => e.section.id)
    ),
    [termEnrollments]
  );
  const enrolledCourseCodeSet = useMemo(
    () => new Set(
      termEnrollments
        .filter((e) => e.status === "ENROLLED" || e.status === "PENDING_APPROVAL")
        .map((e) => e.section.course.code)
    ),
    [termEnrollments]
  );
  const updateUrlTerm = (nextTermId: string) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (nextTermId) url.searchParams.set("termId", nextTermId);
    else url.searchParams.delete("termId");
    window.history.replaceState({}, "", url.toString());
  };

  const parseBool = (value: string | null): boolean => value === "1" || value === "true";

  const loadSections = async (tid: string) => {
    if (!tid) { setSections([]); return; }
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<Section[]>(`/academics/sections?termId=${tid}`);
      const dists = await Promise.allSettled(
        data.slice(0, 20).map((section) =>
          apiFetch<{ A: number; B: number; C: number; D: number; F: number; total: number }>(
            `/academics/sections/${section.id}/grade-distribution`
          )
        )
      );
      const withDist = data.map((section, index) => ({
        ...section,
        gradeDistribution: dists[index]?.status === "fulfilled" ? dists[index].value : undefined
      }));
      setSections(withDist);
    } catch (err) {
      setError(err instanceof Error ? err.message : "教学班加载失败");
    } finally {
      setLoading(false);
    }
  };

  const loadWatches = async () => {
    try {
      const data = await apiFetch<Array<{ sectionId: string }>>("/registration/watches");
      setWatches(new Set(data.map((watch) => watch.sectionId)));
    } catch {
      setWatches(new Set());
    }
  };

  const loadCart = async (tid: string) => {
    if (!tid) { setCartItems([]); return; }
    try {
      const data = await apiFetch<CartItem[]>(`/registration/cart?termId=${tid}`);
      setCartItems(data);
    } catch {
      setCartItems([]);
    }
  };

  const loadEnrollments = async (tid: string) => {
    if (!tid) { setTermEnrollments([]); return; }
    try {
      const data = await apiFetch<StudentEnrollment[]>(`/registration/enrollments?termId=${tid}`);
      setTermEnrollments(data);
    } catch {
      setTermEnrollments([]);
    }
  };

  useEffect(() => {
    async function init() {
      try {
        setError("");
        const [data, grades, me] = await Promise.all([
          apiFetch<Term[]>("/academics/terms"),
          apiFetch<GradeEnrollment[]>("/registration/grades").catch(() => []),
          apiFetch<StudentProfileSummary>("/students/me").catch(() => null)
        ]);
        setTerms(data);
        setPassedCourseCodes(Array.from(new Set(grades.map((g) => g.section.course.code))));
        setStudentProfile(me);
        const query = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const queryTermId = query?.get("termId") ?? "";
        const querySearch = query?.get("q") ?? "";
        const queryModality = query?.get("modality") ?? "ALL";
        const queryCredits = query?.get("credits") ?? "ALL";
        const queryDept = (query?.get("dept") ?? "ALL").toUpperCase();
        const querySort = query?.get("sort") ?? "RELEVANCE";
        const queryDays = (query?.get("days") ?? "")
          .split(",")
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

        setDebouncedSearch(querySearch);
        setFilters({
          dept: queryDept.length >= 2 ? queryDept : "ALL",
          modality: ["ALL", "ON_CAMPUS", "ONLINE", "HYBRID"].includes(queryModality) ? queryModality : "ALL",
          credits: queryCredits === "ALL" ? "ALL" : queryCredits,
          days: queryDays,
          availableOnly: parseBool(query?.get("available") ?? null),
          search: querySearch,
          sort: ["RELEVANCE", "SEATS_ASC", "CREDITS_ASC", "CREDITS_DESC", "RATING_DESC"].includes(querySort)
            ? querySort
            : "RELEVANCE"
        });
        setFilterPrereqReady(parseBool(query?.get("prereqReady") ?? null));
        setFilterApprovalOnly(parseBool(query?.get("approvalOnly") ?? null));
        setFilterNoConflict(parseBool(query?.get("noConflict") ?? null));

        const validId = queryTermId && data.some((t) => t.id === queryTermId) ? queryTermId : data[0]?.id ?? "";
        setTermId(validId);
        if (validId) {
          updateUrlTerm(validId);
          await Promise.all([loadSections(validId), loadCart(validId), loadEnrollments(validId), loadWatches()]);
        }
        setHydratedFilters(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
        setHydratedFilters(true);
      }
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTermChange = async (nextTermId: string) => {
    setTermId(nextTermId);
    updateUrlTerm(nextTermId);
    setFilters({ dept: "ALL", modality: "ALL", credits: "ALL", days: [], availableOnly: false, search: "", sort: "RELEVANCE" });
    setFilterPrereqReady(false);
    setFilterApprovalOnly(false);
    setFilterNoConflict(false);
    setNotice("");
    setError("");
    await Promise.all([loadSections(nextTermId), loadCart(nextTermId), loadEnrollments(nextTermId), loadWatches()]);
  };

  useEffect(() => {
    if (!hydratedFilters || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (termId) url.searchParams.set("termId", termId);
    else url.searchParams.delete("termId");

    if (debouncedSearch.trim()) url.searchParams.set("q", debouncedSearch.trim());
    else url.searchParams.delete("q");

    if (filterModality !== "ALL") url.searchParams.set("modality", filterModality);
    else url.searchParams.delete("modality");

    if (filterCredits !== "ALL") url.searchParams.set("credits", filterCredits);
    else url.searchParams.delete("credits");

    if (filterDept !== "ALL") url.searchParams.set("dept", filterDept);
    else url.searchParams.delete("dept");

    if (sortBy !== "RELEVANCE") url.searchParams.set("sort", sortBy);
    else url.searchParams.delete("sort");

    if (availableOnly) url.searchParams.set("available", "1");
    else url.searchParams.delete("available");

    if (filters.days.length > 0) url.searchParams.set("days", filters.days.join(","));
    else url.searchParams.delete("days");

    if (filterPrereqReady) url.searchParams.set("prereqReady", "1");
    else url.searchParams.delete("prereqReady");

    if (filterApprovalOnly) url.searchParams.set("approvalOnly", "1");
    else url.searchParams.delete("approvalOnly");

    if (filterNoConflict) url.searchParams.set("noConflict", "1");
    else url.searchParams.delete("noConflict");

    window.history.replaceState({}, "", url.toString());
  }, [
    hydratedFilters,
    termId,
    debouncedSearch,
    filterModality,
    filterCredits,
    filterDept,
    availableOnly,
    filters.days,
    filterPrereqReady,
    filterApprovalOnly,
    filterNoConflict,
    sortBy
  ]);

  const clearFilters = () => {
    setFilters({ dept: "ALL", modality: "ALL", credits: "ALL", days: [], availableOnly: false, search: "", sort: "RELEVANCE" });
    setFilterPrereqReady(false);
    setFilterApprovalOnly(false);
    setFilterNoConflict(false);
    setPage(1);
  };

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (debouncedSearch.trim()) labels.push(`Search: ${debouncedSearch.trim()}`);
    if (filterModality !== "ALL") labels.push(`Modality: ${filterModality.replace("_", " ")}`);
    if (filterCredits !== "ALL") labels.push(`学分：${filterCredits}`);
    if (filterDept !== "ALL") labels.push(`院系：${filterDept}`);
    if (availableOnly) labels.push("有余位");
    if (filters.days.length > 0) labels.push(`上课时间：${filters.days.map((day) => WEEKDAY[day]).join('、')}`);
    if (filterPrereqReady) labels.push("先修课已满足");
    if (filterApprovalOnly) labels.push("需审批");
    if (filterNoConflict) labels.push("无购物车冲突");
    const SORT_LABELS: Record<string, string> = { SEATS_ASC: "余量升序", CREDITS_ASC: "学分升序", CREDITS_DESC: "学分降序", RATING_DESC: "评分降序" };
    if (sortBy !== "RELEVANCE") labels.push(`排序：${SORT_LABELS[sortBy] ?? sortBy}`);
    return labels;
  }, [
    debouncedSearch,
    filterModality,
    filterCredits,
    filterDept,
    availableOnly,
    filters.days,
    filterPrereqReady,
    filterApprovalOnly,
    filterNoConflict,
    sortBy
  ]);

  const creditOptions = useMemo(() => {
    const vals = Array.from(new Set(sections.map((s) => s.credits))).sort((a, b) => a - b);
    return vals;
  }, [sections]);
  const deptOptions = useMemo(() => {
    const vals = Array.from(
      new Set(
        sections
          .map((section) => section.course.code.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? "")
          .filter(Boolean)
      )
    ).sort();
    return vals;
  }, [sections]);

  const filteredSections = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const filtered = sections.filter((s) => {
      const sectionMeetingTimes = s.meetingTimes ?? [];
      const remainingSeats = getRemainingSeats(s);
      const prereqCodes = getPrerequisiteCodes(s);
      const hasConflict =
        !cartSectionIds.has(s.id) &&
        timeOverlap(sectionMeetingTimes, cartMeetingTimes);

      if (q) {
        const target = `${s.course.code} ${s.course.title} ${s.sectionCode} ${s.instructorName}`.toLowerCase();
        if (!target.includes(q)) return false;
      }
      if (filterModality !== "ALL" && s.modality !== filterModality) return false;
      if (filterCredits !== "ALL") {
        if (filterCredits === "4" && s.credits < 4) return false;
        if (filterCredits !== "4" && s.credits !== Number(filterCredits)) return false;
      }
      if (filterDept !== "ALL" && !s.course.code.toUpperCase().startsWith(filterDept)) return false;
      if (availableOnly && s.capacity !== 0 && remainingSeats <= 0) return false;
      if (filterPrereqReady && prereqCodes.some((code) => !passedCourseCodeSet.has(code))) return false;
      if (filterApprovalOnly && !s.requireApproval) return false;
      if (filterNoConflict && hasConflict) return false;
      // Day filter: section must have at least one meeting on a selected weekday
      if (filters.days.length > 0 && !sectionMeetingTimes.some(mt => filters.days.includes(mt.weekday))) return false;
      return true;
    });

    if (sortBy === "SEATS_ASC") {
      filtered.sort((a, b) => {
        const aSeats = a.capacity === 0 ? Number.MAX_SAFE_INTEGER : getRemainingSeats(a);
        const bSeats = b.capacity === 0 ? Number.MAX_SAFE_INTEGER : getRemainingSeats(b);
        return aSeats - bSeats;
      });
    } else if (sortBy === "CREDITS_ASC") {
      filtered.sort((a, b) => a.credits - b.credits);
    } else if (sortBy === "CREDITS_DESC") {
      filtered.sort((a, b) => b.credits - a.credits);
    } else if (sortBy === "RATING_DESC") {
      filtered.sort((a, b) => {
        const avgA = averageRating(a) ?? -1;
        const avgB = averageRating(b) ?? -1;
        return avgB - avgA;
      });
    }

    return filtered;
  }, [
    sections,
    debouncedSearch,
    filterModality,
    filterCredits,
    filterDept,
    availableOnly,
    filters.days,
    filterPrereqReady,
    filterApprovalOnly,
    filterNoConflict,
    cartSectionIds,
    cartMeetingTimes,
    passedCourseCodeSet,
    sortBy
  ]);

  // Reset to page 1 whenever filters/search/sort change
  useEffect(() => {
    if (!hydratedFilters) return;
    setPage(1);
  }, [hydratedFilters, debouncedSearch, filterModality, filterCredits, filterDept, availableOnly, filters.days, filterPrereqReady, filterApprovalOnly, filterNoConflict, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredSections.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedSections = filteredSections.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const catalogStats = useMemo(() => {
    let openCount = 0;
    let fullCount = 0;
    let approvalCount = 0;
    let prereqBlockedCount = 0;
    let conflictCount = 0;
    for (const section of filteredSections) {
      const remainingSeats = getRemainingSeats(section);
      const hasConflict =
        !cartSectionIds.has(section.id) &&
        timeOverlap(section.meetingTimes ?? [], cartMeetingTimes);
      const prereqBlocked = getPrerequisiteCodes(section).some((code) => !passedCourseCodeSet.has(code));

      if (section.capacity !== 0 && remainingSeats <= 0) fullCount += 1;
      else openCount += 1;
      if (section.requireApproval) approvalCount += 1;
      if (prereqBlocked) prereqBlockedCount += 1;
      if (hasConflict) conflictCount += 1;
    }
    return { openCount, fullCount, approvalCount, prereqBlockedCount, conflictCount };
  }, [filteredSections, cartSectionIds, cartMeetingTimes, passedCourseCodeSet]);
  const isFilteredView = filteredSections.length !== sections.length;
  const completedCourseIds = useMemo(() => new Set(passedCourseCodes), [passedCourseCodes]);
  const compareSections = useMemo(
    () => sections.filter((section) => compareIds.includes(section.id)),
    [compareIds, sections]
  );

  const toggleCompare = (sectionId: string) => {
    setCompareIds((current) => {
      if (current.includes(sectionId)) {
        return current.filter((id) => id !== sectionId);
      }
      if (current.length >= 3) {
        toast("最多对比 3 门课", "error");
        return current;
      }
      return [...current, sectionId];
    });
  };

  const jumpToSection = (sectionId: string) => {
    const target = document.getElementById(`section-${sectionId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const addToCart = async (section: Section) => {
    if (!termId) return;
    try {
      setNotice("");
      setError("");
      setAddingSectionId(section.id);
      await apiFetch("/registration/cart", {
        method: "POST",
        body: JSON.stringify({ termId, sectionId: section.id })
      });
      const successMessage = getRemainingSeats(section) <= 0
        ? `${section.course.code} §${section.sectionCode} 已加入购物车，提交时会按候补流程处理。`
        : `${section.course.code} §${section.sectionCode} added to cart.`;
      setNotice(successMessage);
      if (getRemainingSeats(section) <= 0) {
        toast.info("该教学班当前已满，提交购物车后将按候补处理。");
      }
      await Promise.all([loadCart(termId), loadSections(termId), loadEnrollments(termId)]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "添加购物车失败";
      setError(message);
      if (/credit limit exceeded/i.test(message)) {
        const maxCredits = activeTerm?.maxCredits ?? 18;
        toast.error(`学分上限已达，本学期最多可修 ${maxCredits} 学分`);
      } else {
        toast.error(message);
      }
    } finally {
      setAddingSectionId("");
    }
  };

  const removeFromCart = async (section: Section) => {
    const cartItem = cartItems.find((ci) => ci.section.id === section.id);
    if (!cartItem || !termId) return;
    try {
      setNotice("");
      setError("");
      setRemovingSectionId(section.id);
      await apiFetch(`/registration/cart/${cartItem.id}`, { method: "DELETE" });
      setNotice(`${section.course.code} §${section.sectionCode} removed from cart.`);
      await Promise.all([loadCart(termId), loadSections(termId), loadEnrollments(termId)]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "从购物车移除失败";
      setError(message);
      toast.error(message);
    } finally {
      setRemovingSectionId("");
    }
  };

  return (
    <div className="campus-page space-y-5">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">学业规划</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-[2.65rem]">课程目录</h1>
            <p className="text-base text-slate-600">
              Plan registration with clear seat, prerequisite, and schedule signals before submitting your cart.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {activeTerm ? <span className="campus-chip chip-blue">{activeTerm.name}</span> : null}
              {activeTerm ? <span className="campus-chip chip-purple">Max {activeTerm.maxCredits} credits</span> : null}
              <span className="campus-chip chip-emerald">{sections.length} sections</span>
              {cartItems.length > 0 && (
                <span className="campus-chip chip-blue">In cart {cartItems.length}</span>
              )}
              {catalogStats.conflictCount > 0 ? (
                <span className="campus-chip chip-red">
                  Conflicts {catalogStats.conflictCount}
                </span>
              ) : null}
              {isFilteredView ? (
                <span className="campus-chip chip-amber">
                  Visible {filteredSections.length}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
            <Link
              href={`/student/cart${termId ? `?termId=${termId}` : ""}`}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:bg-slate-50 sm:w-auto"
            >
              View cart {cartItems.length > 0 ? `(${cartItems.length})` : ""}
            </Link>
            <p className="text-xs text-slate-500">提交前请先运行预检。</p>
          </div>
        </div>
      </section>

      <RegistrationStepper current="catalog" termId={termId} />

      {/* Filters */}
      <section className="campus-toolbar">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">学期</span>
            <select
              className="campus-select"
              value={termId}
              onChange={(e) => void onTermChange(e.target.value)}
              disabled={terms.length === 0}
            >
              {terms.length === 0 ? <option value="">暂无活跃学期</option> : null}
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">院系</span>
            <select
              className="campus-select"
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
            >
              <option value="ALL">全部院系</option>
              {deptOptions.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">搜索</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                className="campus-input pl-9"
                placeholder="课程代码、名称、教师…  [/]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">排序</span>
            <select
              className="campus-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="RELEVANCE">相关度</option>
              <option value="CREDITS_ASC">学分升序</option>
              <option value="CREDITS_DESC">学分降序</option>
              <option value="SEATS_ASC">余量升序</option>
              <option value="RATING_DESC">评分降序</option>
            </select>
          </label>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">授课方式</p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "ALL", label: "全部" },
                { value: "ONLINE", label: "线上" },
                { value: "ON_CAMPUS", label: "线下" },
                { value: "HYBRID", label: "混合" }
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilterModality(option.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    filterModality === option.value
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">学分</p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "ALL", label: "全部" },
                { value: "1", label: "1学分" },
                { value: "2", label: "2学分" },
                { value: "3", label: "3学分" },
                { value: "4", label: "4学分+" }
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilterCredits(option.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                    filterCredits === option.value
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">星期</p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 1, label: "一" },
                { value: 2, label: "二" },
                { value: 3, label: "三" },
                { value: 4, label: "四" },
                { value: 5, label: "五" },
                { value: 6, label: "六" }
              ].map((option) => (
                <label
                  key={option.value}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                    filters.days.includes(option.value)
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-blue-600"
                    checked={filters.days.includes(option.value)}
                    onChange={() =>
                      setFilterDays(
                        filters.days.includes(option.value)
                          ? filters.days.filter((day) => day !== option.value)
                          : [...filters.days, option.value]
                      )
                    }
                  />
                  星期{option.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="size-4 accent-slate-900"
              checked={availableOnly}
              onChange={(event) => setFilterAvailable(event.target.checked)}
            />
            仅显示有余量
          </label>
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="size-4 accent-slate-900"
              checked={filterPrereqReady}
              onChange={(event) => setFilterPrereqReady(event.target.checked)}
            />
            仅显示先修课已满足的班级
          </label>
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="size-4 accent-slate-900"
              checked={filterApprovalOnly}
              onChange={(event) => setFilterApprovalOnly(event.target.checked)}
            />
            Only approval-required sections
          </label>
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="size-4 accent-slate-900"
              checked={filterNoConflict}
              onChange={(event) => setFilterNoConflict(event.target.checked)}
            />
            Hide sections conflicting with cart
          </label>
        </div>

        {/* Day filter */}
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">上课日筛选</p>
          <div className="flex flex-wrap gap-1.5">
            {[{d:1,label:"周一"},{d:2,label:"周二"},{d:3,label:"周三"},{d:4,label:"周四"},{d:5,label:"周五"},{d:6,label:"周六"}].map(({ d, label }) => {
              const active = filters.days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFilterDays(active ? filters.days.filter(x => x !== d) : [...filters.days, d])}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${active ? "border-blue-500 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {label}
                </button>
              );
            })}
            {filters.days.length > 0 && (
              <button type="button" onClick={() => setFilterDays([])} className="text-xs text-slate-400 underline hover:text-slate-600">
                clear
              </button>
            )}
          </div>
        </div>

        {activeFilterLabels.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeFilterLabels.map((label) => (
              <span
                key={label}
                className="inline-flex items-center rounded-lg border border-slate-300 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700"
              >
                {label}
              </span>
            ))}
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Clear all
            </button>
          </div>
        ) : null}
      </section>

      {/* Registration window banner */}
      <RegistrationWindowBanner term={activeTerm} student={studentProfile} />

      {/* Notices */}
      <div className="space-y-3" aria-live="polite">
        {notice ? (
          <Alert
            type="success"
            message={notice}
            action={
              <Link className="font-medium underline underline-offset-2" href={`/student/cart?termId=${termId}`}>
                Open cart
              </Link>
            }
          />
        ) : null}
        {error ? <Alert type="error" message={error} /> : null}
        {terms.length === 0 ? (
          <Alert
            type="warning"
            message="暂无活跃学期，请联系教务处发布学期。"
          />
        ) : null}
        {!termId ? <Alert type="info" message="请先选择学期以查看可选教学班。" /> : null}
      </div>

      {/* Recently Viewed strip */}
      {recentlyViewed.length > 0 ? (
        <section className="campus-card p-4" aria-label="最近浏览的教学班">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">最近查看</p>
            <button
              type="button"
              onClick={() => {
                setRecentlyViewed([]);
                if (typeof window !== "undefined") {
                  window.sessionStorage.removeItem("recently_viewed");
                  window.sessionStorage.removeItem("sis-recently-viewed");
                }
              }}
              className="text-xs text-slate-400 underline hover:text-slate-600"
            >
              清除
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recentlyViewed.map(item => (
              <button
                key={item.sectionId}
                type="button"
                onClick={() => jumpToSection(item.sectionId)}
                className="flex-shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <span className="font-semibold text-slate-900">{item.code}</span>
                <span className="ml-1 text-slate-500 max-w-[120px] inline-block truncate align-middle">{item.title}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Results count */}
      {!loading && termId ? (
        <p className="text-sm text-slate-600" role="status" aria-live="polite">
          {filteredSections.length} section{filteredSections.length !== 1 ? "s" : ""} found
          {sections.length !== filteredSections.length ? ` (${sections.length} total)` : ""}
          {filteredSections.length > PAGE_SIZE ? ` · Page ${safePage} of ${totalPages}` : ""}
        </p>
      ) : null}

      {!loading && termId ? (
        <section className="campus-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-800">选课概览</h2>
            <p className="text-sm text-slate-600">需审批的班级将以"待审批"状态提交；已满班级可加入候补名单。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatChip label="可选" value={catalogStats.openCount} tone="emerald" />
            <StatChip label="已满/候补" value={catalogStats.fullCount} tone="red" />
            <StatChip label="需审批" value={catalogStats.approvalCount} tone="blue" />
            <StatChip label="先修不足" value={catalogStats.prereqBlockedCount} tone="red" />
            <StatChip label="购物车冲突" value={catalogStats.conflictCount} tone="amber" />
          </div>
        </section>
      ) : null}

      {/* Section cards */}
      <section className="space-y-4" aria-busy={loading}>
        {loading
          ? [1, 2, 3].map((i) => (
              <div key={i} className="campus-card p-4">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 w-32 rounded bg-slate-200" />
                  <div className="h-4 w-56 rounded bg-slate-100" />
                  <div className="flex gap-2">
                    <div className="h-6 w-20 rounded-full bg-slate-100" />
                    <div className="h-6 w-20 rounded-full bg-slate-100" />
                  </div>
                </div>
              </div>
            ))
          : null}

        {!loading && termId && sections.length === 0 ? (
          <div className="campus-empty">
            <BookOpen className="campus-empty-icon" />
            <p className="campus-empty-title">暂无可选教学班</p>
            <p className="campus-empty-desc">当前学期还没有开放课程，请稍后再来查看。</p>
          </div>
        ) : !loading && filteredSections.length === 0 && termId ? (
          <div className="campus-empty">
            <Search className="campus-empty-icon" />
            <p className="campus-empty-title">没有符合筛选条件的课程</p>
            <p className="campus-empty-desc">试着放宽搜索词、授课方式或学分筛选条件。</p>
          </div>
        ) : null}

        {loading ? <SkeletonTable rows={8} cols={4} /> : null}
        {!loading ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {pagedSections.map((section) => {
            const sectionMeetingTimes = section.meetingTimes ?? [];
            const enrolledCount = getEnrolledCount(section);
            const waitlistCount = getWaitlistedCount(section);
            const isUnlimited = section.capacity === 0;
            const availableSeats = getRemainingSeats(section);
            const isFull = !isUnlimited && availableSeats <= 0;
            const myStatus = section.myStatus ?? "NONE";
            const inCart = myStatus === "IN_CART" || cartSectionIds.has(section.id);
            const cartConflict = !inCart && timeOverlap(
              sectionMeetingTimes,
              cartMeetingTimes
            );
            const prereqs = getPrerequisiteCodes(section);
            const missingPrereqs = prereqs.filter((code) => !passedCourseCodeSet.has(code));
            const prereqBlocked = missingPrereqs.length > 0;
            const alreadyCompleted = completedCourseIds.has(section.course.code);
            const hasCapacityData =
              Number.isFinite(enrolledCount) && Number.isFinite(section.capacity) && section.capacity > 0;
            // Whether this student is already enrolled in this exact section or another section of the same course
            const alreadyEnrolledHere   = myStatus === "ENROLLED" || enrolledSectionIdSet.has(section.id);
            const alreadyEnrolledCourse = !alreadyEnrolledHere && enrolledCourseCodeSet.has(section.course.code);
            const seatTone = isUnlimited ? null : seatToneText(availableSeats);

            return (
              <article
                id={`section-${section.id}`}
                key={section.id}
                role="article"
                aria-label={`${section.course.code} ${section.course.title}`}
                onClick={() => trackView(section)}
                className={`relative campus-card overflow-hidden p-0 transition hover:-translate-y-[1px] ${
                  cartConflict ? "border-amber-300" : compareIds.includes(section.id) ? "border-blue-400 ring-2 ring-blue-200" : "border-slate-200"
                }`}
              >
                {/* Compare checkbox */}
                <label className="absolute top-3 right-3 z-10 flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-xs text-slate-600 shadow-sm hover:bg-blue-50">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-blue-600"
                    checked={compareIds.includes(section.id)}
                    onChange={() => toggleCompare(section.id)}
                  />
                  对比
                </label>
                <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="space-y-4 p-4 md:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold tracking-wide text-slate-600">
                          <Highlight text={section.course.code} query={debouncedSearch.trim()} />
                        </p>
                        <h3 className="font-heading text-2xl font-semibold text-slate-900">
                          <Highlight text={section.course.title} query={debouncedSearch.trim()} />
                        </h3>
                      </div>
                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => toggleSavedCourse(section)}
                          className={`inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-xs font-semibold transition ${
                            savedCourseIds.has(section.course.id)
                              ? "border-amber-300 bg-amber-50 text-amber-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                          }`}
                        >
                          <Star className="size-3.5" fill={savedCourseIds.has(section.course.id) ? "currentColor" : "none"} />
                          收藏
                        </button>
                        <Badge>§{section.sectionCode}</Badge>
                        <Badge color="blue">{section.credits} cr</Badge>
                        {section.course.weeklyHours ? (
                          <Badge color="amber">⏱ {section.course.weeklyHours}h/wk</Badge>
                        ) : null}
                        <Badge modality={section.modality}>{section.modality === "ON_CAMPUS" ? "线下" : section.modality === "ONLINE" ? "线上" : section.modality === "HYBRID" ? "混合" : section.modality}</Badge>
                        {alreadyCompleted ? <Badge color="slate">已修</Badge> : null}
                        {section.requireApproval ? <Badge color="blue">需审批</Badge> : null}
                      </div>
                    </div>

                    {section.course.description ? (
                      <p className="line-clamp-2 text-[15px] text-slate-600">{section.course.description}</p>
                    ) : null}

                    {(() => {
                      const stats = sectionStats(section);
                      if (!stats) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                          {stats.avgRating !== null ? (
                            <span className="flex items-center gap-1 text-xs text-slate-600">
                              <span className="font-bold text-indigo-600">{stats.avgRating.toFixed(1)}</span>
                              <span className="text-amber-400">★</span>
                              <span className="text-slate-400">({stats.count})</span>
                            </span>
                          ) : null}
                          {stats.avgDifficulty !== null ? (
                            <span className="flex items-center gap-1 text-xs text-slate-600">
                              <span className="font-semibold text-rose-500">{stats.avgDifficulty.toFixed(1)}</span>
                              <span className="text-slate-400">difficulty</span>
                            </span>
                          ) : null}
                          {stats.avgWorkload !== null ? (
                            <span className="flex items-center gap-1 text-xs text-slate-600">
                              <span className="font-semibold text-amber-600">{stats.avgWorkload.toFixed(1)}</span>
                              <span className="text-slate-400">workload</span>
                            </span>
                          ) : null}
                          {stats.recommendPct !== null ? (
                            <span className={`text-xs font-semibold ${stats.recommendPct >= 70 ? "text-emerald-600" : stats.recommendPct >= 40 ? "text-amber-600" : "text-red-500"}`}>
                              {stats.recommendPct}% recommend
                            </span>
                          ) : null}
                        </div>
                      );
                    })()}

                    <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">教师</dt>
                        <dd className="mt-1 font-medium text-slate-800">{section.instructorName}</dd>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">上课地点</dt>
                        <dd className="mt-1 font-medium text-slate-800">{section.location ?? "TBA"}</dd>
                      </div>
                    </dl>

                    <div className="flex flex-wrap gap-2">
                      {sectionMeetingTimes.length > 0
                        ? sectionMeetingTimes.map((mt, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700"
                            >
                              {meetingChip(mt)}
                            </span>
                          ))
                        : <span className="text-sm text-slate-400">无固定上课时间（异步）</span>}
                    </div>

                    {prereqs.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">先修课要求</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {prereqs.map((prereqCode, index) => (
                            <span
                              key={`${prereqCode}-${index}`}
                              className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                            >
                              {prereqCode}
                            </span>
                          ))}
                          {prereqBlocked ? (
                            <span className="ml-1 text-xs font-medium text-red-700">
                              Missing: {missingPrereqs.join(", ")}
                            </span>
                          ) : (
                            <span className="ml-1 text-xs font-medium text-emerald-700">Met</span>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {cartConflict ? (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                        Time conflict with a section already in your cart.
                      </p>
                    ) : null}

                    {section.gradeDistribution && section.gradeDistribution.total > 0 ? (
                      <div className="border-t border-slate-100 px-0 pt-1">
                        <p className="mb-1 text-xs text-slate-400">历史成绩分布</p>
                        <GradeDistBar dist={section.gradeDistribution} />
                      </div>
                    ) : null}

                    <CoursePairings courseId={section.course.id} />
                    <SectionReviews sectionId={section.id} />

                    {alreadyCompleted ? (
                      <div className="border-t border-slate-100 pt-3">
                        <MultiDimRating sectionId={section.id} />
                      </div>
                    ) : null}
                  </div>

                    <aside className="flex w-full flex-col justify-between gap-4 border-t border-slate-200 bg-[linear-gradient(180deg,hsl(221_40%_98%)_0%,white_100%)] p-4 lg:border-l lg:border-t-0">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">名额状态</p>
                      <p className={`mt-1 text-lg font-semibold ${isUnlimited ? "text-emerald-700" : seatTone?.className ?? "text-slate-700"}`}>
                        {isUnlimited ? "不限人数" : seatTone?.text}
                      </p>
                      <p className="text-sm text-slate-600">
                        已选 {enrolledCount}/{isUnlimited ? "∞" : section.capacity}
                        {waitlistCount > 0 ? ` · 候补 ${waitlistCount}` : ""}
                      </p>
                      {hasCapacityData ? (
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-all ${
                              enrolledCount >= section.capacity
                                ? "bg-red-500"
                                : enrolledCount / section.capacity >= 0.9
                                  ? "bg-red-400"
                                  : "bg-[linear-gradient(90deg,hsl(221_83%_43%)_0%,hsl(262_80%_58%)_100%)]"
                            }`}
                            style={{ width: `${Math.min(100, Math.round((enrolledCount / section.capacity) * 100))}%` }}
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-2">
                      {alreadyCompleted ? (
                        <span className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-4 text-sm font-semibold text-slate-600 opacity-80">
                          已修课
                        </span>
                      ) : alreadyEnrolledHere ? (
                        <span className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-100 px-4 text-sm font-semibold text-emerald-800">
                          已选
                        </span>
                      ) : myStatus === "WAITLISTED" ? (
                        <span className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-800">
                          等待中{section.myWaitlistPosition ? ` (#${section.myWaitlistPosition})` : ""}
                        </span>
                      ) : alreadyEnrolledCourse ? (
                        <span className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-800">
                          已选同课程其他班级
                        </span>
                      ) : inCart ? (
                        <Link
                          href={`/student/cart${termId ? `?termId=${termId}` : ""}`}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 text-sm font-semibold text-blue-700 no-underline transition hover:bg-blue-100"
                        >
                          已在购物车
                        </Link>
                      ) : prereqBlocked ? (
                        <span
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700"
                          title={`Missing prerequisite(s): ${missingPrereqs.join(", ")}`}
                        >
                          Missing prereq
                        </span>
                      ) : !isRegistrationOpen ? (
                        <span className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-slate-200/70 px-4 text-sm font-semibold text-slate-500">
                          Registration closed
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void addToCart(section)}
                          disabled={addingSectionId === section.id || alreadyCompleted}
                          aria-label={`加选 ${section.course.title}`}
                          aria-disabled={addingSectionId === section.id || alreadyCompleted}
                          className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                            cartConflict
                              ? "border-amber-300 bg-white text-amber-700 hover:bg-amber-600 hover:text-white"
                              : isFull
                                ? "border-slate-700 bg-white text-slate-700 hover:bg-slate-800 hover:text-white"
                                : "border-[hsl(221_83%_43%)] bg-white text-[hsl(221_83%_43%)] hover:bg-[hsl(221_83%_43%)] hover:text-white"
                          }`}
                        >
                          {addingSectionId === section.id ? (
                            <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          ) : isFull ? (
                            "加入购物车（候补）"
                          ) : cartConflict ? (
                            "仍加入购物车"
                          ) : (
                            "加入购物车"
                          )}
                        </button>
                      )}
                      {cartConflict && !inCart && !alreadyEnrolledHere ? (
                        <p className="text-sm text-amber-700">时间冲突将在提交时重新检测。</p>
                      ) : null}
                      {isFull && !inCart && !alreadyEnrolledHere && !alreadyCompleted && isRegistrationOpen ? (
                        <p className="text-sm text-slate-500">满班课程会先加入购物车，提交后按候补顺序处理。</p>
                      ) : null}
                      {isFull && !inCart && !alreadyEnrolledHere && !alreadyCompleted && isRegistrationOpen ? (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              if (watches.has(section.id)) {
                                await apiFetch(`/registration/watch/${section.id}`, { method: "DELETE" });
                                setWatches((prev) => {
                                  const next = new Set(prev);
                                  next.delete(section.id);
                                  return next;
                                });
                                toast.info("已取消空位通知");
                              } else {
                                await apiFetch(`/registration/watch/${section.id}`, { method: "POST" });
                                setWatches((prev) => new Set([...prev, section.id]));
                                toast.success("有空位时将通知您");
                              }
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "设置空位通知失败");
                            }
                          }}
                          className={`campus-chip h-9 cursor-pointer justify-center transition ${
                            watches.has(section.id)
                              ? "border-blue-300 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {watches.has(section.id) ? "🔔 已订阅空位" : "🔔 空位通知我"}
                        </button>
                      ) : null}
                    </div>
                  </aside>
                </div>
              </article>
            );
            })}
          </div>
        ) : null}
      </section>

      {!loading && filteredSections.length > 0 ? (
        <Suspense fallback={<div className="campus-card h-32 animate-pulse" />}>
          <RecommendedCourses />
        </Suspense>
      ) : null}

      {/* Pagination */}
      {!loading && filteredSections.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm text-slate-700">
          <p className="text-slate-500">
            Showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, filteredSections.length)} of {filteredSections.length} sections
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="inline-flex h-8 min-w-[4rem] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Prev
            </button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (safePage <= 4) {
                pageNum = i + 1;
              } else if (safePage >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = safePage - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setPage(pageNum)}
                  className={`inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border px-2.5 font-medium transition ${
                    pageNum === safePage
                      ? "border-primary bg-primary text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="inline-flex h-8 min-w-[4rem] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      ) : null}

      {/* Compare bar */}
      {compareIds.length >= 1 && (
        <div className="fixed bottom-16 md:bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white shadow-lg dark:bg-gray-900 dark:border-gray-700">
          <div className="campus-page flex items-center gap-3 py-3">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              对比 ({compareIds.length}/3):
            </span>
            <div className="flex flex-1 flex-wrap gap-2">
              {compareSections.map((section) => {
                return (
                  <span key={section.id} className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                    {section.course.code}
                    <button type="button" onClick={() => setCompareIds(prev => prev.filter(x => x !== section.id))} className="ml-1 text-blue-500 hover:text-red-600">×</button>
                  </span>
                );
              })}
            </div>
            <button
              type="button"
              disabled={compareIds.length < 2}
              onClick={() => setCompareOpen(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-40"
            >
              对比
            </button>
            <button type="button" onClick={() => setCompareIds([])} className="text-sm text-slate-500 underline hover:text-slate-700">
              清除
            </button>
          </div>
        </div>
      )}

      {/* Compare modal */}
      {compareOpen && compareIds.length >= 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCompareOpen(false)}>
          <div className="max-h-[80vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white shadow-2xl dark:bg-gray-900" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-gray-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">课程对比</h2>
              <button type="button" onClick={() => setCompareOpen(false)} className="text-slate-400 hover:text-slate-600 text-2xl">×</button>
            </div>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-gray-800">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase w-32">属性</th>
                    {compareSections.map((section) => {
                      return <th key={section.id} className="px-4 py-3 text-left font-semibold text-slate-800 dark:text-white">{section.course.code}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "课程名", fn: (s: Section) => s.course.title },
                    { label: "院系", fn: (s: Section) => s.course.code.replace(/\d+.*/, "") },
                    { label: "学分", fn: (s: Section) => `${s.credits} cr` },
                    { label: "授课方式", fn: (s: Section) => s.modality === "ON_CAMPUS" ? "线下" : s.modality === "ONLINE" ? "线上" : s.modality === "HYBRID" ? "混合" : s.modality },
                    { label: "教师", fn: (s: Section) => s.instructorName },
                    { label: "地点", fn: (s: Section) => s.location ?? "TBA" },
                    { label: "容量", fn: (s: Section) => `${getEnrolledCount(s)}/${s.capacity}` },
                    { label: "上课时间", fn: (s: Section) => s.meetingTimes.map(mt => meetingChip(mt)).join("; ") || "异步" },
                    { label: "平均评分", fn: (s: Section) => averageRating(s)?.toFixed(1) ? `${averageRating(s)?.toFixed(1)} ★` : "—" },
                    { label: "难度", fn: (s: Section) => { const st = sectionStats(s); const d = st?.avgDifficulty; return d != null ? `${d.toFixed(1)}/5` : "—"; } },
                    { label: "工作量", fn: (s: Section) => { const st = sectionStats(s); const w = st?.avgWorkload; return w != null ? `${w.toFixed(1)}/5` : "—"; } },
                    { label: "推荐率", fn: (s: Section) => { const st = sectionStats(s); const r = st?.recommendPct; return r != null ? `${r}%` : "—"; } },
                    { label: "每周学时", fn: (s: Section) => s.course.weeklyHours ? `${s.course.weeklyHours}h/wk` : "—" },
                    { label: "先修课", fn: (s: Section) => getPrerequisiteCodes(s).join(", ") || "无" },
                  ].map(({ label, fn }) => (
                    <tr key={label} className="border-t border-slate-100 dark:border-gray-700 even:bg-slate-50/50 dark:even:bg-gray-800/50">
                      <td className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{label}</td>
                      {compareSections.map((section) => {
                        return <td key={section.id} className="px-4 py-3 text-slate-800 dark:text-slate-200">{fn(section)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Badge({
  children,
  modality,
  color
}: {
  children: ReactNode;
  modality?: string;
  color?: "blue" | "slate" | "amber";
}) {
  let cls = "campus-chip";
  if (color === "blue") cls = "campus-chip chip-blue";
  else if (color === "slate") cls = "campus-chip";
  else if (color === "amber") cls = "campus-chip chip-amber";
  else if (modality === "ONLINE") cls = "campus-chip chip-emerald";
  else if (modality === "HYBRID") cls = "campus-chip chip-purple";

  return (
    <span className={`${cls} text-sm`}>
      {children}
    </span>
  );
}

function StatChip({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "emerald" | "red" | "blue" | "amber";
}) {
  const cls =
    tone === "emerald"
      ? "campus-chip chip-emerald"
      : tone === "red"
        ? "campus-chip chip-red"
        : tone === "blue"
          ? "campus-chip chip-blue"
          : "campus-chip chip-amber";

  return (
    <span className={`inline-flex items-center gap-2 ${cls} text-sm`}>
      <span>{label}</span>
      <span className="rounded-md bg-white/90 px-2 py-0.5 font-semibold">{value}</span>
    </span>
  );
}
