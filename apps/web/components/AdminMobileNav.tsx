"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  ShieldAlert,
  Users
} from "lucide-react";

const LINKS = [
  { href: "/admin/dashboard", icon: LayoutDashboard, label: "概览" },
  { href: "/admin/students", icon: Users, label: "学生" },
  { href: "/admin/sections", icon: ListChecks, label: "教学班" },
  { href: "/admin/enrollments", icon: GraduationCap, label: "注册" },
  { href: "/admin/appeals", icon: ShieldAlert, label: "审批" }
];

export default function AdminMobileNav() {
  const path = usePathname();

  return (
    <nav
      aria-label="管理员移动导航"
      className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-slate-200 bg-white md:hidden"
    >
      {LINKS.map(({ href, icon: Icon, label }) => {
        const active = path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors ${
              active ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
