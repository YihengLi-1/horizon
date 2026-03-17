"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

type NavResult = {
  type: "nav";
  id: string;
  label: string;
  href: string;
};

type StudentResult = {
  type: "student";
  id: string;
  label: string;
  subtitle: string;
  href: string;
};

type CourseResult = {
  type: "course";
  id: string;
  label: string;
  subtitle: string;
  href: string;
};

type ResultItem = NavResult | StudentResult | CourseResult;

type ResultGroup = {
  key: string;
  label: string;
  items: ResultItem[];
};

type QuickNavItem = {
  href: string;
  label: string;
};

function FileTextIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

function BookOpenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function groupIcon(type: ResultItem["type"]): ReactNode {
  if (type === "student") return <UserIcon />;
  if (type === "course") return <BookOpenIcon />;
  return <FileTextIcon />;
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={`${part}-${index}`} className="rounded-[2px] bg-[hsl(221_83%_43%_/_0.15)] px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    )
  );
}

export function CommandPalette({
  isOpen,
  onClose,
  navigationItems,
  isAdmin
}: {
  isOpen: boolean;
  onClose: () => void;
  navigationItems: QuickNavItem[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<StudentResult[]>([]);
  const [courses, setCourses] = useState<CourseResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setStudents([]);
      setCourses([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const normalized = query.trim();
    if (!normalized) {
      setStudents([]);
      setCourses([]);
      setLoadingStudents(false);
      setLoadingCourses(false);
      return;
    }

    const timer = window.setTimeout(() => {
      if (isAdmin) {
        setLoadingStudents(true);
        void apiFetch<{ data: Array<{ id: string; email: string; studentId: string | null; studentProfile?: { legalName?: string | null } | null }> }>(
          `/admin/students?search=${encodeURIComponent(normalized)}&pageSize=5`
        )
          .then((payload) => {
            const items = (payload?.data ?? []).slice(0, 5).map((student) => ({
              type: "student" as const,
              id: student.id,
              label: student.studentProfile?.legalName?.trim() || student.email,
              subtitle: `${student.email}${student.studentId ? ` · ${student.studentId}` : ""}`,
              href: `/admin/students?search=${encodeURIComponent(normalized)}`
            }));
            setStudents(items);
          })
          .catch(() => setStudents([]))
          .finally(() => setLoadingStudents(false));
      }

      setLoadingCourses(true);
      void apiFetch<Array<{ id: string; code: string; title: string }>>("/academics/courses")
        .then((items) => {
          const filtered = (items ?? [])
            .filter((course) => `${course.code} ${course.title}`.toLowerCase().includes(normalized.toLowerCase()))
            .slice(0, 5)
            .map((course) => ({
              type: "course" as const,
              id: course.id,
              label: `${course.code} · ${course.title}`,
              subtitle: course.code,
              href: `/student/catalog?search=${encodeURIComponent(course.code)}`
            }));
          setCourses(filtered);
        })
        .catch(() => setCourses([]))
        .finally(() => setLoadingCourses(false));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [isAdmin, isOpen, query]);

  const quickNav = useMemo<NavResult[]>(() => {
    const normalized = query.trim().toLowerCase();
    return navigationItems
      .filter((item) => !normalized || item.label.toLowerCase().includes(normalized) || item.href.toLowerCase().includes(normalized))
      .slice(0, 8)
      .map((item) => ({
        type: "nav" as const,
        id: item.href,
        label: item.label,
        href: item.href
      }));
  }, [navigationItems, query]);

  const groups = useMemo<ResultGroup[]>(() => {
    const nextGroups: ResultGroup[] = [{ key: "nav", label: "快速导航", items: quickNav }];
    if (isAdmin) {
      nextGroups.push({ key: "students", label: "学生", items: students });
    }
    nextGroups.push({ key: "courses", label: "课程", items: courses });
    return nextGroups.filter((group) => group.items.length > 0);
  }, [courses, isAdmin, quickNav, students]);

  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  useEffect(() => {
    if (!flatItems.length) {
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex((current) => Math.min(current, flatItems.length - 1));
  }, [flatItems]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (flatItems.length > 0) setSelectedIndex((current) => (current + 1) % flatItems.length);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (flatItems.length > 0) setSelectedIndex((current) => (current - 1 + flatItems.length) % flatItems.length);
      }
      if (event.key === "Enter") {
        const target = flatItems[selectedIndex];
        if (!target) return;
        event.preventDefault();
        router.push(target.href);
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flatItems, isOpen, onClose, router, selectedIndex]);

  if (!isOpen) return null;

  const isLoading = loadingStudents || loadingCourses;
  const empty = !groups.length && !isLoading;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-slate-950/30 px-4 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-4 py-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索页面、学生、课程..."
            className="campus-input w-full border-none px-0 shadow-none focus:ring-0"
          />
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-3 py-3">
          {groups.map((group) => (
            <div key={group.key} className="mb-4 last:mb-0">
              <p className="px-2 pb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-400">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const flatIndex = flatItems.findIndex((candidate) => candidate.id === item.id && candidate.type === item.type);
                  const active = flatIndex === selectedIndex;
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(flatIndex)}
                      onClick={() => {
                        router.push(item.href);
                        onClose();
                      }}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition ${
                        active ? "bg-[hsl(221_40%_96%)] text-[hsl(221_40%_20%)]" : "hover:bg-slate-50"
                      }`}
                    >
                      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                        {groupIcon(item.type)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{highlight(item.label, query)}</span>
                        {"subtitle" in item ? <span className="block truncate text-xs text-slate-500">{highlight(item.subtitle, query)}</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {isLoading ? (
            <div className="campus-empty py-10">
              <div className="skeleton h-10 w-10 rounded-full" />
              <div className="skeleton skeleton-title w-32" />
              <div className="skeleton skeleton-text w-48" />
            </div>
          ) : null}

          {empty ? (
            <div className="campus-empty py-10">
              <div className="campus-empty-icon rounded-full border border-slate-200 bg-slate-50" />
              <div className="campus-empty-title">未找到</div>
              <div className="campus-empty-desc">换个关键词试试，或者直接从侧边栏进入页面。</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
