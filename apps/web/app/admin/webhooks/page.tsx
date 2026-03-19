"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Webhook = {
  id: string;
  url: string;
  events: string[];
  active?: boolean;
  createdAt?: string;
};

const AVAILABLE_EVENTS = [
  "enrollment.created",
  "enrollment.dropped",
  "enrollment.waitlisted",
  "enrollment.completed",
  "grade.updated",
  "term.created",
  "appeal.created",
  "appeal.resolved",
  "user.created",
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["enrollment.created"]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const d = await apiFetch<{ webhooks: Webhook[] }>("/admin/webhooks");
      setWebhooks(d?.webhooks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function create() {
    if (!newUrl.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl.trim(), events: newEvents, secret: newSecret.trim() || undefined }),
      });
      setCreating(false);
      setNewUrl("");
      setNewSecret("");
      setNewEvents(["enrollment.created"]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setDeletingId(id);
    try {
      await apiFetch(`/admin/webhooks/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  function toggleEvent(evt: string) {
    setNewEvents((prev) =>
      prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt]
    );
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">系统集成</p>
        <h1 className="campus-title">Webhook 管理</h1>
        <p className="campus-subtitle">配置系统事件的 HTTP 回调地址，将注册、成绩等事件推送到外部系统</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="campus-kpi">
          <p className="campus-kpi-label">已配置 Webhook</p>
          <p className="campus-kpi-value">{loading ? "—" : webhooks.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">可用事件类型</p>
          <p className="campus-kpi-value">{AVAILABLE_EVENTS.length}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="campus-toolbar">
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="campus-btn-ghost shrink-0"
        >
          {creating ? "取消" : "+ 添加 Webhook"}
        </button>
      </div>

      {creating ? (
        <div className="campus-card px-5 py-5 space-y-4">
          <p className="font-semibold text-slate-800">新建 Webhook</p>
          <div className="space-y-3 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">回调 URL <span className="text-red-500">*</span></label>
              <input
                className="campus-input w-full font-mono text-sm"
                placeholder="https://your-service.com/webhook"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">密钥（可选，用于签名验证）</label>
              <input
                className="campus-input w-full font-mono text-sm"
                placeholder="your-secret-key"
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">订阅事件</label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_EVENTS.map((evt) => (
                  <button
                    key={evt}
                    type="button"
                    onClick={() => toggleEvent(evt)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                      newEvents.includes(evt)
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {evt}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={create}
            disabled={saving || !newUrl.trim() || newEvents.length === 0}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {saving ? "创建中…" : "创建 Webhook"}
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : webhooks.length === 0 ? (
        <div className="campus-card p-10 text-center text-slate-400">
          <p className="text-sm">暂未配置任何 Webhook</p>
          <p className="text-xs mt-1">点击上方"添加 Webhook"开始配置</p>
        </div>
      ) : (
        <section className="space-y-3">
          {webhooks.map((w) => (
            <div key={w.id} className="campus-card px-5 py-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-bold text-slate-900 truncate">{w.url}</p>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">ID: {w.id}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {w.events.map((evt) => (
                      <span key={evt} className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                        {evt}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={deletingId === w.id}
                  onClick={() => remove(w.id)}
                  className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
                >
                  {deletingId === w.id ? "删除中…" : "删除"}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
