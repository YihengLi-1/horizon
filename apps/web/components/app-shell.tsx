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
  ShoppingCart,
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

type AppArea = "student" | "admin";

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
  { href: "/student/cart", label: "Cart", icon: <ShoppingCart className={iconClass} /> },
  { href: "/student/schedule", label: "Schedule", icon: <CalendarDays className={iconClass} /> },
  { href: "/student/grades", label: "Grades", icon: <GraduationCap className={iconClass} /> },
  { href: "/student/calendar", label: "Calendar", icon: <CalendarRange className={iconClass} /> },
  { href: "/student/history", label: "History", icon: <History className={iconClass} /> },
  { href: "/student/bookmarks", label: "Bookmarks", icon: <Bookmark className={iconClass} /> },
  { href: "/student/contact", label: "Contact", icon: <Mail className={iconClass} /> },
  { href: "/student/profile", label: "Profile", icon: <User className={iconClass} /> },
  { href: "/student/help", label: "Help", icon: <HelpCircle className={iconClass} /> }
];

const adminItems: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: <LayoutDashboard className={iconClass} /> },
  { href: "/admin/sections", label: "Sections", icon: <ListChecks className={iconClass} /> },
  { href: "/admin/terms", label: "Terms", icon: <CalendarRange className={iconClass} /> },
  { href: "/admin/courses", label: "Courses", icon: <BookCopy className={iconClass} /> },
  { href: "/admin/students", label: "Students", icon: <Users className={iconClass} /> },
  { href: "/admin/enrollments", label: "Enrollments", icon: <GraduationCap className={iconClass} /> },
  { href: "/admin/sessions", label: "Sessions", icon: <Shield className={iconClass} /> },
  { href: "/admin/waitlist", label: "Waitlist", icon: <Clock className={iconClass} /> },
  { href: "/admin/invite-codes", label: "Invite Codes", icon: <KeyRound className={iconClass} /> },
  { href: "/admin/announcements", label: "Announcements", icon: <Megaphone className={iconClass} /> },
  { href: "/admin/notifications", label: "Notifications", icon: <Bell className={iconClass} /> },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: <ScrollText className={iconClass} /> },
  { href: "/admin/reports", label: "Reports", icon: <BarChart3 className={iconClass} /> },
  { href: "/admin/import", label: "Import CSV", icon: <Upload className={iconClass} /> },
  { href: "/admin/settings", label: "Settings", icon: <Settings className={iconClass} /> }
];

const areaMeta: Record<AppArea, { label: string; items: NavItem[]; subtitle: string }> = {
  student: { label: "Student Portal", items: studentItems, subtitle: "Academic Planning & Registration" },
  admin: { label: "Admin Console", items: adminItems, subtitle: "Records & Enrollment Operations" }
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
            { label: "Overview", hrefs: ["/admin/dashboard"] },
            { label: "Data", hrefs: ["/admin/students", "/admin/courses", "/admin/sections", "/admin/terms"] },
            { label: "Operations", hrefs: ["/admin/enrollments", "/admin/sessions", "/admin/waitlist"] },
            { label: "Tools", hrefs: ["/admin/invite-codes", "/admin/announcements", "/admin/notifications", "/admin/import", "/admin/audit-logs", "/admin/reports", "/admin/settings"] }
          ]
        : [
            { label: "Overview", hrefs: ["/student/dashboard", "/student/notifications", "/student/announcements"] },
            { label: "Registration", hrefs: ["/student/catalog", "/student/cart", "/student/schedule"] },
            { label: "Academic", hrefs: ["/student/grades", "/student/calendar", "/student/history", "/student/bookmarks", "/student/contact", "/student/profile", "/student/help"] }
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
            ? "border-primary bg-primary/10 text-primary font-semibold"
            : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <span
          className={`inline-flex size-7 items-center justify-center rounded-md border ${
            active
              ? "border-primary/30 bg-primary/10 text-primary"
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
              <p className="mt-0.5">{area === "student" ? "Student Services" : "Administrative Services"}</p>
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
                <NotificationBell apiBase={process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"} />
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
