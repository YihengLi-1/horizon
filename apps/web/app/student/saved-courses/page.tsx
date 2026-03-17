"use client";

import Link from "next/link";
import { Star, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { apiFetch } from "@/lib/api";

type SavedCourse = {
  courseId: string;
  code: string;
  title: string;
  credits: number;
};

type Term = {
  id: string;
  name: string;
};

type Section = {
  id: string;
  sectionCode: string;
  course: {
    id: string;
  };
};

const STORAGE_KEY = "saved_courses";

function readSavedCourses(): SavedCourse[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export default function SavedCoursesPage() {
  const toast = useToast();
  const [savedCourses, setSavedCourses] = useState<SavedCourse[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingCourseId, setAddingCourseId] = useState("");

  useEffect(() => {
    setSavedCourses(readSavedCourses());
    const onStorage = () => setSavedCourses(readSavedCourses());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms")
      .then((data) => {
        const nextTerms = data ?? [];
        setTerms(nextTerms);
        setTermId(nextTerms[0]?.id ?? "");
      })
      .catch(() => setTerms([]));
  }, []);

  useEffect(() => {
    if (!termId) {
      setSections([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void apiFetch<Section[]>(`/academics/sections?termId=${termId}`)
      .then((data) => setSections(data ?? []))
      .catch(() => setSections([]))
      .finally(() => setLoading(false));
  }, [termId]);

  const courseSectionMap = useMemo(() => {
    const map = new Map<string, Section>();
    for (const section of sections) {
      if (!map.has(section.course.id)) {
        map.set(section.course.id, section);
      }
    }
    return map;
  }, [sections]);

  const clearAll = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setSavedCourses([]);
    toast.info("已清空收藏课程");
  };

  const removeOne = (courseId: string) => {
    const next = savedCourses.filter((item) => item.courseId !== courseId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSavedCourses(next);
  };

  const addToCart = async (course: SavedCourse) => {
    const section = courseSectionMap.get(course.courseId);
    if (!section || !termId) {
      toast.warning("当前学期没有可加入购物车的教学班");
      return;
    }
    setAddingCourseId(course.courseId);
    try {
      await apiFetch("/registration/cart", {
        method: "POST",
        body: JSON.stringify({ termId, sectionId: section.id })
      });
      toast.success(`${course.code} 已加入购物车`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加入购物车失败");
    } finally {
      setAddingCourseId("");
    }
  };

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="campus-eyebrow">Saved Courses</p>
            <h1 className="campus-title">我的收藏课程</h1>
            <p className="text-sm text-slate-600 md:text-base">把常看的课程收进一处，之后直接加入购物车。</p>
          </div>
          <div className="flex gap-2">
            <select className="campus-select" value={termId} onChange={(event) => setTermId(event.target.value)}>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={clearAll} className="campus-chip chip-red">
              清空收藏
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="campus-card p-6 text-sm text-slate-500">加载中…</div>
      ) : savedCourses.length === 0 ? (
        <div className="campus-card">
          <div className="campus-empty">
            <ShoppingCart className="campus-empty-icon" />
            <div className="campus-empty-title">还没有收藏课程</div>
            <div className="campus-empty-desc">前往课程目录点击星标，把感兴趣的课程收进这里。</div>
            <Link href="/student/catalog" className="campus-chip chip-blue">
              浏览课程
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {savedCourses.map((course) => {
            const section = courseSectionMap.get(course.courseId);
            return (
              <article key={course.courseId} className="campus-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Star className="size-4 text-amber-500" fill="currentColor" />
                      <span className="font-mono text-sm font-semibold text-slate-600">{course.code}</span>
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-slate-900">{course.title}</h2>
                  </div>
                  <span className="campus-chip chip-blue">{course.credits} 学分</span>
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  {section ? `当前学期可用教学班：§${section.sectionCode}` : "当前学期暂无可加入购物车的教学班"}
                </p>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => removeOne(course.courseId)}
                    className="campus-chip chip-red"
                  >
                    取消收藏
                  </button>
                  <button
                    type="button"
                    disabled={!section || addingCourseId === course.courseId}
                    onClick={() => void addToCart(course)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[hsl(221_83%_43%)] bg-white px-4 text-sm font-semibold text-[hsl(221_83%_43%)] transition hover:bg-[hsl(221_83%_43%)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {addingCourseId === course.courseId ? (
                      <span className="size-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                    ) : (
                      <ShoppingCart className="size-4" />
                    )}
                    加入购物车
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
