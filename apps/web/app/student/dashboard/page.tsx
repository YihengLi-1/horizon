import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serverApi } from "@/lib/server-api";
import { getMeServer } from "@/lib/server-auth";

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
  return `${new Date(value).toLocaleDateString()} ${new Date(value).toLocaleTimeString()}`;
}

function issueGuidance(reasonCode: string): string {
  if (reasonCode === "PREREQUISITE_NOT_MET") return "Complete prerequisites first or request departmental override.";
  if (reasonCode === "TIME_CONFLICT") return "Adjust cart to remove overlapping meeting times.";
  if (reasonCode === "CREDIT_LIMIT_EXCEEDED") return "Reduce load or request credit overload approval.";
  if (reasonCode === "SECTION_ALREADY_STARTED") return "Contact advisor/registrar for manual enrollment options.";
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

export default async function StudentDashboardPage() {
  const [terms, me] = await Promise.all([serverApi<Term[]>("/academics/terms"), getMeServer()]);

  const term = terms[0] ?? null;

  const enrollments = term
    ? await serverApi<Enrollment[]>(`/registration/enrollments?termId=${term.id}`).catch(() => [])
    : [];
  const cartItems = term
    ? await serverApi<CartItem[]>(`/registration/cart?termId=${term.id}`).catch(() => [])
    : [];

  const precheck =
    term && cartItems.length > 0
      ? await serverApi<PrecheckResponse>("/registration/precheck", {
          method: "POST",
          body: { termId: term.id }
        }).catch(() => null)
      : null;
  const precheckIssues = precheck?.issues ?? [];

  const enrolledCredits = enrollments
    .filter((item) => item.status === "ENROLLED" || item.status === "PENDING_APPROVAL")
    .reduce((sum, item) => sum + item.section.credits, 0);

  const waitlistedCount = enrollments.filter((item) => item.status === "WAITLISTED").length;
  const pendingApproval = enrollments.filter((item) => item.status === "PENDING_APPROVAL");
  const waitlisted = enrollments.filter((item) => item.status === "WAITLISTED");
  const enrolledCount = enrollments.filter((item) => item.status === "ENROLLED").length;

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
  const creditPct = term ? Math.min(100, Math.round((enrolledCredits / term.maxCredits) * 100)) : 0;

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
        description: `Drop requests for ENROLLED/PENDING sections now require advisor or registrar support.`,
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

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Student Command Board</p>
            <h1 className="font-heading text-4xl font-bold text-white md:text-5xl">
              {me?.profile?.legalName ? `Welcome, ${me.profile.legalName}` : "Student Dashboard"}
            </h1>
            <p className="text-sm text-blue-100/90 md:text-base">
              {term ? `Priority actions and timeline for ${term.name}.` : "No active term is configured yet."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="campus-chip border-blue-200/30 bg-white/10 text-blue-50">Student ID: {me?.studentId ?? "—"}</span>
            <span className="campus-chip border-blue-200/30 bg-white/10 text-blue-50">Major: {me?.profile?.programMajor ?? "Undeclared"}</span>
            {term ? <span className="campus-chip border-blue-200/30 bg-white/10 text-blue-50">{term.name}</span> : null}
            <span className="campus-chip border-blue-200/30 bg-white/10 text-blue-50">{enrolledCredits} enrolled credits</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="campus-kpi border-slate-200 bg-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registration State</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {registrationState === "PRE_OPEN" ? "Pre-Open" : registrationState === "OPEN" ? "Open" : registrationState === "CLOSED" ? "Closed" : "N/A"}
          </p>
        </div>
        <div className="campus-kpi border-blue-200 bg-blue-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Credits Enrolled</p>
          <p className="mt-1 text-2xl font-semibold text-blue-900">{enrolledCredits}</p>
        </div>
        <div className="campus-kpi border-amber-200 bg-amber-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Waitlisted</p>
          <p className="mt-1 text-2xl font-semibold text-amber-900">{waitlistedCount}</p>
        </div>
        <div className="campus-kpi border-emerald-200 bg-emerald-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Pending Approval</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-900">{pendingApproval.length}</p>
        </div>
      </section>

      {term ? (
        <section className="campus-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">Credit Utilization</p>
            <p className="text-xs text-slate-500">
              {enrolledCredits}/{term.maxCredits} credits
            </p>
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
                <span className="rounded-full border border-current/30 bg-white/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                  {alertBadge(alert.level)}
                </span>
              </div>
              <Link
                href={alert.href}
                className="mt-2 inline-flex h-8 items-center rounded-lg border border-current/25 bg-white/50 px-3 text-xs font-semibold text-current no-underline transition hover:bg-white/70"
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
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${chipTone(item.tone)}`}>
                    {item.tone === "emerald" ? "Ready" : item.tone === "amber" ? "Attention" : "Info"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                <Link
                  href={item.href}
                  className="mt-2 inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 no-underline transition hover:bg-slate-100"
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
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registration Opens</p>
                  <p className="mt-1 text-slate-800">{fmtDateTime(term.registrationOpenAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registration Closes</p>
                  <p className="mt-1 text-slate-800">{fmtDateTime(term.registrationCloseAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Drop Deadline</p>
                  <p className="mt-1 text-slate-800">{fmtDateTime(term.dropDeadline)}</p>
                </div>
                {dropDaysLeft !== null ? (
                  <p className={`rounded-xl border px-3 py-2 text-xs font-semibold ${dropDaysLeft < 0 ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                    {dropDaysLeft < 0
                      ? `Drop deadline passed ${Math.abs(dropDaysLeft)} day(s) ago. Contact advisor/registrar for changes.`
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
          <CardTitle className="font-heading text-2xl">Registration Queue Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingApproval.length === 0 && waitlisted.length === 0 ? (
            <p className="text-sm text-slate-600">No pending approvals or waitlisted sections.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Pending Approval</p>
                <p className="mt-1 text-2xl font-semibold text-blue-900">{pendingApproval.length}</p>
                <ul className="mt-2 space-y-1 text-xs text-blue-900">
                  {pendingApproval.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      {(item.section.course?.code ?? "Course")} {(item.section.sectionCode ?? "")}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Waitlisted</p>
                <p className="mt-1 text-2xl font-semibold text-amber-900">{waitlisted.length}</p>
                <ul className="mt-2 space-y-1 text-xs text-amber-900">
                  {waitlisted.slice(0, 5).map((item) => (
                    <li key={item.id}>
                      {(item.section.course?.code ?? "Course")} {(item.section.sectionCode ?? "")}
                      {item.waitlistPosition ? ` · Position ${item.waitlistPosition}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Link
              href={term ? `/student/catalog?termId=${term.id}` : "/student/catalog"}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
            >
              Browse Catalog
            </Link>
            <Link
              href={term ? `/student/cart?termId=${term.id}` : "/student/cart"}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
            >
              Open Cart
            </Link>
            <Link
              href={term ? `/student/schedule?termId=${term.id}` : "/student/schedule"}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
            >
              View Schedule
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
