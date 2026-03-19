import Link from "next/link";
import { AlertTriangle, BellRing, BookOpenCheck, CalendarClock, GraduationCap, Sparkles } from "lucide-react";
import { GRADE_POINTS } from "@sis/shared/constants";
import ProfileCompletenessCard from "@/components/profile-completeness-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serverApi } from "@/lib/server-api";
import { requireRole } from "@/lib/server-auth";
import PinnedAnnouncements from "./PinnedAnnouncements";

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

type ProfileCompleteness = {
  score: number;
  missing: string[];
  fields: Array<{
    name: string;
    label: string;
    filled: boolean;
  }>;
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
  if (gpa >= 3.7) return { text: "text-emerald-700", kpi: "border-emerald-200 bg-emerald-50", label: "表现优秀" };
  if (gpa >= 3.0) return { text: "text-blue-700", kpi: "border-blue-200 bg-blue-50", label: "状态良好" };
  if (gpa >= 2.0) return { text: "text-slate-700", kpi: "border-slate-200 bg-slate-50", label: "正常" };
  return { text: "text-amber-700", kpi: "border-amber-200 bg-amber-50", label: "需要关注" };
}

function gpaChipTone(gpa: number): string {
  if (gpa >= 3.7) return "chip-emerald";
  if (gpa >= 3.0) return "chip-blue";
  if (gpa >= 2.0) return "chip-amber";
  return "chip-red";
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
  if (tone === "emerald") return "campus-chip chip-emerald";
  if (tone === "amber") return "campus-chip chip-amber";
  return "campus-chip chip-blue";
}

