"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

const COMMANDS = [
  { label: "Dashboard", href: "/student/dashboard", group: "Student", icon: "🏠" },
  { label: "Course Catalog", href: "/student/catalog", group: "Student", icon: "📚" },
  { label: "My Cart", href: "/student/cart", group: "Student", icon: "🛒" },
  { label: "My Schedule", href: "/student/schedule", group: "Student", icon: "📅" },
  { label: "My Grades", href: "/student/grades", group: "Student", icon: "📊" },
  { label: "My Profile", href: "/student/profile", group: "Student", icon: "👤" },
  { label: "Bookmarks", href: "/student/bookmarks", group: "Student", icon: "🔖" },
  { label: "Help", href: "/student/help", group: "Student", icon: "❓" },
  { label: "Admin Dashboard", href: "/admin/dashboard", group: "Admin", icon: "⚙️" },
  { label: "Students", href: "/admin/students", group: "Admin", icon: "👥" },
  { label: "Courses", href: "/admin/courses", group: "Admin", icon: "📖" },
  { label: "Sections", href: "/admin/sections", group: "Admin", icon: "🗂" },
  { label: "Enrollments", href: "/admin/enrollments", group: "Admin", icon: "📋" },
  { label: "Reports", href: "/admin/reports", group: "Admin", icon: "📈" },
  { label: "Announcements", href: "/admin/announcements", group: "Admin", icon: "📢" },
  { label: "Settings", href: "/admin/settings", group: "Admin", icon: "🔧" }
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  const filtered = query
    ? COMMANDS.filter(
        (command) =>
          command.label.toLowerCase().includes(query.toLowerCase()) ||
          command.group.toLowerCase().includes(query.toLowerCase())
      )
    : COMMANDS.slice(0, 8);

  function go(href: string) {
    router.push(href);
    setOpen(false);
    setQuery("");
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages and actions..."
            className="flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 dark:border-slate-600">
            Esc
          </kbd>
        </div>
        <div className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">No results for "{query}"</div>
          ) : (
            filtered.map((command) => (
              <button
                key={command.href}
                type="button"
                onClick={() => go(command.href)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="text-lg">{command.icon}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{command.label}</p>
                  <p className="text-xs text-slate-400">{command.group}</p>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center gap-4 border-t border-slate-100 px-4 py-2 dark:border-slate-700">
          <span className="text-xs text-slate-400">
            <kbd className="font-mono">↵</kbd> Navigate
          </span>
          <span className="text-xs text-slate-400">
            <kbd className="font-mono">Esc</kbd> Close
          </span>
          <span className="ml-auto text-xs text-slate-400">
            <kbd className="font-mono">⌘K</kbd> Toggle
          </span>
        </div>
      </div>
    </div>
  );
}
