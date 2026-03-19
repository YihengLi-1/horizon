"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type SystemSetting = {
  key: string;
  value: string;
  updatedAt?: string;
};

const SETTING_META: Record<string, { label: string; description: string; type: "text" | "boolean" | "number" }> = {
  maintenance_mode: { label: "维护模式", description: "开启后学生端将显示维护提示，无法进行注册操作", type: "boolean" },
  registration_enabled: { label: "选课开放", description: "全局选课开关，关闭后所有选课窗口将不可用", type: "boolean" },
  max_credits_per_term: { label: "单学期最大学分", description: "学生每学期可选课程的最大学分数", type: "number" },
  min_credits_per_term: { label: "单学期最小学分", description: "学生每学期需选课程的最小学分数", type: "number" },
  late_drop_deadline_days: { label: "晚期退课截止天数", description: "开学后多少天内允许退课（超出视为晚期退课）", type: "number" },
  waitlist_enabled: { label: "候补名单开放", description: "全局候补名单功能开关", type: "boolean" },
};

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const d = await apiFetch<SystemSetting[]>("/admin/settings/system");
      setSettings(d ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function startEdit(s: SystemSetting) {
    setEditingKey(s.key);
    setEditValue(s.value);
    setSavedKey(null);
  }

  async function save(key: string) {
    setSaving(true);
    setError("");
    try {
      await apiFetch("/admin/settings/system", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: editValue }),
      });
      setSavedKey(key);
      setEditingKey(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  // Group known settings first, then unknowns
  const knownKeys = Object.keys(SETTING_META);
  const knownSettings = knownKeys
    .map((k) => settings.find((s) => s.key === k) ?? { key: k, value: "" })
    .filter(Boolean) as SystemSetting[];
  const otherSettings = settings.filter((s) => !knownKeys.includes(s.key));

  function renderValue(s: SystemSetting) {
    const meta = SETTING_META[s.key];
    const type = meta?.type ?? "text";
    if (type === "boolean") {
      const on = s.value === "true" || s.value === "1";
      return (
        <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${on ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
          {on ? "开启" : "关闭"}
        </span>
      );
    }
    return <span className="font-mono text-slate-800">{s.value || "—"}</span>;
  }

  function renderEdit(key: string) {
    const meta = SETTING_META[key];
    const type = meta?.type ?? "text";
    if (type === "boolean") {
      return (
        <select className="campus-select w-28" value={editValue} onChange={(e) => setEditValue(e.target.value)}>
          <option value="true">开启</option>
          <option value="false">关闭</option>
        </select>
      );
    }
    if (type === "number") {
      return (
        <input
          type="number"
          className="campus-input w-28"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
        />
      );
    }
    return (
      <input
        className="campus-input w-48"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
      />
    );
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">系统管理</p>
        <h1 className="campus-title">系统设置</h1>
        <p className="campus-subtitle">配置系统级参数，包括维护模式、选课开关、学分限制等</p>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {savedKey ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          ✅ 设置 <strong>{SETTING_META[savedKey]?.label ?? savedKey}</strong> 已保存
        </div>
      ) : null}

      {loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : (
        <>
          {/* Known settings */}
          <section className="campus-card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <p className="font-semibold text-slate-700 text-sm">核心配置项</p>
            </div>
            <div className="divide-y divide-slate-100">
              {knownSettings.map((s) => {
                const meta = SETTING_META[s.key];
                const isEditing = editingKey === s.key;
                return (
                  <div key={s.key} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm">{meta?.label ?? s.key}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{meta?.description ?? ""}</p>
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5">{s.key}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {isEditing ? (
                        <>
                          {renderEdit(s.key)}
                          <button
                            type="button"
                            onClick={() => save(s.key)}
                            disabled={saving}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {saving ? "保存…" : "保存"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingKey(null)}
                            className="text-xs text-slate-500 hover:text-slate-800"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          {renderValue(s)}
                          <button
                            type="button"
                            onClick={() => startEdit(s)}
                            className="text-xs text-blue-600 hover:text-blue-800 underline"
                          >
                            编辑
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Other settings */}
          {otherSettings.length > 0 ? (
            <section className="campus-card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <p className="font-semibold text-slate-700 text-sm">其他配置项</p>
              </div>
              <div className="divide-y divide-slate-100">
                {otherSettings.map((s) => {
                  const isEditing = editingKey === s.key;
                  return (
                    <div key={s.key} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm text-slate-700">{s.key}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {isEditing ? (
                          <>
                            <input
                              className="campus-input w-40"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => save(s.key)}
                              disabled={saving}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {saving ? "保存…" : "保存"}
                            </button>
                            <button type="button" onClick={() => setEditingKey(null)} className="text-xs text-slate-500">取消</button>
                          </>
                        ) : (
                          <>
                            <span className="font-mono text-sm text-slate-800">{s.value || "—"}</span>
                            <button type="button" onClick={() => startEdit(s)} className="text-xs text-blue-600 underline">编辑</button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
