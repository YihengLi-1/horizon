import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serverApi } from "@/lib/server-api";
import { requireRole } from "@/lib/server-auth";
import PinnedAnnouncements from "./PinnedAnnouncements";
import QuickCoursesPanel from "./QuickCoursesPanel";
import RecommendedCourses from "./RecommendedCourses";

type Term = {
  id: string;
  name: string;
  maxCredits: number;
  registrationOpenAt: string;
  registrationCloseAt: string;
  dropDeadline: string;
};

type Enrollment = {
  id: string;
  status: string;
  waitlistPosition?: number | null;
  section: {
    credits: number;
    location?: string | null;
    sectionCode?: string;
    course?: {
      code?: string;
      title?: string;
    };
  };
};

type CartItem = {
  id: string;
  section: {
    id: string;
    sectionCode?: string;
    course?: {
      code?: string;
      title?: string;
    };
  };
};

type PrecheckIssue = {
  sectionId: string;
  sectionCode: string;
  courseCode: string;
  reasonCode: string;
  message: string;
};

type PrecheckResponse = {
  termId: string;
  cartCount: number;
  ok: boolean;
  preview: Array<{
    sectionId: string;
    sectionCode: string;
    courseCode: string;
    status: string;
    waitlistPosition: number | null;
  }>;
  issues: PrecheckIssue[];
};

type GradeItem = {
  id: string;
  finalGrade: string;
  section: { credits: number };
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
  expiresAt?: string | null;
};

const GRADE_POINTS: Record<string, number> = {
  "A+": 4.0, A: 4.0, "A-": 3.7,
  "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7,
  "D+": 1.3, D: 1.0, "D-": 0.7,
  F: 0.0
};

function calcGPA(items: GradeItem[]): number | null {
  let weighted = 0, credits = 0;
  for (const item of items) {
    const pts = GRADE_POINTS[item.finalGrade];
    if (pts === undefined) continue;
    weighted += pts * item.section.credits;
    credits += item.section.credits;
  }
  return credits > 0 ? weighted / credits : null;
}

function gpaTier(gpa: number): { text: string; kpi: string; label: string } {
  if (gpa >= 3.7) return { text: "text-emerald-700", kpi: "border-emerald-200 bg-emerald-50", label: "Dean's List" };
  if (gpa >= 3.0) return { text: "text-blue-700", kpi: "border-blue-200 bg-blue-50", label: "Good Standing" };
  if (gpa >= 2.0) return { text: "text-slate-700", kpi: "border-slate-200 bg-slate-50", label: "Satisfactory" };
  return { text: "text-amber-700", kpi: "border-amber-200 bg-amber-50", label: "Academic Warning" };
}

function gpaChipTone(gpa: number): string {
  if (gpa >= 3.7) return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (gpa >= 3.0) return "border-blue-300 bg-blue-50 text-blue-700";
  if (gpa >= 2.0) return "border-amber-300 bg-amber-50 text-amber-700";
  return "border-red-300 bg-red-50 text-red-700";
}

function enrollmentStatusChip(status: string): string {
  if (status === "ENROLLED") {
    return "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700";
  }
  if (status === "WAITLISTED") {
    return "inline-flex rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700";
  }
  if (status === "PENDING_APPROVAL") {
    return "inline-flex rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700";
  }
  return "inline-flex rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700";
}

type ActionItem = {
  title: string;
  description: string;
  href: string;
  cta: string;
  tone: "blue" | "emerald" | "amber";
};

type StudentAlert = {
  level: "critical" | "warning" | "info";
  title: string;
  description: string;
  href: string;
  cta: string;
};

function chipTone(tone: ActionItem["tone"]): string {
  if (tone === "emerald") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "amber") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function alertTone(level: StudentAlert["level"]): string {
  if (level === "critical") return "border-red-200 bg-red-50 text-red-900";
  if (level === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-blue-200 bg-blue-50 text-blue-900";
}

function alertBadge(level: StudentAlert["level"]): string {
  if (level === "critical") return "Critical";
  if (level === "warning") return "Warning";
  return "Info";
}

function fmtDateTime(value: string): string {
  const d   = new Date(value);
  const now = new Date();
  const daysDiff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
     new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
    86_400_000
  );
  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (daysDiff === 0)  return `Today at ${timeStr}`;
  if (daysDiff === 1)  return `Tomorrow at ${timeStr}`;
  if (daysDiff === -1) return `Yesterday at ${timeStr}`;
  return `${d.toLocaleDateString()} at ${timeStr}`;
}

