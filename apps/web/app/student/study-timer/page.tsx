"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "work" | "short" | "long";

const DEFAULTS = { work: 25, short: 5, long: 15 };
const PHASE_LABELS: Record<Phase, string> = { work: "专注", short: "短休息", long: "长休息" };
const PHASE_COLORS: Record<Phase, string> = {
  work: "hsl(221 83% 43%)",
  short: "hsl(160 60% 45%)",
  long: "hsl(270 60% 55%)",
};

const STORAGE_KEY = "campus_study_timer_sessions_v1";

type Session = { phase: Phase; minutes: number; completedAt: number };

function loadSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session[]) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: Session[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(-100)));
}

function fmtTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function StudyTimerPage() {
  const [settings, setSettings] = useState({ work: DEFAULTS.work, short: DEFAULTS.short, long: DEFAULTS.long });
  const [phase, setPhase] = useState<Phase>("work");
  const [seconds, setSeconds] = useState(DEFAULTS.work * 60);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  useEffect(() => {
    document.title = running ? `${fmtTime(seconds)} — 学习计时` : "学习计时 — 地平线";
    return () => { document.title = "地平线"; };
  }, [seconds, running]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds((prev) => {
          if (prev <= 1) {
            // Timer done
            handleComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleComplete() {
    setRunning(false);
    const completedSession: Session = { phase, minutes: settings[phase], completedAt: Date.now() };
    const updated = [...loadSessions(), completedSession];
    saveSessions(updated);
    setSessions(updated);

    if (phase === "work") {
      setPomodoroCount((n) => {
        const next = n + 1;
        // Every 4 pomodoros → long break
        if (next % 4 === 0) switchPhase("long", next);
        else switchPhase("short", next);
        return next;
      });
    } else {
      switchPhase("work");
    }

    // Browser notification
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      void new Notification("⏰ 计时结束", {
        body: `${PHASE_LABELS[phase]} 已完成！`,
        icon: "/favicon.ico",
      });
    }
  }

  function switchPhase(newPhase: Phase, count?: number) {
    setPhase(newPhase);
    setSeconds(settings[newPhase] * 60);
    setRunning(false);
  }

  function toggleTimer() {
    if (seconds === 0) {
      // Reset
      setSeconds(settings[phase] * 60);
      setRunning(true);
    } else {
      setRunning((v) => !v);
    }
  }

  function resetTimer() {
    setRunning(false);
    setSeconds(settings[phase] * 60);
  }

  function requestNotification() {
    if (typeof window !== "undefined" && "Notification" in window) {
      void Notification.requestPermission();
    }
  }

  // SVG circle progress
  const total = settings[phase] * 60;
  const elapsed = total - seconds;
  const pct = total > 0 ? elapsed / total : 0;
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = circumference * pct;
  const color = PHASE_COLORS[phase];

  const todaySessions = sessions.filter((s) => {
    const today = new Date();
    const d = new Date(s.completedAt);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  });
  const todayFocusMin = todaySessions.filter((s) => s.phase === "work").reduce((sum, s) => sum + s.minutes, 0);

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">个人工具</p>
        <h1 className="campus-hero-title">学习计时器</h1>
        <p className="campus-hero-subtitle">番茄钟工作法：25 分钟专注 + 5 分钟休息，提升学习效率</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">今日专注时间</p>
          <p className="campus-kpi-value text-[hsl(221_83%_43%)]">{todayFocusMin} 分钟</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">今日番茄数</p>
          <p className="campus-kpi-value text-amber-600">{todaySessions.filter((s) => s.phase === "work").length} 🍅</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">累计番茄数</p>
          <p className="campus-kpi-value">{sessions.filter((s) => s.phase === "work").length}</p>
        </div>
      </section>

      <section className="campus-card p-6">
        {/* Phase selector */}
        <div className="flex justify-center gap-2 mb-6">
          {(["work", "short", "long"] as Phase[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => switchPhase(p)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${phase === p ? "text-white" : "text-slate-600 hover:bg-slate-100"}`}
              style={phase === p ? { backgroundColor: color } : {}}
            >
              {PHASE_LABELS[p]}
            </button>
          ))}
        </div>

        {/* SVG timer circle */}
        <div className="flex justify-center mb-6">
          <svg width="220" height="220" viewBox="0 0 220 220">
            <circle cx="110" cy="110" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="12" />
            <circle
              cx="110" cy="110" r={radius}
              fill="none"
              stroke={color}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${strokeDash} ${circumference}`}
              strokeDashoffset={0}
              transform="rotate(-90 110 110)"
              style={{ transition: "stroke-dasharray 0.8s ease" }}
            />
            <text x="110" y="102" textAnchor="middle" style={{ fontSize: 36, fontWeight: 800, fill: "#0f172a", fontFamily: "monospace" }}>
              {fmtTime(seconds)}
            </text>
            <text x="110" y="126" textAnchor="middle" style={{ fontSize: 13, fill: "#94a3b8" }}>
              {PHASE_LABELS[phase]}
            </text>
            <text x="110" y="144" textAnchor="middle" style={{ fontSize: 11, fill: "#cbd5e1" }}>
              第 {pomodoroCount + 1} 个番茄
            </text>
          </svg>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={toggleTimer}
            className="px-8 py-3 rounded-xl text-white font-bold text-base shadow transition hover:opacity-90"
            style={{ backgroundColor: color }}
          >
            {running ? "⏸ 暂停" : seconds === 0 ? "🔄 重新开始" : "▶ 开始"}
          </button>
          <button
            type="button"
            onClick={resetTimer}
            className="px-4 py-3 rounded-xl border border-slate-200 text-slate-600 font-medium transition hover:bg-slate-50"
          >
            ↺ 重置
          </button>
        </div>

        {typeof window !== "undefined" && "Notification" in window && Notification.permission === "default" ? (
          <p className="text-center text-xs text-slate-400 mt-4">
            <button type="button" onClick={requestNotification} className="text-[hsl(221_83%_43%)] hover:underline">
              启用桌面通知
            </button>
            ，计时结束时自动提醒
          </p>
        ) : null}
      </section>

      {/* Settings */}
      <section className="campus-card p-5">
        <p className="font-semibold text-slate-800 mb-3">时长设置（分钟）</p>
        <div className="grid grid-cols-3 gap-4">
          {(["work", "short", "long"] as Phase[]).map((p) => (
            <div key={p}>
              <label className="text-xs text-slate-500 mb-1 block">{PHASE_LABELS[p]}</label>
              <input
                type="number"
                className="campus-input w-full text-right"
                value={settings[p]}
                min={1}
                max={90}
                onChange={(e) => {
                  const val = Math.max(1, Number(e.target.value));
                  setSettings((prev) => ({ ...prev, [p]: val }));
                  if (p === phase && !running) setSeconds(val * 60);
                }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Session log */}
      {todaySessions.length > 0 ? (
        <section className="campus-card p-5">
          <p className="font-semibold text-slate-800 mb-3">今日记录</p>
          <div className="space-y-1.5">
            {[...todaySessions].reverse().map((s, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span style={{ color: PHASE_COLORS[s.phase] }} className="font-medium w-12">{PHASE_LABELS[s.phase]}</span>
                <span className="text-slate-600">{s.minutes} 分钟</span>
                <span className="text-xs text-slate-400 ml-auto">
                  {new Date(s.completedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
