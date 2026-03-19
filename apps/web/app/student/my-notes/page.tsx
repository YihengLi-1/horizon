"use client";

import { useEffect, useRef, useState } from "react";

type Note = {
  id: string;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
};

const COLORS = [
  { value: "bg-white border-slate-200", label: "白色" },
  { value: "bg-yellow-50 border-yellow-200", label: "黄色" },
  { value: "bg-blue-50 border-blue-200", label: "蓝色" },
  { value: "bg-green-50 border-green-200", label: "绿色" },
  { value: "bg-pink-50 border-pink-200", label: "粉色" },
  { value: "bg-purple-50 border-purple-200", label: "紫色" },
];

const STORAGE_KEY = "campus_my_notes_v1";

function loadNotes(): Note[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Note[]) : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export default function MyNotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editColor, setEditColor] = useState(COLORS[0].value);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNotes(loadNotes());
  }, []);

  function persist(updated: Note[]) {
    setNotes(updated);
    saveNotes(updated);
  }

  function createNote() {
    const id = crypto.randomUUID();
    const now = Date.now();
    const note: Note = { id, title: "新笔记", content: "", color: COLORS[0].value, pinned: false, createdAt: now, updatedAt: now };
    const updated = [note, ...notes];
    persist(updated);
    startEdit(note);
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditColor(note.color);
    setTimeout(() => contentRef.current?.focus(), 50);
  }

  function saveEdit() {
    if (!editingId) return;
    persist(
      notes.map((n) =>
        n.id === editingId
          ? { ...n, title: editTitle.trim() || "无标题", content: editContent, color: editColor, updatedAt: Date.now() }
          : n
      )
    );
    setEditingId(null);
  }

  function deleteNote(id: string) {
    persist(notes.filter((n) => n.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function togglePin(id: string) {
    persist(notes.map((n) => n.id === id ? { ...n, pinned: !n.pinned } : n));
  }

  const filtered = notes
    .filter((n) => {
      const q = search.toLowerCase();
      return !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);

  const pinned = filtered.filter((n) => n.pinned);
  const unpinned = filtered.filter((n) => !n.pinned);

  function fmt(ts: number) {
    return new Date(ts).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function NoteCard({ note }: { note: Note }) {
    const isEditing = editingId === note.id;
    return (
      <div
        className={`rounded-xl border p-4 flex flex-col gap-2 cursor-pointer transition ${note.color} ${isEditing ? "ring-2 ring-[hsl(221_83%_43%)]" : "hover:shadow-md"}`}
        onClick={() => !isEditing && startEdit(note)}
      >
        {isEditing ? (
          <>
            <input
              className="bg-transparent font-bold text-slate-900 border-b border-slate-200 pb-1 focus:outline-none w-full"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="笔记标题"
            />
            <textarea
              ref={contentRef}
              className="bg-transparent text-sm text-slate-700 focus:outline-none resize-none flex-1 min-h-[100px]"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="在此输入内容…"
            />
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditColor(c.value); }}
                  className={`h-5 w-5 rounded-full border-2 transition ${c.value.split(" ")[0]} ${editColor === c.value ? "border-slate-700 scale-125" : "border-transparent"}`}
                  aria-label={c.label}
                />
              ))}
              <div className="flex-1" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); saveEdit(); }}
                className="text-xs font-semibold text-[hsl(221_83%_43%)] hover:underline"
              >
                保存
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-slate-900 truncate flex-1">{note.title}</p>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); togglePin(note.id); }}
                  className={`text-base transition ${note.pinned ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}
                  aria-label={note.pinned ? "取消置顶" : "置顶"}
                >
                  📌
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                  className="text-slate-300 hover:text-red-500 text-base transition"
                  aria-label="删除笔记"
                >
                  ×
                </button>
              </div>
            </div>
            {note.content ? (
              <p className="text-sm text-slate-600 line-clamp-3">{note.content}</p>
            ) : (
              <p className="text-sm text-slate-300 italic">空笔记，点击编辑</p>
            )}
            <p className="text-[10px] text-slate-400 mt-auto">{fmt(note.updatedAt)}</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">个人工具</p>
        <h1 className="campus-hero-title">我的笔记</h1>
        <p className="campus-hero-subtitle">本地存储的个人学习笔记，支持置顶、颜色标记与搜索</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">笔记总数</p>
          <p className="campus-kpi-value">{notes.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已置顶</p>
          <p className="campus-kpi-value text-amber-600">{notes.filter((n) => n.pinned).length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">本地存储</p>
          <p className="campus-kpi-value text-slate-500 text-base">仅本设备</p>
        </div>
      </section>

      <div className="campus-toolbar">
        <input
          className="campus-input max-w-xs"
          placeholder="搜索笔记…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={createNote} className="campus-btn-ghost shrink-0">
          + 新建笔记
        </button>
      </div>

      {editingId ? (
        <p className="text-xs text-slate-400">正在编辑，点击"保存"或点击其他地方完成编辑</p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="campus-card p-12 text-center">
          <p className="text-4xl mb-3">📝</p>
          <p className="text-sm font-semibold text-slate-600">{search ? "未找到匹配笔记" : "暂无笔记"}</p>
          {!search ? <p className="mt-1 text-xs text-slate-400">点击"新建笔记"开始记录你的学习内容</p> : null}
        </div>
      ) : (
        <>
          {pinned.length > 0 ? (
            <section>
              <p className="text-xs font-semiboldr text-slate-400 mb-2">已置顶</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pinned.map((n) => <NoteCard key={n.id} note={n} />)}
              </div>
            </section>
          ) : null}
          {unpinned.length > 0 ? (
            <section>
              {pinned.length > 0 ? <p className="text-xs font-semiboldr text-slate-400 mb-2 mt-4">其他</p> : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {unpinned.map((n) => <NoteCard key={n.id} note={n} />)}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
