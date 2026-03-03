"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { LogoutButton } from "@/components/logout-button";

type AppArea = "student" | "admin";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const studentItems: NavItem[] = [
  { href: "/student/dashboard", label: "Dashboard", icon: "D" },
  { href: "/student/catalog", label: "Catalog", icon: "C" },
  { href: "/student/cart", label: "Cart", icon: "R" },
  { href: "/student/schedule", label: "Schedule", icon: "S" },
  { href: "/student/grades", label: "Grades", icon: "G" },
  { href: "/student/profile", label: "Profile", icon: "P" }
];

const adminItems: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "D" },
  { href: "/admin/sections", label: "Sections", icon: "S" },
  { href: "/admin/terms", label: "Terms", icon: "T" },
  { href: "/admin/courses", label: "Courses", icon: "C" },
  { href: "/admin/students", label: "Students", icon: "U" },
  { href: "/admin/enrollments", label: "Enrollments", icon: "E" },
  { href: "/admin/waitlist", label: "Waitlist", icon: "W" },
  { href: "/admin/invite-codes", label: "Invite Codes", icon: "I" },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: "A" },
  { href: "/admin/import", label: "Import CSV", icon: "M" }
];

const areaMeta: Record<AppArea, { label: string; items: NavItem[] }> = {
  student: { label: "Student Portal", items: studentItems },
  admin: { label: "Admin Console", items: adminItems }
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

  const pageTitle = useMemo(() => {
    const normalizedPath = pathname.replace(/\/+$/, "");
    if (normalizedPath.endsWith("/student")) return "Student Portal";
    if (normalizedPath.endsWith("/admin")) return "Admin Console";

    const segments = normalizedPath.split("/").filter(Boolean);
    const current = segments[segments.length - 1];
    return current ? toTitle(current) : "University SIS";
  }, [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setSidebarOpen(false)}
        className={`group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm no-underline transition ${
          active
            ? "border-amber-300/70 bg-amber-300/15 text-white"
            : "border-transparent text-slate-200 hover:border-white/15 hover:bg-white/10 hover:text-white"
        }`}
      >
        <span
          className={`inline-flex size-6 items-center justify-center rounded-md border text-[11px] font-semibold ${
            active
              ? "border-amber-200/80 bg-white/15 text-amber-100"
              : "border-white/30 bg-white/5 text-slate-200"
          }`}
        >
          {item.icon}
        </span>
        <span className="font-medium">{item.label}</span>
      </Link>
    );
  };

  return (
    <div data-area={area} className="min-h-screen bg-transparent text-slate-900">
      <div
        className={`fixed inset-0 z-40 bg-slate-900/50 transition md:hidden ${
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-blue-950/90 bg-[#0b2343] text-slate-100 shadow-[0_25px_60px_-30px_rgba(2,6,23,0.9)] transition-transform md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-1.5 w-full bg-amber-400" />
        <div className="relative flex h-24 items-center justify-between border-b border-white/10 px-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100/90">Campus Portal</p>
            <p className="font-heading text-2xl font-semibold text-white">University SIS</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-blue-200/70">Academic Services</p>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="inline-flex size-8 items-center justify-center rounded-md border border-white/30 text-slate-100 hover:bg-white/10 md:hidden"
            aria-label="Close sidebar"
          >
            ×
          </button>
        </div>

        <div className="relative flex h-[calc(100%-102px)] flex-col justify-between px-4 py-5">
          <section className="space-y-6">
            <p
              className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-100/80"
            >
              {navMeta.label}
            </p>
            <nav className="space-y-1.5">{navMeta.items.map(renderNavItem)}</nav>
          </section>

          <div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs text-blue-100">
            <p className="font-semibold tracking-wide text-white">{area === "student" ? "Student Services" : "Admin Tools"}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(area === "student"
                ? [
                    { href: "/student/catalog", label: "Catalog" },
                    { href: "/student/cart", label: "Cart" },
                    { href: "/student/schedule", label: "Schedule" }
                  ]
                : [
                    { href: "/admin/sections", label: "Sections" },
                    { href: "/admin/students", label: "Students" },
                    { href: "/admin/import", label: "Import" }
                  ]
              ).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setSidebarOpen(false)}
                  className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[11px] font-medium text-white no-underline transition hover:bg-white/20"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <div className="relative md:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between px-4 md:px-8 lg:px-10">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen((prev) => !prev)}
                className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 md:hidden"
                aria-label="Toggle sidebar"
              >
                ≡
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {area === "student" ? "Student Portal" : "Admin Console"}
                </p>
                <h1 className="font-heading text-lg font-semibold text-slate-900">{pageTitle}</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden h-9 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm sm:inline-flex">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Signed in: {userLabel}
              </span>
              <LogoutButton />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1360px] p-4 md:p-8 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
