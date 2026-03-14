"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlignJustify,
  BookCopy,
  Bookmark,
  BookOpen,
  BarChart3,
  Bell,
  CalendarDays,
  CalendarRange,
  Clock,
  GraduationCap,
  HelpCircle,
  Home,
  History,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Mail,
  Megaphone,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  ShoppingCart,
  Star,
  TrendingDown,
  Upload,
  X,
  User,
  Users
} from "lucide-react";
import DarkModeToggle from "@/components/DarkModeToggle";
import CommandPalette from "@/components/CommandPalette";
import KeyboardShortcutsModal from "@/components/KeyboardShortcutsModal";
import NotificationBell from "@/components/NotificationBell";
import { SkipLink } from "@/components/SkipLink";
import { LogoutButton } from "@/components/logout-button";
import SessionExpiryBanner from "@/components/SessionExpiryBanner";
import StudentMobileNav from "@/components/StudentMobileNav";
import { apiFetch } from "@/lib/api";
import { API_URL } from "@/lib/config";

type AppArea = "student" | "admin" | "faculty" | "advisor";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

type NavGroup = {
  label: string;
  hrefs: string[];
};

const iconClass = "size-4";

const studentItems: NavItem[] = [
  { href: "/student/dashboard", label: "Dashboard", icon: <Home className={iconClass} /> },
  { href: "/student/notifications", label: "Notifications", icon: <Bell className={iconClass} /> },
  { href: "/student/announcements", label: "Announcements", icon: <Megaphone className={iconClass} /> },
  { href: "/student/catalog", label: "Catalog", icon: <BookOpen className={iconClass} /> },
  { href: "/student/readiness", label: "可选课检测", icon: <ListChecks className={iconClass} /> },
  { href: "/student/planner", label: "选课规划", icon: <CalendarDays className={iconClass} /> },
  { href: "/student/planner/4year", label: "四年规划", icon: <CalendarDays className={iconClass} /> },
  { href: "/student/cart", label: "Cart", icon: <ShoppingCart className={iconClass} /> },
  { href: "/student/quick-add", label: "快速注册", icon: <ListChecks className={iconClass} /> },
  { href: "/student/waitlist", label: "候补名单", icon: <Clock className={iconClass} /> },
  { href: "/student/conflicts", label: "冲突检测", icon: <ListChecks className={iconClass} /> },
  { href: "/student/schedule", label: "Schedule", icon: <CalendarDays className={iconClass} /> },
  { href: "/student/receipt", label: "选课确认单", icon: <ScrollText className={iconClass} /> },
  { href: "/student/grades", label: "Grades", icon: <GraduationCap className={iconClass} /> },
  { href: "/student/degree", label: "毕业进度", icon: <GraduationCap className={iconClass} /> },
  { href: "/student/degree-audit", label: "毕业审计", icon: <GraduationCap className={iconClass} /> },
  { href: "/student/gpa-sim", label: "GPA 模拟器", icon: <BarChart3 className={iconClass} /> },
  { href: "/student/grade-estimator", label: "成绩估算", icon: <BarChart3 className={iconClass} /> },
  { href: "/student/calendar", label: "Calendar", icon: <CalendarRange className={iconClass} /> },
  { href: "/student/history", label: "History", icon: <History className={iconClass} /> },
  { href: "/student/bookmarks", label: "Bookmarks", icon: <Bookmark className={iconClass} /> },
  { href: "/student/watched", label: "Watched", icon: <Bell className={iconClass} /> },
  { href: "/student/study-timer", label: "学习计时器", icon: <Clock className={iconClass} /> },
  { href: "/student/reviews", label: "My Reviews", icon: <Star className={iconClass} /> },
  { href: "/student/transcript", label: "修课记录", icon: <ScrollText className={iconClass} /> },
  { href: "/student/my-notes", label: "我的笔记", icon: <ScrollText className={iconClass} /> },
  { href: "/student/appeals", label: "成绩申诉", icon: <ScrollText className={iconClass} /> },
  { href: "/student/settings", label: "设置", icon: <Settings className={iconClass} /> },
  { href: "/student/advisor", label: "我的顾问", icon: <User className={iconClass} /> },
  { href: "/student/contact", label: "Support", icon: <Mail className={iconClass} /> },
  { href: "/student/profile", label: "Profile", icon: <User className={iconClass} /> },
  { href: "/student/help", label: "Help", icon: <HelpCircle className={iconClass} /> },
  { href: "/student/peer-compare", label: "同伴对比", icon: <BarChart3 className={iconClass} /> },
  { href: "/student/enrollment-timeline", label: "选课历程", icon: <History className={iconClass} /> },
  { href: "/student/standing", label: "学业状态", icon: <GraduationCap className={iconClass} /> },
  { href: "/student/recommendations", label: "课程推荐", icon: <Star className={iconClass} /> },
  { href: "/student/what-if", label: "假设规划器", icon: <BarChart3 className={iconClass} /> },
  { href: "/student/credit-summary", label: "学分汇总", icon: <BarChart3 className={iconClass} /> },
  { href: "/student/gpa-goal", label: "GPA 目标规划", icon: <BarChart3 className={iconClass} /> }
];

