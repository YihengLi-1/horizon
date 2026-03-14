"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenIcon, CalendarDaysIcon, LayoutDashboardIcon, ShoppingCartIcon, UserIcon } from "lucide-react";

const LINKS = [
  { href: "/student/dashboard", icon: LayoutDashboardIcon, label: "首页" },
  { href: "/student/catalog", icon: BookOpenIcon, label: "课程" },
  { href: "/student/cart", icon: ShoppingCartIcon, label: "购物车" },
  { href: "/student/schedule", icon: CalendarDaysIcon, label: "课表" },
  { href: "/student/profile", icon: UserIcon, label: "我的" },
];

export default function StudentMobileNav() {
  const path = usePathname();

  return (
    <nav
      aria-label="Student mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-slate-200 bg-white md:hidden"
    >
      {LINKS.map(({ href, icon: Icon, label }) => {
        const active = path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors ${
              active ? "text-primary" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
