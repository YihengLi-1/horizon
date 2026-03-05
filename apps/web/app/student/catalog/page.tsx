"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { RegistrationStepper } from "@/components/registration-stepper";
import { apiFetch } from "@/lib/api";

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

type Section = {
  id: string;
  sectionCode: string;
  credits: number;
  modality: string;
  capacity: number;
  instructorName: string;
  location: string | null;
  requireApproval: boolean;
  meetingTimes: MeetingTime[];
  enrollments: Array<{ status: string }>;
  course: {
    code: string;
    title: string;
    description: string | null;
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

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

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

function getPrerequisiteCodes(section: Section): string[] {
  return (section.course.prerequisiteLinks ?? [])
    .map((link) => link.prerequisiteCourse?.code)
    .filter((code): code is string => Boolean(code));
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

function RegistrationWindowBanner({ term }: { term: Term | null }) {
  if (!term) return null;

  const now = Date.now();
  const open = new Date(term.registrationOpenAt).getTime();
  const close = new Date(term.registrationCloseAt).getTime();

  if (now < open) {
    return (
      <Alert
        type="info"
        message={`Registration opens on ${new Date(term.registrationOpenAt).toLocaleDateString()} at ${new Date(term.registrationOpenAt).toLocaleTimeString()}.`}
      />
    );
  }
  if (now > close) {
    return (
      <Alert
        type="warning"
        message={`Registration window is closed (closed ${new Date(term.registrationCloseAt).toLocaleDateString()}). To make changes, contact your academic advisor.`}
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

export default function StudentCatalogPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [filterModality, setFilterModality] = useState("ALL");
  const [filterCredits, setFilterCredits] = useState("ALL");
  const [filterAvailable, setFilterAvailable] = useState(false);
  const [filterPrereqReady, setFilterPrereqReady] = useState(false);
  const [filterApprovalOnly, setFilterApprovalOnly] = useState(false);
  const [filterNoConflict, setFilterNoConflict] = useState(false);
  const [sortBy, setSortBy] = useState("RELEVANCE");
  const [termEnrollments, setTermEnrollments] = useState<StudentEnrollment[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [addingSectionId, setAddingSectionId] = useState("");
  const [removingSectionId, setRemovingSectionId] = useState("");
  const [passedCourseCodes, setPassedCourseCodes] = useState<string[]>([]);
  const [hydratedFilters, setHydratedFilters] = useState(false);
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

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
      setSections(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sections");
    } finally {
      setLoading(false);
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
        const [data, grades] = await Promise.all([
          apiFetch<Term[]>("/academics/terms"),
          apiFetch<GradeEnrollment[]>("/registration/grades").catch(() => [])
        ]);
        setTerms(data);
        setPassedCourseCodes(Array.from(new Set(grades.map((g) => g.section.course.code))));
        const query = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const queryTermId = query?.get("termId") ?? "";
        const querySearch = query?.get("q") ?? "";
        const queryModality = query?.get("modality") ?? "ALL";
        const queryCredits = query?.get("credits") ?? "ALL";
        const querySort = query?.get("sort") ?? "RELEVANCE";

        setSearch(querySearch);
        setFilterModality(
          ["ALL", "ON_CAMPUS", "ONLINE", "HYBRID"].includes(queryModality) ? queryModality : "ALL"
        );
        setFilterCredits(queryCredits === "ALL" ? "ALL" : queryCredits);
        setSortBy(
          ["RELEVANCE", "SEATS_DESC", "CODE_ASC", "TITLE_ASC", "CREDITS_ASC", "CREDITS_DESC"].includes(querySort)
            ? querySort
            : "RELEVANCE"
        );
        setFilterAvailable(parseBool(query?.get("available") ?? null));
        setFilterPrereqReady(parseBool(query?.get("prereqReady") ?? null));
        setFilterApprovalOnly(parseBool(query?.get("approvalOnly") ?? null));
        setFilterNoConflict(parseBool(query?.get("noConflict") ?? null));

        const validId = queryTermId && data.some((t) => t.id === queryTermId) ? queryTermId : data[0]?.id ?? "";
        setTermId(validId);
        if (validId) {
          updateUrlTerm(validId);
          await Promise.all([loadSections(validId), loadCart(validId), loadEnrollments(validId)]);
        }
        setHydratedFilters(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
        setHydratedFilters(true);
      }
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTermChange = async (nextTermId: string) => {
    setTermId(nextTermId);
    updateUrlTerm(nextTermId);
    setSearch("");
    setFilterModality("ALL");
    setFilterCredits("ALL");
    setFilterAvailable(false);
    setFilterPrereqReady(false);
    setFilterApprovalOnly(false);
    setFilterNoConflict(false);
    setSortBy("RELEVANCE");
    setNotice("");
    setError("");
    await Promise.all([loadSections(nextTermId), loadCart(nextTermId), loadEnrollments(nextTermId)]);
  };

  useEffect(() => {
    if (!hydratedFilters || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (termId) url.searchParams.set("termId", termId);
    else url.searchParams.delete("termId");

    if (search.trim()) url.searchParams.set("q", search.trim());
    else url.searchParams.delete("q");

    if (filterModality !== "ALL") url.searchParams.set("modality", filterModality);
    else url.searchParams.delete("modality");

    if (filterCredits !== "ALL") url.searchParams.set("credits", filterCredits);
    else url.searchParams.delete("credits");

    if (sortBy !== "RELEVANCE") url.searchParams.set("sort", sortBy);
    else url.searchParams.delete("sort");

    if (filterAvailable) url.searchParams.set("available", "1");
    else url.searchParams.delete("available");

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
    search,
    filterModality,
    filterCredits,
    filterAvailable,
    filterPrereqReady,
    filterApprovalOnly,
    filterNoConflict,
    sortBy
  ]);

  const clearFilters = () => {
    setSearch("");
    setFilterModality("ALL");
    setFilterCredits("ALL");
    setFilterAvailable(false);
    setFilterPrereqReady(false);
    setFilterApprovalOnly(false);
    setFilterNoConflict(false);
    setSortBy("RELEVANCE");
    setPage(1);
  };

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (search.trim()) labels.push(`Search: ${search.trim()}`);
    if (filterModality !== "ALL") labels.push(`Modality: ${filterModality.replace("_", " ")}`);
    if (filterCredits !== "ALL") labels.push(`Credits: ${filterCredits}`);
    if (filterAvailable) labels.push("Seats available");
    if (filterPrereqReady) labels.push("Prerequisites met");
    if (filterApprovalOnly) labels.push("Approval required");
    if (filterNoConflict) labels.push("No cart conflicts");
    if (sortBy !== "RELEVANCE") labels.push(`Sort: ${sortBy.replace("_", " ").toLowerCase()}`);
    return labels;
  }, [
    search,
    filterModality,
    filterCredits,
    filterAvailable,
    filterPrereqReady,
    filterApprovalOnly,
    filterNoConflict,
    sortBy
  ]);

  const creditOptions = useMemo(() => {
    const vals = Array.from(new Set(sections.map((s) => s.credits))).sort((a, b) => a - b);
    return vals;
  }, [sections]);

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = sections.filter((s) => {
      const sectionMeetingTimes = s.meetingTimes ?? [];
      const enrolledCount = getEnrolledCount(s);
      const prereqCodes = getPrerequisiteCodes(s);
      const hasConflict =
        !cartSectionIds.has(s.id) &&
        timeOverlap(sectionMeetingTimes, cartMeetingTimes);

      if (q) {
        const target = `${s.course.code} ${s.course.title} ${s.sectionCode} ${s.instructorName}`.toLowerCase();
        if (!target.includes(q)) return false;
      }
      if (filterModality !== "ALL" && s.modality !== filterModality) return false;
      if (filterCredits !== "ALL" && s.credits !== Number(filterCredits)) return false;
      if (filterAvailable && enrolledCount >= s.capacity) return false;
      if (filterPrereqReady && prereqCodes.some((code) => !passedCourseCodeSet.has(code))) return false;
      if (filterApprovalOnly && !s.requireApproval) return false;
      if (filterNoConflict && hasConflict) return false;
      return true;
    });

    if (sortBy === "SEATS_DESC") {
      filtered.sort((a, b) => {
        const aSeats = a.capacity - getEnrolledCount(a);
        const bSeats = b.capacity - getEnrolledCount(b);
        return bSeats - aSeats;
      });
    } else if (sortBy === "CODE_ASC") {
      filtered.sort((a, b) => {
        const byCode = a.course.code.localeCompare(b.course.code);
        if (byCode !== 0) return byCode;
        return a.sectionCode.localeCompare(b.sectionCode);
      });
    } else if (sortBy === "CREDITS_ASC") {
      filtered.sort((a, b) => a.credits - b.credits);
    } else if (sortBy === "CREDITS_DESC") {
      filtered.sort((a, b) => b.credits - a.credits);
    } else if (sortBy === "TITLE_ASC") {
      filtered.sort((a, b) => a.course.title.localeCompare(b.course.title));
    }

    return filtered;
  }, [
    sections,
    search,
    filterModality,
    filterCredits,
    filterAvailable,
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
  }, [hydratedFilters, search, filterModality, filterCredits, filterAvailable, filterPrereqReady, filterApprovalOnly, filterNoConflict, sortBy]);

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
      const enrolled = getEnrolledCount(section);
      const hasConflict =
        !cartSectionIds.has(section.id) &&
        timeOverlap(section.meetingTimes ?? [], cartMeetingTimes);
      const prereqBlocked = getPrerequisiteCodes(section).some((code) => !passedCourseCodeSet.has(code));

      if (enrolled >= section.capacity) fullCount += 1;
      else openCount += 1;
      if (section.requireApproval) approvalCount += 1;
      if (prereqBlocked) prereqBlockedCount += 1;
      if (hasConflict) conflictCount += 1;
    }
    return { openCount, fullCount, approvalCount, prereqBlockedCount, conflictCount };
  }, [filteredSections, cartSectionIds, cartMeetingTimes, passedCourseCodeSet]);
  const isFilteredView = filteredSections.length !== sections.length;

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
      setNotice(`${section.course.code} §${section.sectionCode} added to cart.`);
      await loadCart(termId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add to cart");
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
      await loadCart(termId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove from cart");
    } finally {
      setRemovingSectionId("");
    }
  };

  return (
    <div className="campus-page space-y-5">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Academic Planning</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-[2.65rem]">Course Catalog</h1>
            <p className="text-base text-slate-600">
              Plan registration with clear seat, prerequisite, and schedule signals before submitting your cart.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {activeTerm ? <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{activeTerm.name}</span> : null}
              {activeTerm ? <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">Max {activeTerm.maxCredits} credits</span> : null}
              <span className="campus-chip border-emerald-300 bg-emerald-50 text-emerald-700">{sections.length} sections</span>
              {cartItems.length > 0 && (
                <span className="campus-chip border-blue-300 bg-blue-50 text-blue-700">In cart {cartItems.length}</span>
              )}
              {catalogStats.conflictCount > 0 ? (
                <span className="campus-chip border-red-300 bg-red-50 text-red-700">
                  Conflicts {catalogStats.conflictCount}
                </span>
              ) : null}
              {isFilteredView ? (
                <span className="campus-chip border-amber-300 bg-amber-50 text-amber-700">
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
            <p className="text-xs text-slate-500">Run cart precheck before final submit.</p>
          </div>
        </div>
      </section>

      <RegistrationStepper current="catalog" termId={termId} />

      {/* Filters */}
      <section className="campus-toolbar">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Term */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Term</span>
            <select
              className="campus-select"
              value={termId}
              onChange={(e) => void onTermChange(e.target.value)}
              disabled={terms.length === 0}
            >
              {terms.length === 0 ? <option value="">No active terms</option> : null}
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>

          {/* Modality */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Modality</span>
            <select
              className="campus-select"
              value={filterModality}
              onChange={(e) => setFilterModality(e.target.value)}
            >
              <option value="ALL">All modalities</option>
              <option value="ON_CAMPUS">On Campus</option>
              <option value="ONLINE">Online</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </label>

          {/* Credits */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Credits</span>
            <select
              className="campus-select"
              value={filterCredits}
              onChange={(e) => setFilterCredits(e.target.value)}
            >
              <option value="ALL">All credits</option>
              {creditOptions.map((c) => <option key={c} value={c}>{c} cr</option>)}
            </select>
          </label>

          {/* Search */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
              <input
                ref={searchRef}
                className="campus-input pl-8"
                placeholder="Code, title, instructor…  [/]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Sort</span>
            <select
              className="campus-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="RELEVANCE">Relevance</option>
              <option value="SEATS_DESC">Seats available</option>
              <option value="CODE_ASC">Course code (A-Z)</option>
              <option value="TITLE_ASC">Title (A-Z)</option>
              <option value="CREDITS_ASC">Credits (low → high)</option>
              <option value="CREDITS_DESC">Credits (high → low)</option>
            </select>
          </label>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="size-4 accent-slate-900"
              checked={filterAvailable}
              onChange={(event) => setFilterAvailable(event.target.checked)}
            />
            Only sections with available seats
          </label>
          <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="size-4 accent-slate-900"
              checked={filterPrereqReady}
              onChange={(event) => setFilterPrereqReady(event.target.checked)}
            />
            Only sections with prerequisites met
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
      <RegistrationWindowBanner term={activeTerm} />

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
            message="No active term is available yet. Please contact registrar/admin to publish a term."
          />
        ) : null}
        {!termId ? <Alert type="info" message="Select a term to view available sections." /> : null}
      </div>

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
            <h2 className="text-base font-semibold text-slate-800">Catalog Summary</h2>
            <p className="text-sm text-slate-600">Approval-required sections submit as pending approval. Full sections may enter waitlist.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatChip label="Available" value={catalogStats.openCount} tone="emerald" />
            <StatChip label="Full / Waitlist" value={catalogStats.fullCount} tone="red" />
            <StatChip label="Approval Required" value={catalogStats.approvalCount} tone="blue" />
            <StatChip label="Missing Prereq" value={catalogStats.prereqBlockedCount} tone="red" />
            <StatChip label="Cart Conflict" value={catalogStats.conflictCount} tone="amber" />
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
          <div className="py-12 text-center">
            <p className="text-3xl">📚</p>
            <p className="mt-2 text-sm font-medium text-slate-600">No sections available</p>
            <p className="mt-1 text-xs text-slate-400">
              Check back when registration opens for the current term.
            </p>
          </div>
        ) : !loading && filteredSections.length === 0 && termId ? (
          <div className="py-12 text-center">
            <p className="text-3xl">🔍</p>
            <p className="mt-2 text-sm font-medium text-slate-600">
              No sections match your filters
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Try adjusting your search, term, or modality filter.
            </p>
          </div>
        ) : null}

        {!loading &&
          pagedSections.map((section) => {
            const sectionMeetingTimes = section.meetingTimes ?? [];
            const enrolledCount = getEnrolledCount(section);
            const waitlistCount = getWaitlistedCount(section);
            const availableSeats = section.capacity - enrolledCount;
            const isFull = availableSeats <= 0;
            const inCart = cartSectionIds.has(section.id);
            const cartConflict = !inCart && timeOverlap(
              sectionMeetingTimes,
              cartMeetingTimes
            );
            const prereqs = getPrerequisiteCodes(section);
            const missingPrereqs = prereqs.filter((code) => !passedCourseCodeSet.has(code));
            const prereqBlocked = missingPrereqs.length > 0;
            const hasCapacityData =
              Number.isFinite(enrolledCount) && Number.isFinite(section.capacity) && section.capacity > 0;
            // Whether this student is already enrolled in this exact section or another section of the same course
            const alreadyEnrolledHere   = enrolledSectionIdSet.has(section.id);
            const alreadyEnrolledCourse = !alreadyEnrolledHere && enrolledCourseCodeSet.has(section.course.code);

            return (
              <article
                key={section.id}
                className={`campus-card overflow-hidden p-0 transition hover:shadow-md ${
                  cartConflict ? "border-amber-300" : "border-slate-200"
                }`}
              >
                <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="space-y-4 p-4 md:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold tracking-wide text-slate-600">{section.course.code}</p>
                        <h3 className="font-heading text-2xl font-semibold text-slate-900">{section.course.title}</h3>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Badge>§{section.sectionCode}</Badge>
                        <Badge>{section.credits} cr</Badge>
                        <Badge modality={section.modality}>{section.modality.replace("_", " ")}</Badge>
                        {section.requireApproval ? <Badge color="blue">Approval Required</Badge> : null}
                      </div>
                    </div>

                    {section.course.description ? (
                      <p className="line-clamp-2 text-[15px] text-slate-600">{section.course.description}</p>
                    ) : null}

                    <dl className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Instructor</dt>
                        <dd className="mt-1 font-medium text-slate-800">{section.instructorName}</dd>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</dt>
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
                        : <span className="text-sm text-slate-400">No scheduled meeting time (asynchronous)</span>}
                    </div>

                    {prereqs.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prerequisites</p>
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
                  </div>

                  <aside className="flex w-full flex-col justify-between gap-4 border-t border-slate-200 bg-slate-50/40 p-4 lg:border-l lg:border-t-0">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seat Status</p>
                      <p className={`mt-1 text-lg font-semibold ${isFull ? "text-red-700" : "text-emerald-700"}`}>
                        {isFull ? "Full / Waitlist" : `${availableSeats} seat${availableSeats !== 1 ? "s" : ""} open`}
                      </p>
                      <p className="text-sm text-slate-600">
                        Enrolled {enrolledCount}/{section.capacity}
                        {waitlistCount > 0 ? ` · Waitlist ${waitlistCount}` : ""}
                      </p>
                      {hasCapacityData ? (
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-all ${
                              enrolledCount >= section.capacity
                                ? "bg-red-500"
                                : enrolledCount / section.capacity >= 0.85
                                  ? "bg-amber-400"
                                  : "bg-emerald-400"
                            }`}
                            style={{ width: `${Math.min(100, Math.round((enrolledCount / section.capacity) * 100))}%` }}
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-2">
                      {alreadyEnrolledHere ? (
                        <span className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-100 px-4 text-sm font-semibold text-emerald-800">
                          ✓ Enrolled
                        </span>
                      ) : alreadyEnrolledCourse ? (
                        <span className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-800">
                          Enrolled (other section)
                        </span>
                      ) : inCart ? (
                        <button
                          type="button"
                          onClick={() => void removeFromCart(section)}
                          disabled={removingSectionId === section.id}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition hover:bg-red-50 hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {removingSectionId === section.id ? (
                            <span className="size-4 animate-spin rounded-full border-2 border-current/40 border-t-current" />
                          ) : "✓ In cart — remove"}
                        </button>
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
                          disabled={addingSectionId === section.id}
                          className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-70 ${
                            cartConflict
                              ? "bg-amber-600 hover:bg-amber-700"
                              : isFull
                                ? "bg-slate-700 hover:bg-slate-800"
                                : "bg-primary hover:bg-primary/90"
                          }`}
                        >
                          {addingSectionId === section.id ? (
                            <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          ) : isFull ? (
                            "Join waitlist"
                          ) : cartConflict ? (
                            "Add anyway"
                          ) : (
                            "Add to cart"
                          )}
                        </button>
                      )}
                      {cartConflict && !inCart && !alreadyEnrolledHere ? (
                        <p className="text-sm text-amber-700">Conflict will be rechecked at submit.</p>
                      ) : null}
                    </div>
                  </aside>
                </div>
              </article>
            );
          })}
      </section>

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
  color?: "blue";
}) {
  let cls = "bg-slate-100 text-slate-700";
  if (color === "blue") cls = "bg-blue-50 text-blue-700 border border-blue-200";
  else if (modality === "ONLINE") cls = "bg-emerald-50 text-emerald-700";
  else if (modality === "HYBRID") cls = "bg-indigo-50 text-indigo-700";

  return (
    <span className={`inline-flex items-center rounded-lg px-3 py-1 text-sm font-medium ${cls}`}>
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
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "red"
        ? "border-red-200 bg-red-50 text-red-800"
        : tone === "blue"
          ? "border-blue-200 bg-blue-50 text-blue-800"
          : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium ${cls}`}>
      <span>{label}</span>
      <span className="rounded-md bg-white/90 px-2 py-0.5 font-semibold">{value}</span>
    </span>
  );
}