const adminItems: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: <LayoutDashboard className={iconClass} /> },
  { href: "/admin/alerts", label: "警报中心", icon: <ShieldAlert className={iconClass} /> },
  { href: "/admin/search", label: "全局搜索", icon: <BookOpen className={iconClass} /> },
  { href: "/admin/students", label: "学生", icon: <Users className={iconClass} /> },
  { href: "/admin/students/at-risk", label: "高风险学生", icon: <TrendingDown className={iconClass} /> },
  { href: "/admin/student-progress", label: "学生进度", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/dropout-risk", label: "退课风险", icon: <TrendingDown className={iconClass} /> },
  { href: "/admin/graduation", label: "毕业审核", icon: <GraduationCap className={iconClass} /> },
  { href: "/admin/instructors", label: "教师分析", icon: <GraduationCap className={iconClass} /> },
  { href: "/admin/faculty-schedule", label: "教师课表", icon: <CalendarDays className={iconClass} /> },
  { href: "/admin/export", label: "Export Center", icon: <Upload className={iconClass} /> },
  { href: "/admin/courses", label: "课程", icon: <BookCopy className={iconClass} /> },
  { href: "/admin/sections", label: "教学班", icon: <ListChecks className={iconClass} /> },
  { href: "/admin/terms", label: "学期", icon: <CalendarRange className={iconClass} /> },
  { href: "/admin/calendar", label: "日历事件", icon: <CalendarDays className={iconClass} /> },
  { href: "/admin/enrollments", label: "注册管理", icon: <GraduationCap className={iconClass} /> },
  { href: "/admin/closeout", label: "结课处理", icon: <GraduationCap className={iconClass} /> },
  { href: "/admin/waitlist", label: "候补名单", icon: <Clock className={iconClass} /> },
  { href: "/admin/waitlist-analytics", label: "候补分析", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/holds", label: "学生限制", icon: <ShieldAlert className={iconClass} /> },
  { href: "/admin/requests", label: "审批请求", icon: <ListChecks className={iconClass} /> },
  { href: "/admin/appeals", label: "成绩申诉", icon: <ScrollText className={iconClass} /> },
  { href: "/admin/cohort-message", label: "届次群发", icon: <Mail className={iconClass} /> },
  { href: "/admin/status-email", label: "状态群发", icon: <Mail className={iconClass} /> },
  { href: "/admin/digest", label: "邮件摘要", icon: <Mail className={iconClass} /> },
  { href: "/admin/announcements", label: "公告", icon: <Megaphone className={iconClass} /> },
  { href: "/admin/invite-codes", label: "邀请码", icon: <KeyRound className={iconClass} /> },
  { href: "/admin/import", label: "数据导入", icon: <Upload className={iconClass} /> },
  { href: "/admin/reports", label: "报表", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/grade-distribution", label: "成绩分布", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/demand", label: "需求分析", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/capacity-plan", label: "容量规划", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/term-compare", label: "学期对比", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/registration-heatmap", label: "注册热力图", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/prereq-audit", label: "先修课审计", icon: <ListChecks className={iconClass} /> },
  { href: "/admin/offering-history", label: "课程开设历史", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/cohort-analytics", label: "专业群体分析", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/term-enrollment-forecast", label: "学期选课预测", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/course-demand-compare", label: "课程需求对比", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/section-swap", label: "班级调换", icon: <ListChecks className={iconClass} /> },
  { href: "/admin/enrollment-audit", label: "注册审计", icon: <ScrollText className={iconClass} /> },
  { href: "/admin/top-performers", label: "优秀学生", icon: <Star className={iconClass} /> },
  { href: "/admin/dept-workload", label: "学院工作负荷", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/enrollment-velocity", label: "注册速度", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/prereq-map", label: "先修课关系图", icon: <ListChecks className={iconClass} /> },
  { href: "/admin/grade-curve", label: "成绩曲线工具", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/section-roster", label: "课程节名单", icon: <Users className={iconClass} /> },
  { href: "/admin/term-capacity", label: "学期容量汇总", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/audit-logs", label: "审计日志", icon: <ScrollText className={iconClass} /> },
  { href: "/admin/notifications", label: "通知记录", icon: <Bell className={iconClass} /> },
  { href: "/admin/sessions", label: "会话管理", icon: <Shield className={iconClass} /> },
  { href: "/admin/settings", label: "系统设置", icon: <Settings className={iconClass} /> }
];

const facultyItems: NavItem[] = [
  { href: "/faculty/dashboard", label: "Dashboard", icon: <LayoutDashboard className={iconClass} /> },
  { href: "/faculty/sections", label: "My Sections", icon: <BookOpen className={iconClass} /> },
  { href: "/faculty/requests", label: "Prereq Requests", icon: <ListChecks className={iconClass} /> }
];

const advisorItems: NavItem[] = [
  { href: "/advisor/dashboard", label: "Dashboard", icon: <LayoutDashboard className={iconClass} /> },
  { href: "/advisor/advisees", label: "My Advisees", icon: <Users className={iconClass} /> },
  { href: "/advisor/requests", label: "Pending Requests", icon: <ListChecks className={iconClass} /> }
];

const areaMeta: Record<AppArea, { label: string; items: NavItem[]; subtitle: string }> = {
  student: { label: "Student Portal", items: studentItems, subtitle: "Academic Planning & Registration" },
  admin: { label: "Admin Console", items: adminItems, subtitle: "Records & Enrollment Operations" },
  faculty: { label: "Faculty Workspace", items: facultyItems, subtitle: "Instruction & Grade Submission" },
  advisor: { label: "Advisor Workspace", items: advisorItems, subtitle: "Advisee Oversight & Notes" }
};

function toTitle(text: string): string {
  return text
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AppShell({
  area,
  userLabel,
  children
}: {
  area: AppArea;
  userLabel: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [announcementCount, setAnnouncementCount] = useState(0);
  const navMeta = areaMeta[area];
  const sidebarId = "sidebar";

  const pageTitle = useMemo(() => {
    const normalizedPath = pathname.replace(/\/+$/, "");
    if (normalizedPath.endsWith("/student")) return "Student Portal";
    if (normalizedPath.endsWith("/admin")) return "Admin Console";

    const segments = normalizedPath.split("/").filter(Boolean);
    const current = segments[segments.length - 1];
    return current ? toTitle(current) : "University SIS";
  }, [pathname]);

  const breadcrumb = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length <= 1) return navMeta.label;
    return `${navMeta.label} / ${toTitle(parts[parts.length - 1])}`;
  }, [pathname, navMeta.label]);

  const navGroups = useMemo(() => {
    const groups: NavGroup[] =
      area === "admin"
        ? [
            { label: "概览", hrefs: ["/admin/dashboard", "/admin/alerts", "/admin/search"] },
            { label: "学术管理", hrefs: ["/admin/students", "/admin/students/at-risk", "/admin/student-progress", "/admin/dropout-risk", "/admin/graduation", "/admin/instructors", "/admin/faculty-schedule", "/admin/courses", "/admin/sections", "/admin/terms", "/admin/calendar"] },
            { label: "注册管理", hrefs: ["/admin/enrollments", "/admin/section-swap", "/admin/closeout", "/admin/waitlist", "/admin/waitlist-analytics", "/admin/holds", "/admin/requests", "/admin/appeals"] },
            { label: "系统", hrefs: ["/admin/announcements", "/admin/cohort-message", "/admin/status-email", "/admin/invite-codes", "/admin/import", "/admin/export", "/admin/reports", "/admin/grade-distribution", "/admin/demand", "/admin/capacity-plan", "/admin/term-compare", "/admin/registration-heatmap", "/admin/prereq-audit", "/admin/offering-history", "/admin/cohort-analytics", "/admin/term-enrollment-forecast", "/admin/course-demand-compare", "/admin/enrollment-audit", "/admin/top-performers", "/admin/dept-workload", "/admin/enrollment-velocity", "/admin/prereq-map", "/admin/grade-curve", "/admin/section-roster", "/admin/term-capacity", "/admin/digest", "/admin/audit-logs", "/admin/notifications", "/admin/sessions", "/admin/settings"] }
          ]
        : area === "faculty"
          ? [{ label: "Instruction", hrefs: ["/faculty/dashboard", "/faculty/sections", "/faculty/requests"] }]
          : area === "advisor"
            ? [{ label: "Advising", hrefs: ["/advisor/dashboard", "/advisor/advisees", "/advisor/requests"] }]
        : [
            { label: "Overview", hrefs: ["/student/dashboard", "/student/notifications", "/student/announcements"] },
            { label: "Registration", hrefs: ["/student/catalog", "/student/readiness", "/student/planner", "/student/cart", "/student/quick-add", "/student/waitlist", "/student/conflicts", "/student/schedule", "/student/receipt"] },
            { label: "Academic", hrefs: ["/student/grades", "/student/degree", "/student/degree-audit", "/student/standing", "/student/recommendations", "/student/what-if", "/student/credit-summary", "/student/gpa-goal", "/student/gpa-sim", "/student/grade-estimator", "/student/peer-compare", "/student/enrollment-timeline", "/student/transcript", "/student/calendar", "/student/history", "/student/bookmarks", "/student/watched", "/student/study-timer", "/student/reviews", "/student/my-notes", "/student/appeals", "/student/advisor", "/student/settings", "/student/contact", "/student/profile", "/student/help"] }
          ];

    return groups
      .map((group) => ({
        label: group.label,
        items: group.hrefs
          .map((href) => navMeta.items.find((item) => item.href === href))
          .filter((item): item is NavItem => Boolean(item))
      }))
      .filter((group) => group.items.length > 0);
  }, [area, navMeta.items]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => {
    if (!sidebarOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (area !== "admin") return;
    let alive = true;
    void apiFetch<Array<{ expiresAt?: string | null }>>("/admin/announcements")
      .then((items) => {
        if (!alive) return;
        const now = Date.now();
        setAnnouncementCount(
          (items ?? []).filter((item) => !item.expiresAt || new Date(item.expiresAt).getTime() > now).length
        );
      })
      .catch(() => {
        if (alive) setAnnouncementCount(0);
      });
    return () => {
      alive = false;
    };
  }, [area]);

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setSidebarOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`group flex items-center gap-3 rounded-r-lg border-l-2 px-3 py-2.5 text-sm no-underline transition ${
          active
            ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold dark:bg-blue-900/30 dark:text-blue-300"
            : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <span
          className={`inline-flex size-7 items-center justify-center rounded-md border ${
            active
              ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
              : "border-slate-200 bg-white text-slate-500 group-hover:border-slate-300 group-hover:text-slate-700"
          }`}
        >
          {item.icon}
        </span>
        <span className="font-medium">{item.label}</span>
        {item.href === "/admin/announcements" && announcementCount > 0 ? (
          <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-violet-500 px-1.5 text-[10px] font-bold text-white">
            {announcementCount}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <div data-area={area} className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <SessionExpiryBanner />
      <SkipLink />
      <div
        className={`fixed inset-0 z-40 bg-slate-950/45 transition md:hidden ${
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside
        role={sidebarOpen ? "dialog" : undefined}
        aria-modal={sidebarOpen ? "true" : undefined}
        aria-label={`${navMeta.label} navigation`}
        id={sidebarId}
        className={`no-print fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-200 bg-white text-slate-900 shadow-[0_26px_55px_-36px_rgba(15,23,42,0.65)] transition-transform dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 md:block md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "hidden -translate-x-full"
        }`}
      >
        <div className="h-1 w-full bg-[#153c70]" />

        <div className="flex h-24 items-center justify-between border-b border-slate-200 px-5">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">University System</p>
            <p className="font-heading text-[1.75rem] font-semibold leading-none text-[#102949]">University SIS</p>
            <p className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-slate-500">{navMeta.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="inline-flex size-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Close sidebar"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex h-[calc(100%-97px)] flex-col px-4 py-5">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {navMeta.label}
          </p>
          <nav aria-label="Main navigation">
            {navGroups.map((group) => (
              <div key={group.label} className="mt-4 first:mt-0">
                <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {group.label}
                </p>
                <div className="space-y-1.5">{group.items.map(renderNavItem)}</div>
              </div>
            ))}
          </nav>
          <div className="mt-auto">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              <p className="truncate font-semibold text-slate-800">{userLabel}</p>
              <p className="mt-0.5">
                {area === "student"
                  ? "Student Services"
                  : area === "admin"
                    ? "Administrative Services"
                    : area === "faculty"
                      ? "Faculty Services"
                      : "Advising Services"}
              </p>
            </div>
            <div className="mt-3 border-t border-slate-200 px-3 py-3">
              <p className="text-[10px] text-slate-400">地平线 SIS · v1.0</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="relative md:pl-72">
        <header className="no-print sticky top-0 z-30 border-b border-slate-200/85 bg-white/95 backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95">
          <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between px-4 md:px-8 lg:px-10">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen((prev) => !prev)}
                className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 md:hidden"
                aria-label="Toggle sidebar"
                aria-controls={sidebarId}
                aria-expanded={sidebarOpen}
              >
                <AlignJustify className="size-4" />
              </button>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {breadcrumb}
                </p>
                <h1 className="truncate font-heading text-lg font-semibold text-slate-900">{pageTitle}</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <DarkModeToggle />
              {area === "student" ? (
                <NotificationBell apiBase={API_URL} />
              ) : null}
              <span className="hidden h-9 items-center rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm sm:inline-flex">
                Signed in: {userLabel}
              </span>
              <LogoutButton />
            </div>
          </div>
        </header>

        <main
          id="main-content"
          className={`mx-auto max-w-[1360px] p-4 dark:bg-slate-950 md:p-8 lg:p-10 ${area === "student" ? "pb-16 md:pb-0" : ""}`}
        >
          {children}
        </main>
      </div>
      {area === "student" ? <StudentMobileNav /> : null}
      <KeyboardShortcutsModal />
      <CommandPalette />
    </div>
  );
}
