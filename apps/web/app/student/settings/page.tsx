"use client";

import { useEffect, useState } from "react";

const PREFS_KEY = "sis_student_prefs";

type Prefs = {
  emailSeatAvailable: boolean;
  emailGradePosted: boolean;
  emailAnnouncement: boolean;
  emailDropDeadline: boolean;
  showCapacityAlert: boolean;
  dashboardCompact: boolean;
  catalogView: "grid" | "list";
};

const DEFAULT_PREFS: Prefs = {
  emailSeatAvailable: true,
  emailGradePosted: true,
  emailAnnouncement: true,
  emailDropDeadline: true,
  showCapacityAlert: true,
  dashboardCompact: false,
  catalogView: "grid"
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_PREFS };
}

function Toggle({
  checked,
  onChange,
  label,
  desc
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative flex-shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`h-5 w-9 rounded-full transition-colors ${checked ? "bg-indigo-600" : "bg-slate-200"}`}
        >
          <div
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
          />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {desc && <p className="text-xs text-slate-500">{desc}</p>}
      </div>
    </label>
  );
}

export default function StudentSettingsPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  function update<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
    setSaved(false);
  }

  function save() {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function reset() {
    setPrefs({ ...DEFAULT_PREFS });
    localStorage.removeItem(PREFS_KEY);
    setSaved(false);
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">个人偏好</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">通知与界面设置</h1>
        <p className="mt-1 text-sm text-slate-600 md:text-base">
          自定义邮件通知和界面显示偏好。
        </p>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Email Notifications */}
        <section className="campus-card p-5 space-y-5">
          <h2 className="text-base font-semibold text-slate-800">📧 邮件通知</h2>
          <div className="space-y-4">
            <Toggle
              checked={prefs.emailSeatAvailable}
              onChange={(v) => update("emailSeatAvailable", v)}
              label="空位通知"
              desc="订阅的课程有空位时发送邮件"
            />
            <Toggle
              checked={prefs.emailGradePosted}
              onChange={(v) => update("emailGradePosted", v)}
              label="成绩公布通知"
              desc="期末成绩录入后发送邮件"
            />
            <Toggle
              checked={prefs.emailAnnouncement}
              onChange={(v) => update("emailAnnouncement", v)}
              label="校园公告通知"
              desc="重要公告发布时接收邮件"
            />
            <Toggle
              checked={prefs.emailDropDeadline}
              onChange={(v) => update("emailDropDeadline", v)}
              label="退课截止提醒"
              desc="退课截止日期前 3 天发送提醒"
            />
          </div>
        </section>

        {/* Display Preferences */}
        <section className="campus-card p-5 space-y-5">
          <h2 className="text-base font-semibold text-slate-800">🖥️ 界面偏好</h2>
          <div className="space-y-4">
            <Toggle
              checked={prefs.showCapacityAlert}
              onChange={(v) => update("showCapacityAlert", v)}
              label="容量警报"
              desc="课程目录中展示容量不足的警示"
            />
            <Toggle
              checked={prefs.dashboardCompact}
              onChange={(v) => update("dashboardCompact", v)}
              label="紧凑仪表板"
              desc="Dashboard 使用更紧凑的卡片布局"
            />
            <div>
              <p className="text-sm font-medium text-slate-800 mb-2">课程目录视图</p>
              <div className="flex gap-2">
                {(["grid", "list"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => update("catalogView", v)}
                    className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${prefs.catalogView === v ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    {v === "grid" ? "🔲 网格" : "📋 列表"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          {saved ? "✓ 已保存" : "保存设置"}
        </button>
        <button
          onClick={reset}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          恢复默认
        </button>
        {saved && (
          <p className="text-sm text-emerald-600 font-medium">设置已保存到本地</p>
        )}
      </div>

      <section className="campus-card p-4">
        <p className="text-xs text-slate-500">
          注意：邮件通知设置为偏好记录，部分通知（如空位通知）由系统自动触发，与此处设置同步；
          其他通知实际发送以系统配置为准。设置存储在本地浏览器中。
        </p>
      </section>
    </div>
  );
}
