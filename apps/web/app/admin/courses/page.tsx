"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import PrereqGraph from "@/components/PrereqGraph";

type Course = {
  id: string;
  code: string;
  title: string;
  credits: number;
  weeklyHours?: number | null;
  description?: string | null;
  prerequisiteLinks?: Array<{ prerequisiteCourse?: { id?: string; code?: string } }>;
};

type EditForm = {
  code: string;
  title: string;
  credits: number;
  weeklyHours: number | "";
  description: string;
  prerequisiteCourseIds: string[];
};

const PAGE_SIZE = 50;

function getDept(code: string): string {
  const match = code.trim().toUpperCase().match(/^[A-Z]+/);
  return match?.[0] ?? "OTHER";
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [form, setForm] = useState({ code: "", title: "", credits: 3, weeklyHours: "" as number | "", description: "", prerequisiteCourseIds: [] as string[] });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterDept, setFilterDept] = useState("ALL");
  const [filterCredits, setFilterCredits] = useState("ALL");
  const [filterPrereq, setFilterPrereq] = useState("ALL"); // ALL | WITH | WITHOUT
  const [sortCol, setSortCol] = useState<"code" | "title" | "credits" | "prereqs">("code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  // Press "/" to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA" && document.activeElement?.tagName !== "SELECT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const [graphCourseId, setGraphCourseId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ code: "", title: "", credits: 3, weeklyHours: "", description: "", prerequisiteCourseIds: [] });
  const [savingEdit, setSavingEdit] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<Course[]>("/admin/courses");
      setCourses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "课程加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      setCreating(true);
      await apiFetch("/admin/courses", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          title: form.title,
          credits: Number(form.credits),
          weeklyHours: form.weeklyHours !== "" ? Number(form.weeklyHours) : null,
          description: form.description || null,
          prerequisiteCourseIds: form.prerequisiteCourseIds
        })
      });
      setForm({ code: "", title: "", credits: 3, weeklyHours: "", description: "", prerequisiteCourseIds: [] });
      setNotice("课程创建成功。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (course: Course) => {
    setEditingId(course.id);
    setEditForm({
      code: course.code,
      title: course.title,
      credits: course.credits,
      weeklyHours: course.weeklyHours ?? "",
      description: course.description ?? "",
      prerequisiteCourseIds: (course.prerequisiteLinks ?? [])
        .map((link) => link.prerequisiteCourse?.id)
        .filter((id): id is string => Boolean(id))
    });
    setError("");
    setNotice("");
  };

  const cancelEdit = () => setEditingId(null);

  const onSaveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    setError("");
    setNotice("");
    try {
      setSavingEdit(true);
      await apiFetch(`/admin/courses/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          code: editForm.code,
          title: editForm.title,
          credits: Number(editForm.credits),
          weeklyHours: editForm.weeklyHours !== "" ? Number(editForm.weeklyHours) : null,
          description: editForm.description || null,
          prerequisiteCourseIds: editForm.prerequisiteCourseIds
        })
      });
      setEditingId(null);
      setNotice("课程更新成功。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    } finally {
      setSavingEdit(false);
    }
  };

  const onDelete = async (id: string, code: string) => {
    if (!confirm(`确认删除课程 "${code}"？此操作无法撤销。`)) return;
    try {
      setError("");
      setNotice("");
      await apiFetch(`/admin/courses/${id}`, { method: "DELETE" });
      setNotice(`课程「${code}」已删除。`);
      if (editingId === id) setEditingId(null);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败";
      setError(message);
    }
  };

  const creditOptions = useMemo(
    () => Array.from(new Set(courses.map((c) => c.credits))).sort((a, b) => a - b),
    [courses]
  );

  const deptOptions = useMemo(
    () => Array.from(new Set(courses.map((c) => getDept(c.code)))).sort((a, b) => a.localeCompare(b)),
    [courses]
  );

  const stats = useMemo(() => {
    const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);
    const withPrereq   = courses.filter((c) => (c.prerequisiteLinks ?? []).length > 0).length;
    const byCredits    = creditOptions.map((cr) => ({ cr, count: courses.filter((c) => c.credits === cr).length }));
    return {
      total:      courses.length,
      avg:        courses.length > 0 ? (totalCredits / courses.length).toFixed(1) : "0.0",
      withPrereq,
      noPrereq:   courses.length - withPrereq,
      byCredits
    };
  }, [courses, creditOptions]);

  const visibleCourses = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let list = courses.filter((c) => {
      if (q && !`${c.code} ${c.title} ${c.description ?? ""}`.toLowerCase().includes(q)) return false;
      if (filterDept !== "ALL" && getDept(c.code) !== filterDept) return false;
      if (filterCredits !== "ALL" && c.credits !== Number(filterCredits)) return false;
      const hasPre = (c.prerequisiteLinks ?? []).length > 0;
      if (filterPrereq === "WITH"    && !hasPre) return false;
      if (filterPrereq === "WITHOUT" &&  hasPre) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortCol) {
        case "title":   return dir * a.title.localeCompare(b.title);
        case "credits": return dir * (a.credits - b.credits);
        case "prereqs": return dir * ((a.prerequisiteLinks?.length ?? 0) - (b.prerequisiteLinks?.length ?? 0));
        default:        return dir * a.code.localeCompare(b.code);
      }
    });

    return list;
  }, [courses, debouncedSearch, filterDept, filterCredits, filterPrereq, sortCol, sortDir]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, filterDept, filterCredits, filterPrereq, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(visibleCourses.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedCourses = visibleCourses.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportCsv = () => {
    const rows = [
      ["课程代码", "名称", "学分", "课程简介", "先修课"],
      ...visibleCourses.map((c) => [
        c.code,
        c.title,
        String(c.credits),
        c.description ?? "",
        (c.prerequisiteLinks ?? [])
          .map((link) => link.prerequisiteCourse?.code)
          .filter(Boolean)
          .join("; ")
      ])
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `courses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">课程目录管理</p>
            <h1 className="campus-title">课程管理</h1>
            <p className="text-sm text-slate-600 md:text-base">
              维护课程定义、学分值及先修课关联，用于注册校验。
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip chip-emerald">{stats.total} 门课程</span>
              <span className="campus-chip chip-purple">均 {stats.avg} 学分</span>
              {stats.withPrereq > 0 && (
                <span className="campus-chip chip-blue">{stats.withPrereq} 门有先修要求</span>
              )}
              {visibleCourses.length !== courses.length && (
                <span className="campus-chip chip-amber">{visibleCourses.length} 门可见</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={visibleCourses.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              CSV 导出
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
            >
              刷新
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">课程总数</p>
          <p className="campus-kpi-value">{stats.total}</p>
          <p className="text-[11px] text-slate-400">均 {stats.avg} 学分</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label text-emerald-700">无先修要求</p>
          <p className="campus-kpi-value text-emerald-700">{stats.noPrereq}</p>
          <p className="text-[11px] text-emerald-500">开放注册</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label text-blue-700">有先修要求</p>
          <p className="campus-kpi-value text-blue-700">{stats.withPrereq}</p>
          <p className="text-[11px] text-blue-500">有资格限制</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">学分分布</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {stats.byCredits.map(({ cr, count }) => (
              <span key={cr} className="campus-chip chip-purple gap-1 rounded-lg px-2 py-0.5">
                <span className="font-semibold">{cr}cr</span>
                <span className="text-slate-400">×{count}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="campus-card p-5 md:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">新增课程</h2>
          <button
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {showCreateForm ? "收起" : "展开"}
          </button>
        </div>
        {showCreateForm ? (
        <form className="grid gap-3 md:grid-cols-5" onSubmit={onCreate}>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">课程代码</label>
            <input
              className="campus-input"
              placeholder="CS301"
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">课程名称</label>
            <input
              className="campus-input"
              placeholder="如：算法设计"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">学分</label>
            <input
              className="campus-input"
              type="number"
              min={1}
              value={form.credits}
              onChange={(e) => setForm((p) => ({ ...p, credits: Number(e.target.value) }))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">每周课时</label>
            <input
              className="campus-input"
              type="number"
              min={0.5}
              step={0.5}
              placeholder="如：8"
              value={form.weeklyHours}
              onChange={(e) => setForm((p) => ({ ...p, weeklyHours: e.target.value === "" ? "" : Number(e.target.value) }))}
            />
          </div>
          <div className="md:flex md:items-end">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  创建中
                </>
              ) : (
                "创建课程"
              )}
            </button>
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-semibold text-slate-500">课程简介</label>
            <input
              className="campus-input"
              placeholder="课程简介（选填）"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">先修课程</label>
            <select
              multiple
              className="campus-input min-h-[80px]"
              value={form.prerequisiteCourseIds}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                setForm((p) => ({ ...p, prerequisiteCourseIds: selected }));
              }}
            >
              {courses
                .filter((c) => c.code !== form.code)
                .sort((a, b) => a.code.localeCompare(b.code))
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
                ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">按住 Cmd/Ctrl 可多选</p>
          </div>
        </form>
        ) : null}
      </section>

      {editingId ? (
        <section className="campus-card border-blue-200 bg-blue-50/60 p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-blue-900">编辑：{editForm.code}</h2>
            <button type="button" onClick={cancelEdit} className="text-sm font-medium text-blue-700 underline underline-offset-2">
              取消
            </button>
          </div>
          <form className="grid gap-3 md:grid-cols-5" onSubmit={onSaveEdit}>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">课程代码</label>
              <input
                className="campus-input"
                value={editForm.code}
                onChange={(e) => setEditForm((p) => ({ ...p, code: e.target.value }))}
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">课程名称</label>
              <input
                className="campus-input"
                value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">学分</label>
              <input
                className="campus-input"
                type="number"
                min={1}
                value={editForm.credits}
                onChange={(e) => setEditForm((p) => ({ ...p, credits: Number(e.target.value) }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">每周课时</label>
              <input
                className="campus-input"
                type="number"
                min={0.5}
                step={0.5}
                placeholder="如：8"
                value={editForm.weeklyHours}
                onChange={(e) => setEditForm((p) => ({ ...p, weeklyHours: e.target.value === "" ? "" : Number(e.target.value) }))}
              />
            </div>
            <div className="md:flex md:items-end">
              <button
                type="submit"
                disabled={savingEdit}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingEdit ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    保存中…
                  </>
                ) : (
                  "保存更改"
                )}
              </button>
            </div>
            <div className="md:col-span-3">
              <label className="mb-1 block text-xs font-semibold text-slate-500">课程简介</label>
              <input
                className="campus-input"
                placeholder="课程简介（选填）"
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">先修课程</label>
              <select
                multiple
                className="campus-input min-h-[80px]"
                value={editForm.prerequisiteCourseIds}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                  setEditForm((p) => ({ ...p, prerequisiteCourseIds: selected }));
                }}
              >
                {courses
                  .filter((c) => c.id !== editingId)
                  .sort((a, b) => a.code.localeCompare(b.code))
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
                  ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">按住 Cmd/Ctrl 可多选</p>
            </div>
          </form>
        </section>
      ) : null}

      <section className="campus-toolbar">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">搜索</span>
            <input
              ref={searchRef}
              className="campus-input"
              placeholder="课程代码、名称、描述…  [/]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">院系</span>
            <select className="campus-select" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
              <option value="ALL">全部院系</option>
              {deptOptions.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">学分</span>
            <select className="campus-select" value={filterCredits} onChange={(e) => setFilterCredits(e.target.value)}>
              <option value="ALL">全部学分</option>
              {creditOptions.map((cr) => <option key={cr} value={cr}>{cr} cr</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-500">先修课程</span>
            <select className="campus-select" value={filterPrereq} onChange={(e) => setFilterPrereq(e.target.value)}>
              <option value="ALL">全部课程</option>
              <option value="WITHOUT">无先修课</option>
              <option value="WITH">有先修课</option>
            </select>
          </label>
        </div>
        {(search || filterDept !== "ALL" || filterCredits !== "ALL" || filterPrereq !== "ALL") ? (
          <div className="mt-2 flex items-center gap-2">
            <p className="text-xs text-slate-500">已筛选 {visibleCourses.length} / {courses.length} 门课程</p>
            <button
              type="button"
              onClick={() => { setSearch(""); setDebouncedSearch(""); setFilterDept("ALL"); setFilterCredits("ALL"); setFilterPrereq("ALL"); }}
              className="text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
            >
              清除筛选
            </button>
          </div>
        ) : null}
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      <section className="campus-card overflow-hidden">
        <div className="max-h-[560px] overflow-auto rounded-3xl">
          <table className="campus-table text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                {(["code", "title", "credits", "prereqs"] as const).map((col) => (
                  <th key={col}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col)}
                      className={`flex items-center gap-1 text-xs font-semibold transition-colors ${sortCol === col ? "text-slate-900" : "text-slate-400 hover:text-slate-700"}`}
                    >
                      {{ code: "课程代码", title: "名称", credits: "学分", prereqs: "先修课" }[col]}
                      <span className="text-[9px] leading-none">
                        {sortCol === col ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                      </span>
                    </button>
                  </th>
                ))}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    加载课程中...
                  </td>
                </tr>
              ) : visibleCourses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <p className="text-3xl">📚</p>
                    <p className="mt-2 text-sm font-medium text-slate-600">
                      {courses.length === 0 ? "暂无课程" : "没有匹配的课程"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {courses.length === 0 ? "使用上方表单创建第一门课程。" : "请清除搜索词或筛选条件。"}
                    </p>
                  </td>
                </tr>
              ) : (
                pagedCourses.map((course) => (
                  <tr
                    key={course.id}
                    className={`border-b border-slate-100 hover:bg-slate-100/60 ${editingId === course.id ? "bg-blue-50/40 outline outline-1 outline-blue-200" : "odd:bg-white even:bg-slate-50/40"}`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-semibold text-slate-900">{course.code}</span>
                    </td>
                    <td
                      className="px-4 py-3 text-slate-700"
                      onDoubleClick={() => startEdit(course)}
                      title="双击编辑名称"
                    >
                      <p className="font-medium">{course.title}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                        {getDept(course.code)}
                      </p>
                      {(course.prerequisiteLinks ?? []).length > 0 ? (
                        <p className="mt-1 text-xs text-slate-400">
                          先修: {(course.prerequisiteLinks ?? [])
                            .map((item) => item.prerequisiteCourse?.code)
                            .filter((code): code is string => Boolean(code))
                            .join(", ")}
                        </p>
                      ) : null}
                      {course.description ? <p className="mt-0.5 text-xs text-slate-400 line-clamp-1">{course.description}</p> : null}
                    </td>
                    <td
                      className="px-4 py-3"
                      onDoubleClick={() => startEdit(course)}
                      title="双击编辑学分"
                    >
                      <span className={`campus-chip items-center px-2 py-0.5 text-xs ${
                        course.credits >= 4
                          ? "chip-purple"
                          : course.credits === 3
                          ? "chip-blue"
                          : "chip-amber"
                      }`}>
                        {course.credits} 学分
                      </span>
                      {course.weeklyHours ? (
                        <span className="ml-1 text-xs text-slate-400">{course.weeklyHours}h/wk</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const prereqCodes = (course.prerequisiteLinks ?? [])
                          .map((item) => item.prerequisiteCourse?.code)
                          .filter((code): code is string => Boolean(code));
                        if (prereqCodes.length === 0) {
                          return <span className="text-slate-300">无先修课</span>;
                        }
                        return (
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
                              {prereqCodes.map((code, index) => (
                                <span key={code}>
                                  {index > 0 ? <span className="mx-1 text-slate-300">→</span> : null}
                                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                                    {code}
                                  </span>
                                </span>
                              ))}
                              <button
                                type="button"
                                onClick={() => setGraphCourseId(graphCourseId === course.id ? null : course.id)}
                                className="ml-1 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100"
                              >
                                {graphCourseId === course.id ? "隐藏图谱" : "关系图"}
                              </button>
                            </div>
                            {graphCourseId === course.id && (
                              <PrereqGraph courseId={course.id} courses={courses} />
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => editingId === course.id ? cancelEdit() : startEdit(course)}
                          className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          {editingId === course.id ? "取消" : "编辑"}
                        </button>
                        <a
                          href={`/admin/sections?search=${encodeURIComponent(course.code)}`}
                          className="inline-flex h-8 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                        >
                          查看教学班
                        </a>
                        <button
                          type="button"
                          onClick={() => onDelete(course.id, course.code)}
                          className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {visibleCourses.length > PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 text-sm text-slate-600">
            <p>
              显示 {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, visibleCourses.length)} / 共 {visibleCourses.length} 门
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="inline-flex h-8 min-w-[4rem] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← 上一页
              </button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) pageNum = i + 1;
                else if (safePage <= 4) pageNum = i + 1;
                else if (safePage >= totalPages - 3) pageNum = totalPages - 6 + i;
                else pageNum = safePage - 3 + i;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setPage(pageNum)}
                    className={`inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border px-2.5 font-medium transition ${
                      pageNum === safePage
                        ? "border-primary bg-primary text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="inline-flex h-8 min-w-[4rem] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一页 →
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