function issueGuidance(reasonCode: string): string {
  if (reasonCode === "PREREQUISITE_NOT_MET") return "Complete prerequisites first or request departmental override.";
  if (reasonCode === "TIME_CONFLICT") return "Adjust cart to remove overlapping meeting times.";
  if (reasonCode === "CREDIT_LIMIT_EXCEEDED") return "Reduce load or request credit overload approval.";
  if (reasonCode === "SECTION_ALREADY_STARTED") return "Contact registrar/support for manual enrollment options.";
  if (reasonCode === "ALREADY_REGISTERED") return "Section is already active in your enrollments.";
  return "Review cart details and update registration plan.";
}

function issueTitle(reasonCode: string): string {
  if (reasonCode === "PREREQUISITE_NOT_MET") return "Missing prerequisites";
  if (reasonCode === "TIME_CONFLICT") return "Schedule conflicts detected";
  if (reasonCode === "CREDIT_LIMIT_EXCEEDED") return "Credit limit risk";
  if (reasonCode === "SECTION_ALREADY_STARTED") return "Section start-date block";
  if (reasonCode === "ALREADY_REGISTERED") return "Already registered sections";
  return "Registration issue";
}

function getNextAction(enrollments: Enrollment[], cartItems: CartItem[], term: Term | null) {
  if (!term) return null;
  const enrolled = enrollments.filter((item) => item.status === "ENROLLED");
  const waitlisted = enrollments.filter((item) => item.status === "WAITLISTED");
  const cartCount = cartItems.length;

  if (enrolled.length === 0 && cartCount === 0) {
    return {
      icon: "📚",
      title: "Browse the Catalog",
      desc: "Registration is open. Add courses to your cart.",
      href: "/student/catalog",
      cta: "Go to Catalog"
    };
  }
  if (cartCount > 0 && enrolled.length === 0) {
    return {
      icon: "🛒",
      title: "Submit Your Cart",
      desc: `You have ${cartCount} course(s) ready. Submit now to confirm enrollment.`,
      href: "/student/cart",
      cta: "Review Cart"
    };
  }
  if (waitlisted.length > 0) {
    return {
      icon: "⏳",
      title: "You're on Waitlists",
      desc: `You're waitlisted for ${waitlisted.length} course(s). Keep checking.`,
      href: "/student/schedule",
      cta: "View Status"
    };
  }
  return {
    icon: "✅",
    title: "You're All Set",
    desc: `Enrolled in ${enrolled.length} course(s). Check your schedule.`,
    href: "/student/schedule",
    cta: "View Schedule"
  };
}

