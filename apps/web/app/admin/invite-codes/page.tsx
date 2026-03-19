"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ConfirmDialog } from "@/components/confirm-dialog";

type InviteCode = {
  id: string;
  code: string;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  usedAt: string | null;
  active: boolean;
  createdAt: string;
};

export default function InviteCodesPage() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newMaxUses, setNewMaxUses] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const d = await apiFetch<InviteCode[]>("/admin/invite-codes");
      setCodes(d ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function create() {
    if (!newCode.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/admin/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode.trim(),
          maxUses: newMaxUses ? Number(newMaxUses) : null,
          expiresAt: newExpiry || null,
          active: true,
        }),
      });
      setNewCode("");
      setNewMaxUses("");
      setNewExpiry("");
      setCreating(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(code: InviteCode) {
    try {
      await apiFetch(`/admin/invite-codes/${code.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !code.active }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    }
  }

  function deleteCode(id: string, code: string) {
    setConfirmState({
      title: "删除邀请码",
      message: `确认删除邀请码「${code}」？此操作不可撤销。`,
      onConfirm: async () => {
        setConfirmState(null);
        setDeletingId(id);
        try {
          await apiFetch(`/admin/invite-codes/${id}`, { method: "DELETE" });
          await load();
        } catch (err) {
          setError(err instanceof Error ? err.message : "删除失败");
        } finally {
          setDeletingId(null);
        }
      },
    });
  }

  const active = codes.filter((c) => c.active);
  const used = codes.filter((c) => c.usedAt || c.usedCount > 0);

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">系统管理</p>
        <h1 className="campus-title">邀请码管理</h1>
        <p className="campus-subtitle">创建和管理用于注册的邀请码，可设置使用次数与有效期</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">邀请码总数</p>
          <p className="campus-kpi-value">{loading ? "—" : codes.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">激活中</p>
          <p className="campus-kpi-value text-emerald-600">{loading ? "—" : active.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已使用</p>
          <p className="campus-kpi-value text-slate-500">{loading ? "—" : used.length}</p>
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
          {creating ? "取消" : "+ 新建邀请码"}
        </button>
      </div>

      {creating ? (
        <div className="campus-card px-5 py-4 space-y-4">
          <p className="font-semibold text-slate-800">新建邀请码</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">邀请码 <span className="text-red-500">*</span></label>
              <input
                className="campus-input w-full font-mono"
                placeholder="例：WELCOME2024"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">最大使用次数（空=不限）</label>
              <input
                type="number"
                min={1}
                className="campus-input w-full"
                placeholder="不限"
                value={newMaxUses}
                onChange={(e) => setNewMaxUses(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">过期时间（可选）</label>
              <input
                type="date"
                className="campus-input w-full"
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={create}
            disabled={saving || !newCode.trim()}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {saving ? "创建中…" : "创建"}
          </button>
        </div>
      ) : null}

      <section className="campus-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <th className="px-4 py-3 text-left">邀请码</th>
                <th className="px-4 py-3 text-right">已用/上限</th>
                <th className="px-4 py-3 text-left">过期时间</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-left">创建时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
              ) : codes.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">暂无邀请码</td></tr>
              ) : codes.map((c) => {
                const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                const exhausted = c.maxUses != null && c.usedCount >= c.maxUses;
                return (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 tracking-wider">{c.code}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm">
                      <span className={exhausted ? "text-red-600 font-bold" : "text-slate-700"}>
                        {c.usedCount}
                      </span>
                      <span className="text-slate-400">/{c.maxUses ?? "∞"}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.expiresAt ? (
                        <span className={expired ? "text-red-600 font-semibold" : "text-slate-600"}>
                          {c.expiresAt.slice(0, 10)}{expired ? " (已过期)" : ""}
                        </span>
                      ) : <span className="text-slate-400">无限期</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                        !c.active || expired || exhausted
                          ? "border-slate-200 bg-slate-50 text-slate-500"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}>
                        {!c.active ? "已停用" : expired ? "已过期" : exhausted ? "已用完" : "有效"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{c.createdAt?.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => toggleActive(c)}
                          className="text-xs text-slate-500 hover:text-slate-800 underline"
                        >
                          {c.active ? "停用" : "启用"}
                        </button>
                        {!c.usedCount ? (
                          <button
                            type="button"
                            disabled={deletingId === c.id}
                            onClick={() => deleteCode(c.id, c.code)}
                            className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-50"
                          >
                            {deletingId === c.id ? "删除中…" : "删除"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title ?? ""}
        message={confirmState?.message ?? ""}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
