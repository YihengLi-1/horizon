"use client";

import { useEffect, useMemo, useState } from "react";

type DeadlineItem = {
  id: string;
  courseName: string;
  dueDate: string;
  note: string;
  completed: boolean;
  createdAt: string;
};

const STORAGE_KEY = "sis.student.deadlines";

function readItems(): DeadlineItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DeadlineItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sortItems(items: DeadlineItem[]) {
  return [...items].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return a.dueDate.localeCompare(b.dueDate) || b.createdAt.localeCompare(a.createdAt);
  });
}

export default function StudentDeadlinesPage() {
  const [items, setItems] = useState<DeadlineItem[]>([]);
  const [courseName, setCourseName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setItems(sortItems(readItems()));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const today = new Date().toISOString().slice(0, 10);

  const summary = useMemo(() => {
    const open = items.filter((item) => !item.completed).length;
    const overdue = items.filter((item) => !item.completed && item.dueDate < today).length;
    const completed = items.filter((item) => item.completed).length;
    return { open, overdue, completed };
  }, [items, today]);

  function addItem() {
    if (!courseName.trim() || !dueDate) return;
    const next: DeadlineItem = {
      id: crypto.randomUUID(),
      courseName: courseName.trim(),
      dueDate,
      note: note.trim(),
      completed: false,
      createdAt: new Date().toISOString()
    };
    setItems((current) => sortItems([...current, next]));
    setCourseName("");
    setDueDate("");
    setNote("");
  }

  function toggleCompleted(id: string) {
    setItems((current) =>
      sortItems(
        current.map((item) =>
          item.id === id
            ? { ...item, completed: !item.completed }
            : item
        )
      )
    );
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Deadline Tracking</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">截止日期追踪</h1>
        <p className="mt-1 text-sm text-slate-500">用本地清单追踪自己的课程截止时间，逾期自动标红，完成项自动划线。</p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">未完成</p>
          <p className="campus-kpi-value">{summary.open}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已逾期</p>
          <p className="campus-kpi-value text-red-600">{summary.overdue}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已完成</p>
          <p className="campus-kpi-value text-emerald-600">{summary.completed}</p>
        </div>
      </div>

      <section className="campus-toolbar space-y-4">
        <div className="grid gap-3 md:grid-cols-[1.2fr_180px_1.4fr_auto]">
          <input
            className="campus-input"
            placeholder="课程名，例如 CS101 Project"
            value={courseName}
            onChange={(event) => setCourseName(event.target.value)}
          />
          <input
            className="campus-input"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
          <input
            className="campus-input"
            placeholder="备注，例如 提交 PDF 和代码仓库链接"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <button
            type="button"
            onClick={addItem}
            disabled={!courseName.trim() || !dueDate}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            新增
          </button>
        </div>
      </section>

      {items.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">还没有记录任何截止日期</div>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => {
            const isOverdue = !item.completed && item.dueDate < today;
            return (
              <article
                key={item.id}
                className={`campus-card p-5 ${isOverdue ? "border-red-200 bg-red-50/50" : item.completed ? "border-emerald-200 bg-emerald-50/40" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className={`text-lg font-semibold text-slate-900 ${item.completed ? "line-through text-slate-400" : ""}`}>
                      {item.courseName}
                    </h2>
                    <p className={`text-sm ${item.completed ? "line-through text-slate-400" : "text-slate-500"}`}>
                      截止日期：{item.dueDate}
                    </p>
                    {item.note ? (
                      <p className={`text-sm ${item.completed ? "line-through text-slate-400" : "text-slate-600"}`}>
                        {item.note}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`campus-chip ${item.completed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : isOverdue ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                      {item.completed ? "已完成" : isOverdue ? "已逾期" : "进行中"}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleCompleted(item.id)}
                      className="campus-chip border-slate-200 bg-white text-slate-700"
                    >
                      {item.completed ? "标记未完成" : "标记完成"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="campus-chip border-red-200 bg-red-50 text-red-700"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
