"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

const COMMANDS = [
  { id: "student-dashboard", label: "Dashboard", path: "/student/dashboard", group: "Student", role: "student", icon: "🏠" },
  { id: "student-catalog", label: "Course Catalog", path: "/student/catalog", group: "Student", role: "student", icon: "📚" },
  { id: "student-cart", label: "My Cart", path: "/student/cart", group: "Student", role: "student", icon: "🛒" },
  { id: "student-schedule", label: "My Schedule", path: "/student/schedule", group: "Student", role: "student", icon: "📅" },
  { id: "student-grades", label: "My Grades", path: "/student/grades", group: "Student", role: "student", icon: "📊" },
  { id: "student-profile", label: "My Profile", path: "/student/profile", group: "Student", role: "student", icon: "👤" },
  { id: "bookmarks", label: "My Bookmarks", path: "/student/bookmarks", group: "Student", role: "student", icon: "🔖" },
  { id: "calendar", label: "Academic Calendar", path: "/student/calendar", group: "Student", role: "student", icon: "🗓️" },
  { id: "history", label: "Enrollment History", path: "/student/history", group: "Student", role: "student", icon: "🕘" },
  { id: "help", label: "Help", path: "/student/help", group: "Student", role: "student", icon: "❓" },
  { id: "admin-dashboard", label: "Admin Dashboard", path: "/admin/dashboard", group: "Admin", role: "admin", icon: "⚙️" },
  { id: "admin-students", label: "Students", path: "/admin/students", group: "Admin", role: "admin", icon: "👥" },
  { id: "admin-courses", label: "Courses", path: "/admin/courses", group: "Admin", role: "admin", icon: "📖" },
  { id: "admin-sections", label: "Sections", path: "/admin/sections", group: "Admin", role: "admin", icon: "🗂" },
  { id: "admin-enrollments", label: "Enrollments", path: "/admin/enrollments", group: "Admin", role: "admin", icon: "📋" },
  { id: "admin-holds", label: "Student Holds", path: "/admin/holds", group: "Admin", role: "admin", icon: "🛑" },
  { id: "admin-requests", label: "Approval Requests", path: "/admin/requests", group: "Admin", role: "admin", icon: "🪪" },
  { id: "reports", label: "Admin Reports", path: "/admin/reports", group: "Admin", role: "admin", icon: "📈" },
  { id: "announcements", label: "Announcements", path: "/admin/announcements", group: "Admin", role: "admin", icon: "📢" },
  { id: "settings", label: "System Settings", path: "/admin/settings", group: "Admin", role: "admin", icon: "🔧" }
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
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

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  function go(path: string) {
    router.push(path);
    setOpen(false);
    setQuery("");
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
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
        <div role="listbox" className="max-h-72 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">No results for "{query}"</div>
          ) : (
            filtered.map((command, index) => (
              <button
                key={command.id}
                type="button"
                onClick={() => go(command.path)}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
                aria-selected={index === activeIndex}
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
