"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlignJustify,
  BarChart3,
  Bell,
  BookCopy,
  BookOpen,
  CalendarDays,
  CalendarRange,
  Clock,
  GraduationCap,
  Home,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  ScrollText,
  Search,
  Shield,
  ShieldAlert,
  ShoppingCart,
  User,
  Users,
  X,
} from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { SkipLink } from "@/components/SkipLink";
import { CommandPalette } from "@/components/command-palette";
import ErrorBoundary from "@/components/error-boundary";
import { LogoutButton } from "@/components/logout-button";
import SessionExpiryBanner from "@/components/SessionExpiryBanner";
import StudentMobileNav from "@/components/StudentMobileNav";
import { apiFetch } from "@/lib/api";

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
  // 概览
  { href: "/student/dashboard",      label: "概览",       icon: <Home className={iconClass} /> },
  // 选课
  { href: "/student/catalog",        label: "课程目录",   icon: <BookOpen className={iconClass} /> },
  { href: "/student/planner",        label: "选课规划",   icon: <CalendarDays className={iconClass} /> },
  { href: "/student/cart",           label: "购物车",     icon: <ShoppingCart className={iconClass} /> },
  { href: "/student/schedule",       label: "我的课表",   icon: <CalendarDays className={iconClass} /> },
  { href: "/student/waitlist",       label: "候补名单",   icon: <Clock className={iconClass} /> },
  { href: "/student/watchlist",      label: "订阅课程",   icon: <Bell className={iconClass} /> },
  // 学籍
  { href: "/student/grades",         label: "成绩",       icon: <GraduationCap className={iconClass} /> },
  { href: "/student/transcript",     label: "成绩单",     icon: <ScrollText className={iconClass} /> },
  { href: "/student/degree-audit",   label: "毕业进度",   icon: <GraduationCap className={iconClass} /> },
  { href: "/student/standing",        label: "学业状态",   icon: <GraduationCap className={iconClass} /> },
  { href: "/student/term-compare",    label: "学期对比",   icon: <BarChart3 className={iconClass} /> },
  { href: "/student/appeals",         label: "成绩申诉",   icon: <ScrollText className={iconClass} /> },
  // 申请
  { href: "/student/prereq-waivers",  label: "先修课豁免", icon: <ListChecks className={iconClass} /> },
  { href: "/student/recommendations", label: "推荐课程",   icon: <BookOpen className={iconClass} /> },
  { href: "/student/receipt",         label: "选课凭证",   icon: <ScrollText className={iconClass} /> },
  // 账号
  { href: "/student/profile",         label: "个人资料",   icon: <User className={iconClass} /> },
  { href: "/student/notifications",   label: "通知",       icon: <Bell className={iconClass} /> },
  { href: "/student/announcements",   label: "公告",       icon: <Megaphone className={iconClass} /> },
  { href: "/student/advisor",          label: "我的导师",    icon: <User className={iconClass} /> },
  // 工具
  { href: "/student/grade-estimator",  label: "成绩估算",    icon: <BarChart3 className={iconClass} /> },
  { href: "/student/what-if",          label: "GPA模拟",     icon: <BarChart3 className={iconClass} /> },
  { href: "/student/gpa-goal",         label: "GPA目标",     icon: <BarChart3 className={iconClass} /> },
  { href: "/student/credit-summary",   label: "学分总览",    icon: <GraduationCap className={iconClass} /> },
  { href: "/student/peer-compare",     label: "同伴对比",    icon: <BarChart3 className={iconClass} /> },
  { href: "/student/my-notes",         label: "我的笔记",    icon: <ScrollText className={iconClass} /> },
  { href: "/student/study-timer",      label: "学习计时",    icon: <Clock className={iconClass} /> },
  { href: "/student/conflicts",        label: "时间冲突",    icon: <ShieldAlert className={iconClass} /> },
  { href: "/student/enrollment-timeline", label: "注册时间线", icon: <CalendarDays className={iconClass} /> },
  { href: "/student/quick-add",        label: "快速选课",    icon: <ShoppingCart className={iconClass} /> },
  { href: "/student/calendar",         label: "学术日历",    icon: <CalendarDays className={iconClass} /> },
  // 学籍延伸
  { href: "/student/graduation-checklist", label: "毕业条件",  icon: <GraduationCap className={iconClass} /> },
  { href: "/student/course-history",   label: "课程历史",    icon: <BookOpen className={iconClass} /> },
  { href: "/student/enrollment-log",   label: "操作日志",    icon: <ScrollText className={iconClass} /> },
  { href: "/student/my-ratings",       label: "我的评价",    icon: <BarChart3 className={iconClass} /> },
];

