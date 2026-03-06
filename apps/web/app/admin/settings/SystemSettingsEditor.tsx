"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Setting = {
  key: string;
  value: string;
  updatedAt?: string;
};

const DEFAULT_KEYS = [
  { key: "maintenance_mode", label: "Maintenance Mode", placeholder: "false" },
  { key: "max_credits_per_term", label: "Max Credits Per Term", placeholder: "18" },
  { key: "registration_message", label: "Registration Message", placeholder: "Optional banner message" }
] as const;

export default function SystemSettingsEditor() {
  const [items, setItems] = useState<Setting[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  const maintenanceEnabled = useMemo(
    () => items.find((item) => item.key === "maintenance_mode")?.value === "true",
    [items]
  );

  const validation = useMemo(() => {
    const errors = new Map<string, string>();
    for (const item of items) {
      const value = item.value.trim();
      if (item.key === "max_credits_per_term") {
        const num = Number(value);
        if (!Number.isInteger(num) || num < 1 || num > 30) {
          errors.set(item.key, "必须是 1-30 的整数");
        }
      }
      if (item.key === "maintenance_mode" && value !== "true" && value !== "false") {
        errors.set(item.key, "必须是 true 或 false");
      }
      if (item.key === "registration_message" && value.length > 500) {
        errors.set(item.key, "最多 500 个字符");
      }
    }
    return errors;
  }, [items]);

  useEffect(() => {
    apiFetch<Setting[]>("/admin/settings/system")
      .then((data) => {
        const map = new Map((data ?? []).map((item) => [item.key, item]));
        setItems(
          DEFAULT_KEYS.map((meta) => ({
            key: meta.key,
            value: map.get(meta.key)?.value ?? meta.placeholder,
            updatedAt: map.get(meta.key)?.updatedAt
          }))
        );
      })
      .catch(() => {
        setItems(DEFAULT_KEYS.map((meta) => ({ key: meta.key, value: meta.placeholder })));
      });
  }, []);

  async function save(key: string, value: string) {
    setSavingKey(key);
    setMessage("");
    try {
      const saved = await apiFetch<Setting>("/admin/settings/system", {
        method: "PUT",
        body: JSON.stringify({ key, value }),
        headers: { "Content-Type": "application/json" }
      });
      setItems((current) => current.map((item) => (item.key === key ? { ...item, value: saved.value, updatedAt: saved.updatedAt } : item)));
      setMessage(`${key} saved`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Failed to save ${key}`);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="campus-card overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">System Settings</p>
      </div>
      {maintenanceEnabled ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          ⚠️ 维护模式已开启，学生功能受影响。
        </div>
      ) : null}
      <div className="divide-y divide-slate-50 dark:divide-slate-700">
        {items.map((item) => {
          const meta = DEFAULT_KEYS.find((entry) => entry.key === item.key);
          const itemError = validation.get(item.key);
          return (
            <div key={item.key} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 md:max-w-xs">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{meta?.label ?? item.key}</p>
                <p className="text-xs font-mono text-slate-400">{item.key}</p>
              </div>
              <div className="w-full max-w-xl">
                {item.key === "registration_message" ? (
                  <>
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={item.value}
                      onChange={(event) =>
                        setItems((current) => current.map((entry) => (entry.key === item.key ? { ...entry, value: event.target.value } : entry)))
                      }
                      className="campus-input min-h-[72px] w-full text-sm"
                      placeholder={meta?.placeholder}
                    />
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{itemError ?? "Optional message shown during maintenance or registration changes."}</span>
                      <span>{item.value.length}/500</span>
                    </div>
                  </>
                ) : (
                  <>
                    {item.key === "maintenance_mode" ? (
                      <select
                        value={item.value}
                        onChange={(event) =>
                          setItems((current) => current.map((entry) => (entry.key === item.key ? { ...entry, value: event.target.value } : entry)))
                        }
                        className="campus-select w-full text-sm"
                      >
                        <option value="false">false</option>
                        <option value="true">true</option>
                      </select>
                    ) : (
                      <input
                        value={item.value}
                        onChange={(event) =>
                          setItems((current) => current.map((entry) => (entry.key === item.key ? { ...entry, value: event.target.value } : entry)))
                        }
                        className="campus-input w-full text-sm"
                        placeholder={meta?.placeholder}
                      />
                    )}
                    <div className="mt-1 text-[11px] text-red-500">{itemError ?? "\u00A0"}</div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {maintenanceEnabled && item.key === "maintenance_mode" ? (
                  <button
                    type="button"
                    onClick={() => save("maintenance_mode", "false")}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                  >
                    关闭维护模式
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={savingKey === item.key || Boolean(itemError)}
                  onClick={() => save(item.key, item.value)}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
                >
                  {savingKey === item.key ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {message ? <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-700">{message}</div> : null}
    </div>
  );
}
