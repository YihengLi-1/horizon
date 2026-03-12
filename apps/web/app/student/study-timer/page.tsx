"use client";

/**
 * Student Pomodoro Study Timer
 * 25-minute focus / 5-minute break cycles
 * Sessions per course tracked in localStorage.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "sis_study_timer_sessions";

type Session = {
  courseCode: string;
  date: string;
  duration: number; // minutes
};

const PRESETS = [
  { label: "番茄钟 25m", focus: 25, rest: 5 },
  { label: "深度工作 50m", focus: 50, rest: 10 },
  { label: "快速复习 15m", focus: 15, rest: 3 }
];

function loadSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Session[]; }
  catch { return []; }
}

function saveSessions(s: Session[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function fmt(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function StudyTimerPage() {
  const [preset, setPreset]       = useState(0);
  const [courseCode, setCourse]   = useState("通用");
  const [mode, setMode]           = useState<"focus" | "rest">("focus");
  const [secs, setSecs]           = useState(PRESETS[0].focus * 60);
  const [running, setRunning]     = useState(false);
  const [sessions, setSessions]   = useState<Session[]>([]);
  const [completed, setCompleted] = useState(0);
  const intervalRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setSessions(loadSessions()); }, []);

  // Sync secs when preset changes (and not running)
  useEffect(() => {
    if (!running) {
      setSecs(PRESETS[preset][mode === "focus" ? "focus" : "rest"] * 60);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, mode]);

  const finishSession = useCallback(() => {
    if (mode === "focus") {
      const newSession: Session = {
        courseCode: courseCode || "通用",
        date: new Date().toISOString(),
        duration: PRESETS[preset].focus
      };
      const updated = [newSession, ...loadSessions()].slice(0, 200);
      saveSessions(updated);
      setSessions(updated);
      setCompleted((c) => c + 1);
      setMode("rest");
      setSecs(PRESETS[preset].rest * 60);
      // Browser notification
      if (Notification.permission === "granted") {
        new Notification("🍅 专注完成！", { body: `${courseCode || "通用"} — 休息 ${PRESETS[preset].rest} 分钟` });
      }
    } else {
      setMode("focus");
      setSecs(PRESETS[preset].focus * 60);
      if (Notification.permission === "granted") {
        new Notification("⏰ 休息结束！", { body: "准备好开始下一轮专注了吗？" });
      }
    }
    setRunning(false);
  }, [mode, preset, courseCode]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecs((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            finishSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, finishSession]);

  function toggle() {
    if (!running && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    setRunning((r) => !r);
  }

  function reset() {
    setRunning(false);
    setMode("focus");
    setSecs(PRESETS[preset].focus * 60);
  }

  function clearHistory() {
    saveSessions([]);
    setSessions([]);
    setCompleted(0);
  }

  // Stats
  const totalMinutes = sessions.reduce((a, s) => a + s.duration, 0);
  const byCourse = sessions.reduce<Record<string, number>>((acc, s) => {
    acc[s.courseCode] = (acc[s.courseCode] ?? 0) + s.duration;
    return acc;
  }, {});
  const topCourses = Object.entries(byCourse)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const pct = 1 - secs / (PRESETS[preset][mode === "focus" ? "focus" : "rest"] * 60);
  const R = 90;
  const circ = 2 * Math.PI * R;
  const strokeDash = circ * pct;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Tools</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">🍅 学习计时器</h1>
        <p className="mt-1 text-sm text-slate-500">
          番茄工作法：专注+休息循环，科学管理学习时间
        </p>
      </section>

      {/* Preset selector */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p, i) => (
          <button
            key={i}
            type="button"
            disabled={running}
            onClick={() => setPreset(i)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
              preset === i
                ? "border-indigo-400 bg-indigo-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            } disabled:opacity-50`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Timer */}
      <div className="campus-card p-8 flex flex-col items-center gap-6">
        {/* SVG circular timer */}
        <div className="relative">
          <svg width="220" height="220" className="-rotate-90">
            <circle cx="110" cy="110" r={R} fill="none" stroke="#e2e8f0" strokeWidth="10" />
            <circle
              cx="110" cy="110" r={R}
              fill="none"
              stroke={mode === "focus" ? "#6366f1" : "#10b981"}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${strokeDash} ${circ}`}
              style={{ transition: "stroke-dasharray 0.5s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-mono font-bold text-slate-800">{fmt(secs)}</span>
            <span className={`text-sm font-semibold mt-1 ${mode === "focus" ? "text-indigo-600" : "text-emerald-600"}`}>
              {mode === "focus" ? "🧠 专注" : "☕ 休息"}
            </span>
          </div>
        </div>

        {/* Course input */}
        <input
          className="campus-input w-full max-w-xs text-center"
          placeholder="课程代码（如 CS101）"
          value={courseCode}
          onChange={(e) => setCourse(e.target.value)}
          disabled={running}
        />

        {/* Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            className={`rounded-xl px-8 py-3 text-base font-bold text-white transition ${
              running
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {running ? "⏸ 暂停" : secs === PRESETS[preset][mode === "focus" ? "focus" : "rest"] * 60 ? "▶ 开始" : "▶ 继续"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            重置
          </button>
        </div>

        {/* Session count */}
        <div className="flex items-center gap-2">
          {Array.from({ length: Math.min(completed, 8) }).map((_, i) => (
            <span key={i} className="text-xl">🍅</span>
          ))}
          {completed > 8 && <span className="text-sm font-semibold text-slate-600">+{completed - 8}</span>}
          {completed > 0 && <span className="ml-2 text-sm text-slate-500">本次 {completed} 个番茄</span>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">累计专注</p>
          <p className="campus-kpi-value text-indigo-600">{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">专注次数</p>
          <p className="campus-kpi-value">{sessions.length}</p>
        </div>
        <div className="campus-kpi campus-kpi-sm hidden sm:block">
          <p className="campus-kpi-label">今日专注</p>
          <p className="campus-kpi-value text-emerald-600">
            {sessions
              .filter((s) => s.date.startsWith(new Date().toISOString().slice(0, 10)))
              .reduce((a, s) => a + s.duration, 0)} m
          </p>
        </div>
      </div>

      {/* Top courses */}
      {topCourses.length > 0 && (
        <div className="campus-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase text-slate-500">课程学习时长</h3>
            <button
              type="button"
              onClick={clearHistory}
              className="text-xs text-red-400 hover:text-red-600"
            >
              清除历史
            </button>
          </div>
          {topCourses.map(([code, mins]) => (
            <div key={code} className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold text-indigo-700 w-16 shrink-0">{code}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-400"
                  style={{ width: `${Math.round((mins / totalMinutes) * 100)}%` }}
                />
              </div>
              <span className="text-xs font-mono text-slate-600 shrink-0">
                {Math.floor(mins / 60)}h {mins % 60}m
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        💡 研究表明，25分钟深度专注+5分钟休息能显著提升学习效率。允许浏览器通知以获得提醒。
      </div>
    </div>
  );
}