const adminItems: NavItem[] = [
  // 概览
  { href: "/admin/dashboard",          label: "概览",       icon: <LayoutDashboard className={iconClass} /> },
  { href: "/admin/system-health",      label: "系统状态",   icon: <Shield className={iconClass} /> },
  // 人员管理
  { href: "/admin/staff",              label: "教职导师",   icon: <Users className={iconClass} /> },
  // 系统管理
  { href: "/admin/users-mgmt",         label: "用户管理",   icon: <Users className={iconClass} /> },
  // 学生管理
  { href: "/admin/students",           label: "学生",       icon: <Users className={iconClass} /> },
  { href: "/admin/holds",              label: "学籍限制",   icon: <ShieldAlert className={iconClass} /> },
  { href: "/admin/student-progress",   label: "学生进度",   icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/at-risk",            label: "学生预警",   icon: <ShieldAlert className={iconClass} /> },
  // 课务管理
  { href: "/admin/courses",            label: "课程",       icon: <BookCopy className={iconClass} /> },
  { href: "/admin/sections",           label: "教学班",     icon: <ListChecks className={iconClass} /> },
  { href: "/admin/terms",              label: "学期",       icon: <CalendarRange className={iconClass} /> },
  { href: "/admin/reg-windows",        label: "选课窗口",   icon: <CalendarRange className={iconClass} /> },
  // 注册管理
  { href: "/admin/enrollments",        label: "注册管理",   icon: <GraduationCap className={iconClass} /> },
  { href: "/admin/grade-entry",        label: "成绩录入",   icon: <ScrollText className={iconClass} /> },
  { href: "/admin/waitlist",           label: "候补名单",   icon: <Clock className={iconClass} /> },
  // 审批
  { href: "/admin/appeals",            label: "成绩申诉",   icon: <ScrollText className={iconClass} /> },
  { href: "/admin/prereq-waivers",     label: "先修豁免",   icon: <ListChecks className={iconClass} /> },
  { href: "/admin/pending-overloads",  label: "超学分审批", icon: <ShieldAlert className={iconClass} /> },
  // 公告与操作
  { href: "/admin/announcements-mgmt", label: "公告管理",   icon: <Megaphone className={iconClass} /> },
  { href: "/admin/bulk-ops",           label: "批量操作",   icon: <ListChecks className={iconClass} /> },
  { href: "/admin/enrollment-audit",   label: "注册审计",   icon: <ScrollText className={iconClass} /> },
  { href: "/admin/grade-distribution", label: "成绩分布",   icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/audit-logs",         label: "审计日志",   icon: <ScrollText className={iconClass} /> },
  // 分析
  { href: "/admin/instructor-performance", label: "教师绩效", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/dept-gpa",               label: "院系GPA",  icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/retention",              label: "学生留存", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/demand-report",          label: "需求报告",   icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/data-quality",           label: "数据质量",   icon: <ShieldAlert className={iconClass} /> },
  { href: "/admin/notification-log",       label: "通知记录",   icon: <Bell className={iconClass} /> },
  { href: "/admin/term-comparison",        label: "学期对比",   icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/course-pairings",        label: "课程同选",   icon: <BookCopy className={iconClass} /> },
  { href: "/admin/digest-preview",         label: "运营周报",   icon: <Megaphone className={iconClass} /> },
  { href: "/admin/dropout-risk",           label: "退学风险",   icon: <ShieldAlert className={iconClass} /> },
  { href: "/admin/top-performers",         label: "优秀学生",   icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/dept-workload",          label: "院系工作量", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/waitlist-analytics",     label: "候补分析",   icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/graduation",             label: "毕业审核",   icon: <GraduationCap className={iconClass} /> },
  { href: "/admin/registration-heatmap",   label: "注册热图",   icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/faculty-schedule",       label: "教师排课",   icon: <CalendarDays className={iconClass} /> },
  { href: "/admin/capacity-plan",          label: "容量规划",   icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/alerts",                 label: "系统预警",   icon: <ShieldAlert className={iconClass} /> },
  { href: "/admin/enrollment-velocity",    label: "注册速率",   icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/term-capacity",          label: "学期容量",   icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/late-drops",             label: "晚期退课",   icon: <ScrollText className={iconClass} /> },
  { href: "/admin/major-trends",           label: "专业趋势",   icon: <BarChart3 className={iconClass} /> },
  // 工具
  { href: "/admin/closeout",               label: "学期关闭",   icon: <CalendarRange className={iconClass} /> },
  { href: "/admin/prereq-audit",           label: "先修审计",   icon: <ShieldAlert className={iconClass} /> },
  { href: "/admin/offering-history",       label: "开课历史",   icon: <BookCopy className={iconClass} /> },
  { href: "/admin/section-swap",           label: "学生换班",   icon: <Users className={iconClass} /> },
  { href: "/admin/schedule-conflicts",     label: "排课冲突",   icon: <ShieldAlert className={iconClass} /> },
  { href: "/admin/grade-curve",            label: "成绩曲线",   icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/cohort-analytics",       label: "专业群体",   icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/term-enrollment-forecast", label: "注册预测", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/prereq-map",             label: "先修图谱",   icon: <BookCopy className={iconClass} /> },
  { href: "/admin/section-roster",         label: "班级花名册", icon: <Users className={iconClass} /> },
  { href: "/admin/status-email",           label: "状态邮件",   icon: <Megaphone className={iconClass} /> },
  { href: "/admin/cohort-message",         label: "群组消息",   icon: <Megaphone className={iconClass} /> },
  { href: "/admin/calendar",               label: "学术日历",   icon: <CalendarDays className={iconClass} /> },
  { href: "/admin/reports-summary",        label: "报告汇总",   icon: <BarChart3 className={iconClass} /> },
  // 系统管理
  { href: "/admin/search",                 label: "全局搜索",   icon: <Search className={iconClass} /> },
  { href: "/admin/invite-codes",           label: "邀请码",     icon: <Shield className={iconClass} /> },
  { href: "/admin/settings",               label: "系统设置",   icon: <Shield className={iconClass} /> },
  { href: "/admin/webhooks",               label: "Webhook",    icon: <Bell className={iconClass} /> },
];

const facultyItems: NavItem[] = [
  { href: "/faculty/dashboard", label: "概览", icon: <LayoutDashboard className={iconClass} /> },
  { href: "/faculty/sections", label: "我的课程", icon: <BookOpen className={iconClass} /> },
  { href: "/faculty/requests", label: "先修课审批", icon: <ListChecks className={iconClass} /> },
  { href: "/faculty/grade-stats",  label: "成绩统计",   icon: <BarChart3 className={iconClass} /> }
];

const advisorItems: NavItem[] = [
  { href: "/advisor/dashboard", label: "概览", icon: <LayoutDashboard className={iconClass} /> },
  { href: "/advisor/advisees", label: "我的学生", icon: <Users className={iconClass} /> },
  { href: "/advisor/requests", label: "待审批请求", icon: <ListChecks className={iconClass} /> }
];

const areaMeta: Record<AppArea, { label: string; items: NavItem[]; subtitle: string }> = {
  student: { label: "学生端", items: studentItems, subtitle: "选课与学业" },
  admin: { label: "管理端", items: adminItems, subtitle: "学籍与注册运营" },
  faculty: { label: "教师端", items: facultyItems, subtitle: "教学与审批" },
  advisor: { label: "顾问端", items: advisorItems, subtitle: "学生支持" }
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
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [announcementCount, setAnnouncementCount] = useState(0);
  const navMeta = areaMeta[area];
  const sidebarId = "sidebar";
  const currentNavItem = useMemo(() => {
    return [...navMeta.items]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  }, [navMeta.items, pathname]);

  const pageTitle = useMemo(() => {
    const normalizedPath = pathname.replace(/\/+$/, "");
    if (currentNavItem) return currentNavItem.label;
    if (normalizedPath.endsWith("/student")) return "学生端";
    if (normalizedPath.endsWith("/admin")) return "管理端";

    const segments = normalizedPath.split("/").filter(Boolean);
    const current = segments[segments.length - 1];
    return current ? toTitle(current) : "地平线";
  }, [currentNavItem, pathname]);

  const breadcrumb = useMemo(() => {
    return currentNavItem ? `${navMeta.label} / ${currentNavItem.label}` : navMeta.label;
  }, [currentNavItem, navMeta.label]);
  const userInitial = (userLabel.trim().slice(0, 1) || navMeta.label.slice(0, 1)).toUpperCase();
  const quickNavigation = useMemo(() => {
    const merged = [...studentItems, ...adminItems];
    const seen = new Set<string>();
    return merged.filter((item) => {
      if (seen.has(item.href)) return false;
      seen.add(item.href);
      return true;
    }).map((item) => ({ href: item.href, label: item.label }));
  }, []);

  const navGroups = useMemo(() => {
    const groups: NavGroup[] =
      area === "admin"
        ? [
            { label: "概览",     hrefs: ["/admin/dashboard", "/admin/system-health"] },
            { label: "人员",     hrefs: ["/admin/staff"] },
            { label: "学生",     hrefs: ["/admin/students", "/admin/holds", "/admin/student-progress", "/admin/at-risk"] },
            { label: "课务",     hrefs: ["/admin/courses", "/admin/sections", "/admin/terms", "/admin/reg-windows"] },
            { label: "注册",     hrefs: ["/admin/enrollments", "/admin/grade-entry", "/admin/waitlist"] },
            { label: "审批",     hrefs: ["/admin/appeals", "/admin/prereq-waivers", "/admin/pending-overloads"] },
            { label: "管理",     hrefs: ["/admin/announcements-mgmt", "/admin/bulk-ops", "/admin/enrollment-audit", "/admin/grade-distribution", "/admin/audit-logs"] },
            { label: "分析",     hrefs: ["/admin/instructor-performance", "/admin/dept-gpa", "/admin/retention", "/admin/demand-report", "/admin/data-quality", "/admin/notification-log", "/admin/term-comparison", "/admin/course-pairings", "/admin/digest-preview", "/admin/dropout-risk", "/admin/top-performers", "/admin/dept-workload", "/admin/waitlist-analytics", "/admin/graduation", "/admin/registration-heatmap", "/admin/faculty-schedule", "/admin/capacity-plan", "/admin/alerts", "/admin/enrollment-velocity", "/admin/term-capacity", "/admin/late-drops", "/admin/major-trends"] },
            { label: "工具",     hrefs: ["/admin/closeout", "/admin/prereq-audit", "/admin/offering-history", "/admin/section-swap", "/admin/schedule-conflicts", "/admin/grade-curve", "/admin/cohort-analytics", "/admin/term-enrollment-forecast", "/admin/prereq-map", "/admin/section-roster", "/admin/status-email", "/admin/cohort-message", "/admin/calendar", "/admin/reports-summary"] },
            { label: "系统",     hrefs: ["/admin/users-mgmt", "/admin/search", "/admin/invite-codes", "/admin/settings", "/admin/webhooks"] },
          ]
        : area === "faculty"
          ? [{ label: "教学", hrefs: ["/faculty/dashboard", "/faculty/sections", "/faculty/requests", "/faculty/grade-stats"] }]
          : area === "advisor"
            ? [{ label: "顾问工作台", hrefs: ["/advisor/dashboard", "/advisor/advisees", "/advisor/requests"] }]
        : [
            { label: "概览", hrefs: ["/student/dashboard", "/student/notifications", "/student/announcements"] },
            { label: "选课", hrefs: ["/student/catalog", "/student/planner", "/student/cart", "/student/schedule", "/student/waitlist", "/student/watchlist"] },
            { label: "学籍", hrefs: ["/student/grades", "/student/transcript", "/student/degree-audit", "/student/graduation-checklist", "/student/standing", "/student/term-compare", "/student/appeals", "/student/prereq-waivers", "/student/recommendations", "/student/receipt", "/student/course-history", "/student/enrollment-log", "/student/my-ratings"] },
            { label: "工具", hrefs: ["/student/grade-estimator", "/student/what-if", "/student/gpa-goal", "/student/credit-summary", "/student/peer-compare", "/student/my-notes", "/student/study-timer", "/student/conflicts", "/student/enrollment-timeline", "/student/quick-add", "/student/calendar"] },
            { label: "账号", hrefs: ["/student/profile", "/student/advisor"] },
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
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isShortcut) {
        event.preventDefault();
        setIsPaletteOpen(true);
      }
      if (event.key === "Escape") {
        setIsPaletteOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
        className={`group mx-2 my-px flex h-9 items-center gap-3 rounded-lg px-3 text-sm no-underline transition ${
          active
            ? "bg-[hsl(221_83%_43%)] font-semibold text-white"
            : "text-[hsl(221_15%_50%)] hover:bg-[hsl(221_40%_96%)] hover:text-[hsl(221_40%_25%)]"
        }`}
      >
        <span className={`inline-flex size-4 items-center justify-center ${active ? "text-white" : "text-current"}`}>
          {item.icon}
        </span>
        <span className="font-medium">{item.label}</span>
        {item.href === "/admin/announcements-mgmt" && announcementCount > 0 ? (
          <span className={`ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${active ? "bg-white/20 text-white" : "bg-violet-500 text-white"}`}>
            {announcementCount}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <div data-area={area} className="min-h-screen bg-slate-50 text-slate-900">
      <SessionExpiryBanner />
      <SkipLink />
      <div
        className={`fixed inset-0 z-40 bg-slate-950/45 transition lg:hidden ${
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside
        role={sidebarOpen ? "dialog" : undefined}
        aria-modal={sidebarOpen ? "true" : undefined}
        aria-label={`${navMeta.label}导航`}
        id={sidebarId}
        className={`app-shell-sidebar no-print fixed inset-y-0 left-0 z-50 w-64 border-r border-[hsl(221_20%_91%)] bg-white text-slate-900 shadow-[0_24px_55px_-40px_rgba(15,23,42,0.4)] transition-transform duration-200 ease-out lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-[hsl(221_20%_91%)] px-5">
          <div className="min-w-0">
            <p className="font-heading text-[1.1rem] font-bold leading-none text-[hsl(221_83%_43%)]">地平线</p>
            <p className="mt-1 text-xs text-slate-500">{navMeta.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="inline-flex size-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="关闭侧栏"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex h-[calc(100%-64px)] flex-col py-4">
          <nav aria-label="主导航">
            {navGroups.map((group) => (
              <div key={group.label} className="mt-4 first:mt-0">
                <p className="px-5 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-[hsl(221_15%_60%)]">
                  {group.label}
                </p>
                <div>{group.items.map(renderNavItem)}</div>
              </div>
            ))}
          </nav>
          <div className="mt-auto border-t border-[hsl(221_20%_91%)] px-4 pt-4">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[hsl(221_83%_43%)] text-sm font-semibold text-white">
                {userInitial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{userLabel}</p>
                <p className="truncate text-xs text-slate-500">{navMeta.label}</p>
              </div>
              <LogoutButton iconOnly compact />
            </div>
          </div>
        </div>
      </aside>

      <div className="relative lg:pl-64">
        <header className="no-print sticky top-0 z-30 border-b border-[hsl(221_20%_91%)] bg-white">
          <div className="mx-auto flex h-14 max-w-[1360px] items-center justify-between px-4 md:px-8 lg:px-10">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <button
                type="button"
                onClick={() => setSidebarOpen((prev) => !prev)}
                className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 lg:hidden"
                aria-label="切换侧栏"
                aria-controls={sidebarId}
                aria-expanded={sidebarOpen}
              >
                <AlignJustify className="size-4" />
              </button>
              <h1 className="truncate text-sm font-semibold text-slate-900">{pageTitle}</h1>
            </div>

            <div className="hidden min-w-0 items-center gap-3 lg:flex">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium tracking-[0.06em] text-slate-500">
                  {breadcrumb}
                </p>
                <h1 className="truncate text-base font-semibold text-slate-900">{pageTitle}</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {area === "student" || area === "admin" ? <NotificationBell /> : null}
              <button
                type="button"
                onClick={() => setIsPaletteOpen(true)}
                className="hidden items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm transition hover:bg-slate-50 lg:inline-flex"
                aria-label="打开命令面板"
              >
                <Search className="size-4" />
                <span>搜索</span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-500">⌘K</span>
              </button>
              <div className="hidden items-center gap-3 lg:flex">
                <div className="min-w-0 text-right">
                  <p className="truncate text-sm font-semibold text-slate-900">{userLabel}</p>
                  <p className="truncate text-xs text-slate-500">{navMeta.label}</p>
                </div>
              </div>
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-[hsl(221_83%_43%)] text-sm font-semibold text-white">
                {userInitial}
              </span>
            </div>
          </div>
        </header>

        <main
          id="main-content"
          className={`mx-auto max-w-[1360px] p-4 md:p-8 lg:p-10 ${area === "student" ? "pb-16 md:pb-0" : ""}`}
        >
          <ErrorBoundary>
            <div style={{ animation: "fadeSlideIn 0.18s ease forwards" }}>{children}</div>
          </ErrorBoundary>
        </main>
      </div>
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        navigationItems={quickNavigation}
        isAdmin={area === "admin"}
      />
      {area === "student" ? <StudentMobileNav /> : null}
    </div>
  );
}
