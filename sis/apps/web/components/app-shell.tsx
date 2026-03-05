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
  { href: "/student/catalog", label: "Catalog", icon: "C" },
  { href: "/student/cart", label: "Cart", icon: "R" },
  { href: "/student/schedule", label: "Schedule", icon: "S" }
];

const adminItems: NavItem[] = [{ href: "/admin/sections", label: "Sections", icon: "A" }];

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
        className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
          active
            ? "bg-slate-900 text-white shadow-sm"
            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <span
          className={`inline-flex size-6 items-center justify-center rounded-md border text-[11px] font-semibold ${
            active ? "border-white/30 bg-white/10 text-white" : "border-slate-300 bg-white text-slate-600"
          }`}
        >
          {item.icon}
        </span>
        <span className="font-medium">{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div
        className={`fixed inset-0 z-40 bg-slate-900/40 transition md:hidden ${
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-200 bg-white shadow-sm transition-transform md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Brand</p>
            <p className="text-base font-semibold text-slate-900">University SIS</p>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Close sidebar"
          >
            ×
          </button>
        </div>

        <div className="space-y-6 px-4 py-5">
          <section>
            <p
              className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wide ${
                area === "student" ? "text-slate-900" : "text-slate-500"
              }`}
            >
              Student
            </p>
            <nav className="space-y-1">{studentItems.map(renderNavItem)}</nav>
          </section>

          <section>
            <p
              className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wide ${
                area === "admin" ? "text-slate-900" : "text-slate-500"
              }`}
            >
              Admin
            </p>
            <nav className="space-y-1">{adminItems.map(renderNavItem)}</nav>
          </section>
        </div>
      </aside>

      <div className="md:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 md:px-6">
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
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {area === "student" ? "Student Portal" : "Admin Console"}
                </p>
                <h1 className="text-sm font-semibold text-slate-900">{pageTitle}</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700">
                Signed in: {userLabel}
              </span>
              <LogoutButton />
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
