"use client";

/**
 * Student Private Notes
 * localStorage-based personal notes per course/section.
 * Notes are stored client-side and never sent to the server.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "sis_student_notes";

type Note = {
  id: string;
  courseCode: string;
  courseName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  color: "default" | "yellow" | "blue" | "green" | "red";
};

const COLOR_MAP: Record<Note["color"], string> = {
  default: "border-slate-200 bg-white",
  yellow:  "border-amber-200 bg-amber-50",
  blue:    "border-blue-200 bg-blue-50",
  green:   "border-emerald-200 bg-emerald-50",
  red:     "border-red-200 bg-red-50"
};

const COLOR_BTN: Record<Note["color"], string> = {
  default: "bg-slate-200",
  yellow:  "bg-amber-300",
  blue:    "bg-blue-300",
  green:   "bg-emerald-300",
  red:     "bg-red-300"
};

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

function uid() {
  return Math.random().toString(36).slice(2);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export default function MyNotesPage() {
  const [notes, setNotes]         = useState<Note[]>([]);
  const [editId, setEditId]       = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [search, setSearch]       = useState("");
  const [newCode, setNewCode]     = useState("");
  const [newName, setNewName]     = useState("");
  const [newContent, setNewContent] = useState("");
  const [newColor, setNewColor]   = useState<Note["color"]>("default");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    setNotes(loadNotes());
  }, []);

  useEffect(() => {
    if (showForm || editId) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [showForm, editId]);

  function addNote() {
    if (!newContent.trim()) return;
    const now = new Date().toISOString();
    const note: Note = {
      id: uid(),
      courseCode: newCode.trim().toUpperCase() || "通用",
      courseName: newName.trim() || "",
      content: newContent.trim(),
      createdAt: now,
      updatedAt: now,
      pinned: false,
      color: newColor
    };
    const updated = [note, ...notes];
    setNotes(updated);
    saveNotes(updated);
    setNewCode("");
    setNewName("");
    setNewContent("");
    setNewColor("default");
    setShowForm(false);
  }

  function updateNote(id: string, content: string) {
    const updated = notes.map((n) =>
      n.id === id ? { ...n, content, updatedAt: new Date().toISOString() } : n
    );
    setNotes(updated);
    saveNotes(updated);
    setEditId(null);
  }

  function togglePin(id: string) {
    const updated = notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n));
    setNotes(updated);
    saveNotes(updated);
  }

  function setColor(id: string, color: Note["color"]) {
    const updated = notes.map((n) => (n.id === id ? { ...n, color } : n));
    setNotes(updated);
    saveNotes(updated);
  }

  function deleteNote(id: string) {
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    saveNotes(updated);
  }

  const filtered = notes.filter((n) => {
    const q = search.toLowerCase();
    return (
      n.courseCode.toLowerCase().includes(q) ||
      n.courseName.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q)
    );
  });

  const pinned = filtered.filter((n) => n.pinned);
  const unpinned = filtered.filter((n) => !n.pinned);

  const NoteCard = ({ note }: { note: Note }) => {
    const [draft, setDraft] = useState(note.content);
    const isEditing = editId === note.id;

    return (
      <div className={`rounded-xl border p-4 space-y-2 ${COLOR_MAP[note.color]}`}>
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-indigo-700">{note.courseCode}</span>
          {note.courseName && (
            <span className="text-xs text-slate-500 truncate">{note.courseName}</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {/* Color picker */}
            {(Object.keys(COLOR_BTN) as Note["color"][]).map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => setColor(note.id, c)}
                className={`size-3 rounded-full ${COLOR_BTN[c]} ${note.color === c ? "ring-2 ring-offset-1 ring-slate-400" : ""}`}
              />
            ))}
            <button
              type="button"
              title={note.pinned ? "取消置顶" : "置顶"}
              onClick={() => togglePin(note.id)}
              className={`ml-1 text-sm ${note.pinned ? "opacity-100" : "opacity-30 hover:opacity-60"}`}
            >
              📌
            </button>
          </div>
        </div>

        {/* Content */}
        {isEditing ? (
          <>
            <textarea
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              ref={textareaRef}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateNote(note.id, draft)}
                className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => setEditId(null)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
            </div>
          </>
        ) : (
          <p
            className="text-sm text-slate-700 whitespace-pre-wrap cursor-text"
            onClick={() => setEditId(note.id)}
            title="点击编辑"
          >
            {note.content}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span title={note.updatedAt}>更新于 {timeAgo(note.updatedAt)}</span>
          <button
            type="button"
            onClick={() => deleteNote(note.id)}
            className="text-red-400 hover:text-red-600"
          >
            删除
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Tools</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">我的课程笔记</h1>
        <p className="mt-1 text-sm text-slate-500">
          私人笔记仅存储在本设备，不会上传到服务器
        </p>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">笔记总数</p>
          <p className="campus-kpi-value">{notes.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已置顶</p>
          <p className="campus-kpi-value text-amber-600">{notes.filter((n) => n.pinned).length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">涉及课程</p>
          <p className="campus-kpi-value text-indigo-600">
            {new Set(notes.map((n) => n.courseCode)).size}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="campus-toolbar flex-wrap gap-2">
        <input
          className="campus-input flex-1"
          placeholder="搜索笔记内容或课程…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          {showForm ? "取消" : "＋ 新建笔记"}
        </button>
      </div>

      {/* New note form */}
      {showForm && (
        <div className="campus-card p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">新建笔记</h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              className="campus-input"
              placeholder="课程代码（如 CS101）"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
            />
            <input
              className="campus-input"
              placeholder="课程名称（可选）"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <textarea
            ref={textareaRef}
            className="campus-input w-full resize-none"
            rows={4}
            placeholder="在此输入笔记内容…"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
          />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">颜色：</span>
              {(Object.keys(COLOR_BTN) as Note["color"][]).map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => setNewColor(c)}
                  className={`size-5 rounded-full ${COLOR_BTN[c]} ${newColor === c ? "ring-2 ring-offset-1 ring-slate-400" : ""}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addNote}
              disabled={!newContent.trim()}
              className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              添加笔记
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="campus-card px-6 py-16 text-center">
          <p className="text-4xl">📝</p>
          <p className="mt-3 text-lg font-semibold text-slate-700">暂无笔记</p>
          <p className="mt-1 text-sm text-slate-500">
            点击上方「新建笔记」开始记录学习心得或课程要点
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Pinned */}
          {pinned.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase text-slate-500 mb-3">📌 置顶笔记</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {pinned.map((n) => <NoteCard key={n.id} note={n} />)}
              </div>
            </div>
          )}
          {/* Others */}
          {unpinned.length > 0 && (
            <div>
              {pinned.length > 0 && <p className="text-xs font-bold uppercase text-slate-500 mb-3">其他笔记</p>}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {unpinned.map((n) => <NoteCard key={n.id} note={n} />)}
              </div>
            </div>
          )}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-slate-400 py-8">无符合搜索条件的笔记</p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        💡 笔记仅保存在当前浏览器本地，清除浏览器数据会导致笔记丢失。可查看
        <Link href="/student/catalog" className="underline ml-1">课程目录</Link>了解各课程详情。
      </div>
    </div>
  );
}