function alertTone(level: StudentAlert["level"]): string {
  if (level === "critical") return "border-red-200 bg-red-50 text-red-900";
  if (level === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-blue-200 bg-blue-50 text-blue-900";
}

function alertBadge(level: StudentAlert["level"]): string {
  if (level === "critical") return "紧急";
  if (level === "warning") return "提醒";
  return "提示";
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
  if (daysDiff === 0)  return `今天 ${timeStr}`;
  if (daysDiff === 1)  return `明天 ${timeStr}`;
  if (daysDiff === -1) return `昨天 ${timeStr}`;
  return `${d.toLocaleDateString()} ${timeStr}`;
}

function issueGuidance(reasonCode: string): string {
  if (reasonCode === "PREREQUISITE_NOT_MET") return "先完成先修课，或提交先修课豁免审批。";
  if (reasonCode === "TIME_CONFLICT") return "调整购物车，先消除上课时间冲突。";
  if (reasonCode === "CREDIT_LIMIT_EXCEEDED") return "减少本学期学分，或提交超学分申请。";
  if (reasonCode === "SECTION_ALREADY_STARTED") return "课程已经开课，如需处理请联系教务。";
  if (reasonCode === "ALREADY_REGISTERED") return "该教学班已经在你的当前注册记录中。";
  return "请检查购物车并调整当前选课计划。";
}

function issueTitle(reasonCode: string): string {
  if (reasonCode === "PREREQUISITE_NOT_MET") return "先修课未满足";
  if (reasonCode === "TIME_CONFLICT") return "课表时间冲突";
  if (reasonCode === "CREDIT_LIMIT_EXCEEDED") return "学分上限风险";
  if (reasonCode === "SECTION_ALREADY_STARTED") return "课程已开课";
  if (reasonCode === "ALREADY_REGISTERED") return "重复注册";
  return "选课问题";
}

function getNextAction(enrollments: Enrollment[], cartItems: CartItem[], term: Term | null) {
  if (!term) return null;
  const enrolled = enrollments.filter((item) => item.status === "ENROLLED");
  const waitlisted = enrollments.filter((item) => item.status === "WAITLISTED");
  const cartCount = cartItems.length;

  if (enrolled.length === 0 && cartCount === 0) {
    return {
      icon: "📚",
      title: "开始选课",
      desc: "当前可以开始浏览课程并加入购物车。",
      href: "/student/catalog",
      cta: "进入课程目录"
    };
  }
  if (cartCount > 0 && enrolled.length === 0) {
    return {
      icon: "🛒",
      title: "提交购物车",
      desc: `当前有 ${cartCount} 门课程待提交，可以直接进入确认。`,
      href: "/student/cart",
      cta: "查看购物车"
    };
  }
  if (waitlisted.length > 0) {
    return {
      icon: "⏳",
      title: "正在候补中",
      desc: `你当前有 ${waitlisted.length} 门课程处于候补状态。`,
      href: "/student/schedule",
      cta: "查看状态"
    };
  }
  return {
    icon: "✅",
    title: "当前状态正常",
    desc: `已注册 ${enrolled.length} 门课程，可以直接查看课表。`,
    href: "/student/schedule",
    cta: "查看课表"
  };
}

export default async function StudentDashboardPage() {
  const [terms, me, grades, announcements, profileCompleteness] = await Promise.all([
    serverApi<Term[]>("/academics/terms").catch(() => [] as Term[]),
    requireRole("STUDENT"),
    serverApi<GradeItem[]>("/registration/grades").catch(() => [] as GradeItem[]),
    serverApi<Announcement[]>("/students/announcements").catch(() => [] as Announcement[]),
    serverApi<ProfileCompleteness>("/students/profile-completeness").catch(() => ({
      score: 0,
      missing: [],
      fields: []
    }))
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
      title: "暂未配置活跃学期",
      description: "当前还没有可用学期，暂时无法进行选课或课表规划。",
      href: "/student/profile",
      cta: "打开资料",
      tone: "amber"
    });
  } else if (registrationState === "PRE_OPEN") {
    actionItems.push({
      title: "选课尚未开放",
      description: `${fmtDateTime(term.registrationOpenAt)} 开放，建议先整理购物车。`,
      href: `/student/catalog?termId=${term.id}`,
      cta: "查看课程目录",
      tone: "blue"
    });
  } else if (registrationState === "OPEN") {
    actionItems.push({
      title: "当前正在选课",
      description: `可在 ${fmtDateTime(term.registrationCloseAt)} 前提交本学期选课。`,
      href: `/student/cart?termId=${term.id}`,
      cta: "打开购物车",
      tone: "emerald"
    });
  } else {
    actionItems.push({
      title: "选课已结束",
      description: "当前可以继续查看课表和历史成绩记录。",
      href: term ? `/student/schedule?termId=${term.id}` : "/student/schedule",
      cta: "查看课表",
      tone: "amber"
    });
  }

  if (term && registrationState === "OPEN" && creditsRemaining > 0) {
    actionItems.push({
      title: `还可添加 ${creditsRemaining} 学分`,
      description: "在达到本学期学分上限前，仍可继续加入课程。",
      href: `/student/catalog?termId=${term.id}`,
      cta: "继续选课",
      tone: "blue"
    });
  }

  if (pendingApproval.length > 0) {
    actionItems.push({
      title: `${pendingApproval.length} 门课程待审批`,
      description: "请留意课表中的审批结果和状态变化。",
      href: term ? `/student/schedule?termId=${term.id}` : "/student/schedule",
      cta: "查看状态",
      tone: "blue"
    });
  }

  if (waitlistedCount > 0) {
    actionItems.push({
      title: `${waitlistedCount} 门课程正在候补`,
      description: "有空位释放时，系统会按顺序推进候补。",
      href: term ? `/student/schedule?termId=${term.id}` : "/student/schedule",
      cta: "查看候补",
      tone: "amber"
    });
  }

  if (actionItems.length === 0) {
    actionItems.push({
      title: "当前状态正常",
      description: "可以继续查看个人资料和本学期课表。",
      href: "/student/profile",
      cta: "查看资料",
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
        title: "退课期限已过",
        description: "当前若仍需调整已选课程，需要联系教务或支持处理。",
        href: term ? `/student/schedule?termId=${term.id}` : "/student/schedule",
        cta: "打开课表"
      });
    } else if (dropDaysLeft <= 7 && enrolledCount > 0) {
      alerts.push({
        level: "warning",
        title: "退课期限临近",
        description: `距离自助退课关闭还剩 ${dropDaysLeft} 天。`,
        href: term ? `/student/schedule?termId=${term.id}` : "/student/schedule",
        cta: "检查课表"
      });
    }
  }

  for (const [reasonCode, count] of issueCountByReason.entries()) {
    alerts.push({
      level: reasonCode === "PREREQUISITE_NOT_MET" || reasonCode === "TIME_CONFLICT" ? "warning" : "info",
      title: `${issueTitle(reasonCode)} (${count})`,
      description: issueGuidance(reasonCode),
      href: term ? `/student/cart?termId=${term.id}` : "/student/cart",
      cta: "去购物车处理"
    });
  }

  if (waitlistedCount > 0) {
    alerts.push({
      level: "info",
      title: "候补队列进行中",
      description: `当前有 ${waitlistedCount} 门课程处于候补，请留意补位通知。`,
      href: term ? `/student/schedule?termId=${term.id}` : "/student/schedule",
      cta: "查看候补"
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      level: "info",
      title: "当前没有明显风险",
      description: "目前没有先修课、时间冲突或期限类提醒。",
      href: term ? `/student/catalog?termId=${term.id}` : "/student/catalog",
      cta: "查看课程目录"
    });
  }

  const nextAction = getNextAction(enrollments, cartItems, term);

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">本学期概览</p>
            <h1 className="campus-title">
              {me?.profile?.legalName ? `${me.profile.legalName}，你好` : "学生概览"}
            </h1>
            <p className="campus-subtitle">{term ? `${term.name} 的选课状态、提醒和学业进度都在这里。` : "当前还没有可用学期。"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {term ? <span className="campus-chip chip-blue">{term.name}</span> : null}
            <span className="campus-chip chip-purple">
              {me?.profile?.programMajor ?? "未申报专业"}
            </span>
            {grades.length > 0 && cumulativeGpa !== null ? (
              <span className={`campus-chip ${gpaChipTone(cumulativeGpa)}`}>GPA {cumulativeGpa.toFixed(2)}</span>
            ) : null}
            {waitlistedCount > 0 ? (
              <span className="campus-chip chip-amber">候补中 {waitlistedCount}</span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="campus-kpi-grid">
        {/* Registration state — dynamically colored */}
        {(() => {
          const { bg, border, label: lbl, text } = {
            OPEN:     { bg: "bg-emerald-50", border: "border-emerald-200", label: "开放中", text: "text-emerald-900" },
            PRE_OPEN: { bg: "bg-blue-50",    border: "border-blue-200",    label: "未开放", text: "text-blue-900" },
            CLOSED:   { bg: "bg-amber-50",   border: "border-amber-200",   label: "已关闭", text: "text-amber-900" },
            NO_TERM:  { bg: "bg-slate-50",   border: "border-slate-200",   label: "暂无",   text: "text-slate-700" },
          }[registrationState];
          const lblColor = {
            OPEN: "text-emerald-600", PRE_OPEN: "text-blue-600", CLOSED: "text-amber-600", NO_TERM: "text-slate-500"
          }[registrationState];
          return (
            <div className="campus-kpi">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`campus-kpi-label ${lblColor}`}>选课状态</p>
                  <p className={`campus-kpi-value text-[2rem] ${text}`}>{lbl}</p>
                </div>
                <span className={`inline-flex size-11 items-center justify-center rounded-2xl ${bg} ${border}`}>
                  <CalendarClock className={`size-5 ${lblColor}`} />
                </span>
              </div>
            </div>
          );
        })()}

        <div className="campus-kpi">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="campus-kpi-label text-emerald-700">当前学分</p>
              <p className="campus-kpi-value text-emerald-900">{enrolledCredits}</p>
            </div>
            <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-emerald-50">
              <BookOpenCheck className="size-5 text-emerald-700" />
            </span>
          </div>
          {term?.maxCredits ? (
            <p className="text-[10px] text-emerald-600">{enrolledCount} 门课程 · 上限 {term.maxCredits} 学分</p>
          ) : enrolledCredits > 0 ? (
            <p className="text-[10px] text-emerald-600">{enrolledCredits} 学分</p>
          ) : null}
        </div>

        <div className="campus-kpi">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="campus-kpi-label text-amber-700">候补课程</p>
              <p className="campus-kpi-value text-amber-900">{waitlistedCount}</p>
            </div>
            <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-amber-50">
              <BellRing className="size-5 text-amber-700" />
            </span>
          </div>
          {pendingApproval.length > 0 ? (
            <p className="text-[10px] text-amber-700">{pendingApproval.length} 门待审批</p>
          ) : null}
        </div>

        {/* Cumulative GPA — sourced from academic history */}
        {cumulativeGpa !== null ? (() => {
          const tier = gpaTier(cumulativeGpa);
          return (
            <div className="campus-kpi">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`campus-kpi-label ${tier.text}`}>累计 GPA</p>
                  <p className={`campus-kpi-value ${tier.text}`}>{cumulativeGpa.toFixed(2)}</p>
                </div>
                <span className={`inline-flex size-11 items-center justify-center rounded-2xl ${tier.kpi}`}>
                  <GraduationCap className={`size-5 ${tier.text}`} />
                </span>
              </div>
              <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold border-current/30 ${tier.text}`}>
                {tier.label}
              </span>
            </div>
          );
        })() : (
          <div className="campus-kpi">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="campus-kpi-label text-slate-500">累计 GPA</p>
                <p className="campus-kpi-value text-slate-400">—</p>
              </div>
              <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-slate-100">
                <Sparkles className="size-5 text-slate-400" />
              </span>
            </div>
            <p className="text-[10px] text-slate-400">暂无成绩</p>
          </div>
        )}
      </section>

      <ProfileCompletenessCard
        score={profileCompleteness.score}
        missing={profileCompleteness.missing}
        fields={profileCompleteness.fields}
      />

      {/* Degree progress bar */}
      {completedCredits > 0 ? (
        <section className="campus-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">毕业进度</p>
            <p className="text-sm text-slate-500">已完成 {completedCredits} / {DEGREE_CREDITS} 学分（{degreeProgress}%）</p>
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

      <Card className="campus-card">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">提醒与公告</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {alerts.map((alert) => (
            <div key={`${alert.title}-${alert.description}`} className={`relative overflow-hidden rounded-xl border px-4 py-3 ${alertTone(alert.level)}`}>
              <span className={`absolute inset-y-0 left-0 w-1 ${alert.level === "critical" ? "bg-red-500" : alert.level === "warning" ? "bg-amber-500" : "bg-blue-500"}`} />
              <div className="flex flex-wrap items-start justify-between gap-2 pl-2">
                <div>
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <p className="mt-1 text-xs opacity-70">{new Date().toLocaleDateString()}</p>
                  <p className="mt-1 text-sm opacity-90">{alert.description}</p>
                </div>
                <span className="rounded-full border border-current/30 bg-white/40 px-2 py-0.5 text-xs font-semibold">
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

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="campus-card">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">当前学期</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {nextAction ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{nextAction.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{nextAction.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{nextAction.desc}</p>
                    <Link
                      href={nextAction.href}
                      className="mt-2 inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-100"
                    >
                      {nextAction.cta}
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}

            {term ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">学分使用情况</p>
                  <p className="text-sm text-slate-500">
                    {term.maxCredits > 0 ? `${enrolledCredits}/${term.maxCredits} 学分` : "未设置学分上限"}
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full transition-all ${creditPct >= 90 ? "bg-red-500" : creditPct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${creditPct}%` }}
                  />
                </div>
              </div>
            ) : null}

            {term ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">注册开始</p>
                  <p className="mt-1 text-slate-800">{fmtDateTime(term.registrationOpenAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">注册截止</p>
                  <p className="mt-1 text-slate-800">{fmtDateTime(term.registrationCloseAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">退课截止</p>
                  <p className="mt-1 text-slate-800">{fmtDateTime(term.dropDeadline)}</p>
                </div>
              </>
            ) : (
              <p className="text-slate-500">暂无活跃学期。</p>
            )}

            {actionItems.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-slate-500">待处理事项</p>
                {actionItems.slice(0, 2).map((item) => (
                  <div key={item.title} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <span className={chipTone(item.tone)}>
                      {item.tone === "emerald" ? "已就绪" : item.tone === "amber" ? "需关注" : "提示"}
                    </span>
                  </div>
                    <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {dropDaysLeft !== null ? (
              <p className={`rounded-xl border px-3 py-2 text-sm font-semibold ${dropDaysLeft < 0 ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                {dropDaysLeft < 0
                  ? `退课截止日期已过 ${Math.abs(dropDaysLeft)} 天，如需变更请联系教务处。`
                  : `距退课截止日期还剩 ${dropDaysLeft} 天。`}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="campus-card">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">注册快照</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {enrolled.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] font-semibold text-slate-500">
                  已注册 ({enrolledCount})
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
                                {({"ENROLLED":"在读","COMPLETED":"已完成","DROPPED":"已退课","WAITLISTED":"候补","PENDING_APPROVAL":"待审批"} as Record<string,string>)[item.status] ?? item.status}
                              </span>
                            </div>
                          </td>
                          <td className="max-w-[200px] truncate px-3 py-2 text-slate-600">
                            {item.section.course?.title ?? item.section.sectionCode ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-500">
                            {item.section.credits} 学分
                          </td>
                        </tr>
                      ))}
                      {enrolled.length > 6 ? (
                        <tr className="bg-white">
                          <td colSpan={3} className="px-3 py-1.5 text-center text-xs text-slate-400">
                            +{enrolled.length - 6} 门 — 查看完整课表
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {pendingApproval.length === 0 && waitlisted.length === 0 && enrolled.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-2xl">📚</p>
                <p className="mt-2 text-sm font-medium text-slate-600">暂未注册任何课程</p>
                <p className="mt-1 text-xs text-slate-400">前往课程目录查看可用课程。</p>
                <Link
                  href="/student/catalog"
                  className="mt-3 inline-flex h-8 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-white no-underline transition hover:bg-primary/90"
                >
                  浏览课程目录 →
                </Link>
              </div>
            ) : pendingApproval.length > 0 || waitlisted.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                  <p className="text-[11px] font-semibold text-violet-700">待审批</p>
                  <p className="campus-kpi-value text-violet-900">{pendingApproval.length}</p>
                  <ul className="mt-2 space-y-1 text-sm text-violet-900">
                    {pendingApproval.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        {(item.section.course?.code ?? "课程")} {(item.section.sectionCode ?? "")}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-[11px] font-semibold text-amber-700">候补中</p>
                  <p className="campus-kpi-value text-amber-900">{waitlisted.length}</p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-900">
                    {waitlisted.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        {(item.section.course?.code ?? "课程")} {(item.section.sectionCode ?? "")}
                        {item.waitlistPosition ? ` · 候补第 ${item.waitlistPosition} 位` : ""}
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
                浏览课程目录
              </Link>
              <Link
                href={term ? `/student/cart?termId=${term.id}` : "/student/cart"}
                className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
              >
                打开购物车
              </Link>
              <Link
                href={term ? `/student/schedule?termId=${term.id}` : "/student/schedule"}
                className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
              >
                查看课表
              </Link>
              <Link
                href="/student/grades"
                className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
              >
                查看成绩
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Toolbox quick-access */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-slate-700">学习工具箱</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { href: "/student/quick-add",           label: "快速选课" },
                { href: "/student/conflicts",           label: "冲突检测" },
                { href: "/student/planner",             label: "选课规划" },
                { href: "/student/watchlist",           label: "课程订阅" },
                { href: "/student/recommendations",     label: "课程推荐" },
                { href: "/student/graduation-checklist",label: "毕业核查" },
                { href: "/student/credit-summary",      label: "学分总览" },
                { href: "/student/enrollment-timeline", label: "注册记录" },
                { href: "/student/what-if",             label: "GPA 模拟" },
                { href: "/student/gpa-goal",            label: "GPA 目标" },
                { href: "/student/peer-compare",        label: "同伴对比" },
                { href: "/student/term-compare",        label: "学期对比" },
                { href: "/student/my-ratings",          label: "我的评价" },
                { href: "/student/honors",              label: "荣誉成就" },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-2.5 text-center text-xs font-medium text-slate-700 no-underline transition hover:border-[hsl(221_83%_43%_/_0.3)] hover:bg-[hsl(221_80%_97%)] hover:text-[hsl(221_83%_43%)]"
                >
                  {label}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
