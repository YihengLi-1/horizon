"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlignJustify,
  BookCopy,
  BookOpen,
  CalendarDays,
  CalendarRange,
  GraduationCap,
  Home,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  ShoppingCart,
  Upload,
  X,
  User,
  Users
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";

type AppArea = "student" | "admin";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

const iconClass = "size-4";

const studentItems: NavItem[] = [
  { href: "/student/dashboard", label: "Dashboard", icon: <Home className={iconClass} /> },
  { href: "/student/catalog", label: "Catalog", icon: <BookOpen className={iconClass} /> },
  { href: "/student/cart", label: "Cart", icon: <ShoppingCart className={iconClass} /> },
  { href: "/student/schedule", label: "Schedule", icon: <CalendarDays className={iconClass} /> },
  { href: "/student/grades", label: "Grades", icon: <GraduationCap className={iconClass} /> },
  { href: "/student/profile", label: "Profile", icon: <User className={iconClass} /> }
];

const adminItems: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: <LayoutDashboard className={iconClass} /> },
  { href: "/admin/sections", label: "Sections", icon: <ListChecks className={iconClass} /> },
  { href: "/admin/terms", label: "Terms", icon: <CalendarRange className={iconClass} /> },
  { href: "/admin/courses", label: "Courses", icon: <BookCopy className={iconClass} /> },
  { href: "/admin/students", label: "Students", icon: <Users className={iconClass} /> },
  { href: "/admin/enrollments", label: "Enrollments", icon: <GraduationCap className={iconClass} /> },
  { href: "/admin/waitlist", label: "Waitlist", icon: <ListChecks className={iconClass} /> },
  { href: "/admin/invite-codes", label: "Invite Codes", icon: <KeyRound className={iconClass} /> },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: <ScrollText className={iconClass} /> },
  { href: "/admin/import", label: "Import CSV", icon: <Upload className={iconClass} /> }
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
  const navMeta = areaMeta[area];
  const sidebarId = `${area}-sidebar-nav`;

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

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setSidebarOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm no-underline transition ${
          active
            ? "bg-slate-900 text-white shadow-sm"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <span
          className={`inline-flex size-7 items-center justify-center rounded-md border ${
            active
              ? "border-slate-700 bg-slate-800 text-white"
              : "border-slate-200 bg-white text-slate-500 group-hover:border-slate-300 group-hover:text-slate-700"
          }`}
        >
          {item.icon}
        </span>
        <span className="font-medium">{item.label}</span>
      </Link>
    );
  };

  return (
    <div data-area={area} className="min-h-screen bg-slate-50 text-slate-900">
      <a
        href="#main-content"
        className="sr-only z-[70] rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to main content
      </a>
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
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-200 bg-white text-slate-900 shadow-[0_26px_55px_-36px_rgba(15,23,42,0.65)] transition-transform md:block md:translate-x-0 ${
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
          <nav className="space-y-1.5">{navMeta.items.map(renderNavItem)}</nav>
          <div className="mt-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            Signed in area: {area === "student" ? "Student Services" : "Administrative Services"}
          </div>
        </div>
      </aside>

      <div className="relative md:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200/85 bg-white/95 backdrop-blur-md">
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
              <span className="hidden h-9 items-center rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm sm:inline-flex">
                Signed in: {userLabel}
              </span>
              <LogoutButton />
            </div>
          </div>
        </header>

        <main id="main-content" className="mx-auto max-w-[1360px] p-4 md:p-8 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