export default async function StudentDashboardPage() {
  const [terms, me, grades, announcements] = await Promise.all([
    serverApi<Term[]>("/academics/terms").catch(() => [] as Term[]),
    requireRole("STUDENT"),
    serverApi<GradeItem[]>("/registration/grades").catch(() => [] as GradeItem[]),
    serverApi<Announcement[]>("/students/announcements").catch(() => [] as Announcement[])
  ]);

  const term = terms[0] ?? null;

  const enrollments = term
    ? await serverApi<Enrollment[]>(`/registration/enrollments?termId=${term.id}`).catch(() => [])
    : [];
  const cartItems = term
    ? await serverApi<CartItem[]>(`/registration/cart?termId=${term.id}`).catch(() => [])
    : [];

  const cumulativeGpa = calcGPA(grades);
  const DEGREE_CREDITS = 120;
  const completedCredits = grades.reduce((sum, g) => sum + g.section.credits, 0);
  const degreeProgress = Math.min(100, Math.round((completedCredits / DEGREE_CREDITS) * 100));

  const precheck =
    term && cartItems.length > 0
      ? await serverApi<PrecheckResponse>("/registration/precheck", {
          method: "POST",
          body: { termId: term.id }
        }).catch(() => null)
      : null;
  const precheckIssues = precheck?.issues ?? [];

  const enrolled       = enrollments.filter((item) => item.status === "ENROLLED");
  const enrolledCount  = enrolled.length;
  const enrolledCredits = enrollments
    .filter((item) => item.status === "ENROLLED" || item.status === "PENDING_APPROVAL")
    .reduce((sum, item) => sum + item.section.credits, 0);

  const waitlistedCount = enrollments.filter((item) => item.status === "WAITLISTED").length;
  const pendingApproval = enrollments.filter((item) => item.status === "PENDING_APPROVAL");
  const waitlisted      = enrollments.filter((item) => item.status === "WAITLISTED");

  const now = Date.now();
  const registrationState = term
    ? now < new Date(term.registrationOpenAt).getTime()
      ? "PRE_OPEN"
      : now > new Date(term.registrationCloseAt).getTime()
        ? "CLOSED"
        : "OPEN"
    : "NO_TERM";

  const dropDaysLeft = term ? Math.ceil((new Date(term.dropDeadline).getTime() - now) / (24 * 60 * 60 * 1000)) : null;
  const creditsRemaining = term ? Math.max(0, term.maxCredits - enrolledCredits) : 0;
  const creditPct = term && term.maxCredits > 0 ? Math.min(100, Math.round((enrolledCredits / term.maxCredits) * 100)) : 0;

  const actionItems: ActionItem[] = [];

  if (!term) {
    actionItems.push({
      title: "No active term is configured",
      description: "Registration and schedule planning are unavailable until a term is published.",
      href: "/student/profile",
      cta: "Open profile",
      tone: "amber"
    });
  } else if (registrationState === "PRE_OPEN") {
    actionItems.push({
      title: "Registration has not opened yet",
      description: `Opens on ${fmtDateTime(term.registrationOpenAt)}. Prepare your cart in advance.`,
      href: `/student/catalog?termId=${term.id}`,
      cta: "Browse catalog",
      tone: "blue"
    });
  } else if (registrationState === "OPEN") {
    actionItems.push({
      title: "Registration window is open",
      description: `You can submit registration until ${fmtDateTime(term.registrationCloseAt)}.`,
      href: `/student/cart?termId=${term.id}`,
      cta: "Open cart",
      tone: "emerald"
    });
  } else {
    actionItems.push({
      title: "Registration window is closed",
      description: "You can still review schedule and completed academic records.",
      href: term ? `/student/schedule?termId=${term.id}` : "/student/schedule",
      cta: "View schedule",
      tone: "amber"
    });
  }

  if (term && registrationState === "OPEN" && creditsRemaining > 0) {
    actionItems.push({
      title: `${creditsRemaining} credit(s) still available`,
      description: "You can continue adding sections until you reach your term max credits.",
      href: `/student/catalog?termId=${term.id}`,
      cta: "Add courses",
      tone: "blue"
    });
  }

  if (pendingApproval.length > 0) {
    actionItems.push({
      title: `${pendingApproval.length} section(s) pending approval`,
      description: "Track pending approvals in your schedule and watch for updates.",
      href: term ? `/student/schedule?termId=${term.id}` : "/student/schedule",
      cta: "Track status",
      tone: "blue"
    });
  }

  if (waitlistedCount > 0) {
    actionItems.push({
      title: `${waitlistedCount} section(s) waitlisted`,
      description: "Waitlist promotions are processed when ENROLLED seats open.",
      href: term ? `/student/schedule?termId=${term.id}` : "/student/schedule",
      cta: "View queue",
      tone: "amber"
    });
  }

  if (actionItems.length === 0) {
    actionItems.push({
      title: "Everything is in good standing",
      description: "Review your profile and schedule to keep records accurate.",
      href: "/student/profile",
      cta: "Review profile",
      tone: "emerald"
    });
  }

  const issueCountByReason = new Map<string, number>();
  for (const issue of precheckIssues) {
    issueCountByReason.set(issue.reasonCode, (issueCountByReason.get(issue.reasonCode) ?? 0) + 1);
  }

  const alerts: StudentAlert[] = [];

  if (dropDaysLeft !== null) {
    if (dropDaysLeft < 0 && enrolledCount > 0) {
      alerts.push({
        level: "critical",
        title: "Drop deadline has passed",
        description: `Drop requests for ENROLLED/PENDING sections now require registrar or support review.`,
        href: term ? `/student/schedule?termId=${term.id}` : "/student/schedule",
        cta: "Open schedule"
      });
    } else if (dropDaysLeft <= 7 && enrolledCount > 0) {
      alerts.push({
        level: "warning",
        title: "Drop deadline approaching",
        description: `${dropDaysLeft} day(s) remaining before self-drop closes for enrolled classes.`,
        href: term ? `/student/schedule?termId=${term.id}` : "/student/schedule",
        cta: "Review schedule"
      });
    }
  }

  for (const [reasonCode, count] of issueCountByReason.entries()) {
    alerts.push({
      level: reasonCode === "PREREQUISITE_NOT_MET" || reasonCode === "TIME_CONFLICT" ? "warning" : "info",
      title: `${issueTitle(reasonCode)} (${count})`,
      description: issueGuidance(reasonCode),
      href: term ? `/student/cart?termId=${term.id}` : "/student/cart",
      cta: "Resolve in cart"
    });
  }

  if (waitlistedCount > 0) {
    alerts.push({
      level: "info",
      title: "Waitlist queue active",
      description: `${waitlistedCount} section(s) are currently waitlisted. Watch for promotion updates.`,
      href: term ? `/student/schedule?termId=${term.id}` : "/student/schedule",
      cta: "Track waitlist"
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      level: "info",
      title: "No immediate registration risks",
      description: "You have no active prerequisite, conflict, or deadline alerts right now.",
      href: term ? `/student/catalog?termId=${term.id}` : "/student/catalog",
      cta: "Browse catalog"
    });
  }

  const nextAction = getNextAction(enrollments, cartItems, term);

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Student Command Board</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-[2.65rem]">
              {me?.profile?.legalName ? `Welcome, ${me.profile.legalName}` : "Student Dashboard"}
            </h1>
            <p className="text-base text-slate-600">
              {term ? `Priority actions and timeline for ${term.name}.` : "No active term is configured yet."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">Student ID: {me?.studentId ?? "—"}</span>
            <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">Major: {me?.profile?.programMajor ?? "Undeclared"}</span>
            {term ? <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{term.name}</span> : null}
            {enrolledCount > 0 ? (
              <span className="campus-chip border-emerald-300 bg-emerald-50 text-emerald-700">
                Enrolled {enrolledCount}
              </span>
            ) : null}
            {waitlistedCount > 0 ? (
              <span className="campus-chip border-amber-300 bg-amber-50 text-amber-700">
                Waitlisted {waitlistedCount}
              </span>
            ) : null}
            {cartItems.length > 0 ? (
              <span className="campus-chip border-blue-300 bg-blue-50 text-blue-700">{cartItems.length} in cart</span>
            ) : null}
            {grades.length > 0 && cumulativeGpa !== null ? (
              <span className={`campus-chip ${gpaChipTone(cumulativeGpa)}`}>
                GPA {cumulativeGpa.toFixed(2)}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* Registration state — dynamically colored */}
        {(() => {
          const { bg, border, label: lbl, text } = {
            OPEN:     { bg: "bg-emerald-50", border: "border-emerald-200", label: "Open",     text: "text-emerald-900" },
            PRE_OPEN: { bg: "bg-blue-50",    border: "border-blue-200",    label: "Pre-Open", text: "text-blue-900" },
            CLOSED:   { bg: "bg-amber-50",   border: "border-amber-200",   label: "Closed",   text: "text-amber-900" },
            NO_TERM:  { bg: "bg-slate-50",   border: "border-slate-200",   label: "N/A",      text: "text-slate-700" },
          }[registrationState];
          const lblColor = {
            OPEN: "text-emerald-600", PRE_OPEN: "text-blue-600", CLOSED: "text-amber-600", NO_TERM: "text-slate-500"
          }[registrationState];
          return (
            <div className={`campus-kpi ${border} ${bg}`}>
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${lblColor}`}>Registration</p>
              <p className={`mt-1 text-xl font-semibold ${text}`}>{lbl}</p>
            </div>
          );
        })()}

        <div className="campus-kpi border-emerald-200 bg-emerald-50/60">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Enrolled Sections</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-900">{enrolledCount}</p>
          {term?.maxCredits ? (
            <p className="text-[10px] text-emerald-600">{enrolledCredits}/{term.maxCredits} credits</p>
          ) : enrolledCredits > 0 ? (
            <p className="text-[10px] text-emerald-600">{enrolledCredits} credits</p>
          ) : null}
        </div>

        <div className="campus-kpi border-amber-200 bg-amber-50/60">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Waitlisted</p>
          <p className="mt-1 text-2xl font-semibold text-amber-900">{waitlistedCount}</p>
        </div>

        <div className="campus-kpi border-violet-200 bg-violet-50/60">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Pending Approval</p>
          <p className="mt-1 text-2xl font-semibold text-violet-900">{pendingApproval.length}</p>
        </div>

        {/* Cumulative GPA — sourced from academic history */}
        {cumulativeGpa !== null ? (() => {
          const tier = gpaTier(cumulativeGpa);
          return (
            <div className={`campus-kpi ${tier.kpi}`}>
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${tier.text}`}>Cumulative GPA</p>
              <p className={`mt-1 text-2xl font-semibold ${tier.text}`}>{cumulativeGpa.toFixed(2)}</p>
              <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold border-current/30 ${tier.text}`}>
                {tier.label}
              </span>
            </div>
          );
        })() : (
          <div className="campus-kpi border-slate-200 bg-slate-50">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cumulative GPA</p>
            <p className="mt-1 text-2xl font-semibold text-slate-400">—</p>
            <p className="text-[10px] text-slate-400">No grades yet</p>
          </div>
        )}
      </section>

      {/* Degree progress bar */}
      {completedCredits > 0 ? (
        <section className="campus-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">Degree Progress</p>
            <p className="text-sm text-slate-500">{completedCredits} / {DEGREE_CREDITS} credits completed ({degreeProgress}%)</p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all ${degreeProgress >= 100 ? "bg-emerald-500" : degreeProgress >= 75 ? "bg-indigo-500" : degreeProgress >= 50 ? "bg-blue-500" : "bg-slate-400"}`}
              style={{ width: `${degreeProgress}%` }}
            />
          </div>
        </section>
      ) : null}

      <PinnedAnnouncements announcements={announcements.slice(0, 3)} />

      {nextAction ? (
        <div className="campus-card flex items-center gap-4 p-4">
          <span className="text-3xl">{nextAction.icon}</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{nextAction.title}</p>
            <p className="mt-0.5 text-xs text-slate-500">{nextAction.desc}</p>
          </div>
          <a
            href={nextAction.href}
            className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
          >
            {nextAction.cta}
          </a>
        </div>
      ) : null}

      <Suspense fallback={<div className="campus-card h-32 animate-pulse" />}>
        <QuickCoursesPanel enrollments={enrollments ?? []} />
      </Suspense>

      <Suspense fallback={<div className="campus-card h-32 animate-pulse" />}>
        <RecommendedCourses />
      </Suspense>

      {term ? (
        <section className="campus-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">Credit Utilization</p>
            <p className="text-sm text-slate-500">{term.maxCredits > 0 ? `${enrolledCredits}/${term.maxCredits} credits` : "No credit cap configured"}</p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all ${creditPct >= 90 ? "bg-red-500" : creditPct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${creditPct}%` }}
            />
          </div>
        </section>
      ) : null}

      <Card className="campus-card">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Student Alert Center</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {alerts.map((alert) => (
            <div key={`${alert.title}-${alert.description}`} className={`rounded-xl border px-4 py-3 ${alertTone(alert.level)}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <p className="mt-1 text-sm opacity-90">{alert.description}</p>
                </div>
                <span className="rounded-full border border-current/30 bg-white/40 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
                  {alertBadge(alert.level)}
                </span>
              </div>
              <Link
                href={alert.href}
                className="mt-2 inline-flex h-8 items-center rounded-lg border border-current/25 bg-white/50 px-3 text-sm font-semibold text-current no-underline transition hover:bg-white/70"
              >
                {alert.cta}
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="campus-card">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Action Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {actionItems.map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${chipTone(item.tone)}`}>
                    {item.tone === "emerald" ? "Ready" : item.tone === "amber" ? "Attention" : "Info"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                <Link
                  href={item.href}
                  className="mt-2 inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-100"
                >
                  {item.cta}
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="campus-card">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {term ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Registration Opens</p>
                  <p className="mt-1 text-slate-800">{fmtDateTime(term.registrationOpenAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Registration Closes</p>
                  <p className="mt-1 text-slate-800">{fmtDateTime(term.registrationCloseAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Drop Deadline</p>
                  <p className="mt-1 text-slate-800">{fmtDateTime(term.dropDeadline)}</p>
                </div>
                {dropDaysLeft !== null ? (
                  <p className={`rounded-xl border px-3 py-2 text-sm font-semibold ${dropDaysLeft < 0 ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                    {dropDaysLeft < 0
                      ? `Drop deadline passed ${Math.abs(dropDaysLeft)} day(s) ago. Contact registrar/support for changes.`
                      : `${dropDaysLeft} day(s) remaining until drop deadline.`}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-slate-500">No active term available.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="campus-card">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Registration Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Currently enrolled sections */}
          {enrolled.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Enrolled ({enrolledCount})
              </p>
              <div className="overflow-hidden rounded-xl border border-emerald-200">
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {enrolled.slice(0, 6).map((item) => (
                      <tr key={item.id} className="border-b border-emerald-100 last:border-0 odd:bg-emerald-50/40 even:bg-white">
                        <td className="px-3 py-2">
                          <div className="space-y-1">
                            <span className="font-mono text-xs font-semibold text-slate-700">
                              {item.section.course?.code ?? "—"}
                            </span>
                            <span className={enrollmentStatusChip(item.status)}>
                              {item.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-600 truncate max-w-[200px]">
                          {item.section.course?.title ?? item.section.sectionCode ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500">
                          {item.section.credits} cr
                        </td>
                      </tr>
                    ))}
                    {enrolled.length > 6 ? (
                      <tr className="bg-white">
                        <td colSpan={3} className="px-3 py-1.5 text-center text-xs text-slate-400">
                          +{enrolled.length - 6} more — view full schedule
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Pending + waitlisted */}
          {pendingApproval.length === 0 && waitlisted.length === 0 && enrolled.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-2xl">📚</p>
              <p className="mt-2 text-sm font-medium text-slate-600">No enrollments yet</p>
              <p className="mt-1 text-xs text-slate-400">Browse the course catalog to get started.</p>
              <Link
                href="/student/catalog"
                className="mt-3 inline-flex h-8 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-white no-underline transition hover:bg-primary/90"
              >
                Browse Catalog →
              </Link>
            </div>
          ) : pendingApproval.length > 0 || waitlisted.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Pending Approval</p>
                <p className="mt-1 text-2xl font-semibold text-violet-900">{pendingApproval.length}</p>
                <ul className="mt-2 space-y-1 text-sm text-violet-900">
                  {pendingApproval.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      {(item.section.course?.code ?? "Course")} {(item.section.sectionCode ?? "")}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Waitlisted</p>
                <p className="mt-1 text-2xl font-semibold text-amber-900">{waitlisted.length}</p>
                <ul className="mt-2 space-y-1 text-sm text-amber-900">
                  {waitlisted.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      {(item.section.course?.code ?? "Course")} {(item.section.sectionCode ?? "")}
                      {item.waitlistPosition ? ` · #${item.waitlistPosition} in queue` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Link
              href={term ? `/student/catalog?termId=${term.id}` : "/student/catalog"}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
            >
              Browse Catalog
            </Link>
            <Link
              href={term ? `/student/cart?termId=${term.id}` : "/student/cart"}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
            >
              Open Cart
            </Link>
            <Link
              href={term ? `/student/schedule?termId=${term.id}` : "/student/schedule"}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
            >
              View Schedule
            </Link>
            <Link
              href="/student/grades"
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
            >
              View Grades
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
