"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type InviteCode = {
  id: string;
  code: string;
  usedCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  active: boolean;
};

function isExpired(item: InviteCode): boolean {
  if (!item.expiresAt) return false;
  return Date.now() > new Date(item.expiresAt).getTime();
}

function statusLabel(item: InviteCode): { label: string; cls: string } {
  if (!item.active) return { label: "DISABLED", cls: "border-slate-300 bg-slate-100 text-slate-600" };
  if (isExpired(item)) return { label: "EXPIRED", cls: "border-red-200 bg-red-50 text-red-700" };
  if (item.maxUses !== null && item.usedCount >= item.maxUses) return { label: "EXHAUSTED", cls: "border-orange-200 bg-orange-50 text-orange-700" };
  return { label: "ACTIVE", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}

function UsageBar({ used, max }: { used: number; max: number | null }) {
  if (max === null) {
    return <span className="text-xs text-slate-500">{used} / ∞</span>;
  }
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <p className="mb-1 text-xs text-slate-700">{used} / {max}</p>
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [code]);

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex h-7 items-center rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function generateCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const parts = [4, 4, 4].map(() =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
  );
  return parts.join("-");
}

export default function InviteCodesPage() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [form, setForm] = useState({ code: "", maxUses: 100, expiresAt: "", active: true });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filterStatus, setFilterStatus] = useState("ALL");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<InviteCode[]>("/admin/invite-codes");
      setCodes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invite codes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      setCreating(true);
      await apiFetch("/admin/invite-codes", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          maxUses: Number(form.maxUses),
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
          active: form.active
        })
      });
      setForm({ code: "", maxUses: 100, expiresAt: "", active: true });
      setNotice("Invite code created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (item: InviteCode) => {
    try {
      setError("");
      setNotice("");
      await apiFetch(`/admin/invite-codes/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !item.active })
      });
      setNotice(`Invite code ${item.active ? "disabled" : "enabled"}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  const stats = useMemo(() => {
    const active = codes.filter((item) => item.active && !isExpired(item) && (item.maxUses === null || item.usedCount < item.maxUses)).length;
    const expired = codes.filter(isExpired).length;
    const totalUsed = codes.reduce((sum, item) => sum + item.usedCount, 0);
    return { total: codes.length, active, expired, totalUsed };
  }, [codes]);

  const visibleCodes = useMemo(() => {
    if (filterStatus === "ACTIVE") return codes.filter((item) => item.active && !isExpired(item) && (item.maxUses === null || item.usedCount < item.maxUses));
    if (filterStatus === "DISABLED") return codes.filter((item) => !item.active);
    if (filterStatus === "EXPIRED") return codes.filter(isExpired);
    return codes;
  }, [codes, filterStatus]);

  const exportCsv = () => {
    const rows = [
      ["Code", "Used", "MaxUses", "Expires", "Status"],
      ...visibleCodes.map((item) => {
        const { label } = statusLabel(item);
        return [
          item.code,
          String(item.usedCount),
          item.maxUses !== null ? String(item.maxUses) : "∞",
          item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : "No expiry",
          label
        ];
      })
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invite-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Access Control</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">Invite Codes</h1>
            <p className="text-sm text-slate-600 md:text-base">
              Issue registration invite codes, define usage limits, and toggle availability.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">Total {stats.total}</span>
              <span className="campus-chip border-emerald-200 bg-emerald-50 text-emerald-700">Active {stats.active}</span>
              {stats.expired > 0 ? <span className="campus-chip border-red-200 bg-red-50 text-red-700">Expired {stats.expired}</span> : null}
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">Total uses {stats.totalUsed}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={visibleCodes.length === 0}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
            >
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="campus-card p-5 md:p-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Create Invite Code</h2>
        <form className="grid gap-3 md:grid-cols-4" onSubmit={onCreate}>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Code</label>
            <div className="flex gap-2">
              <input
                className="campus-input flex-1"
                placeholder="INVITE-2027"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                required
              />
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, code: generateCode() }))}
                className="inline-flex h-10 shrink-0 items-center rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Generate
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Max uses</label>
            <input
              className="campus-input"
              type="number"
              min={1}
              value={form.maxUses}
              onChange={(e) => setForm((p) => ({ ...p, maxUses: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Expires on</label>
            <input
              className="campus-input"
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
            />
          </div>
          <div className="md:flex md:items-end">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Creating
                </>
              ) : (
                "Create code"
              )}
            </button>
          </div>
        </form>
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      <section className="campus-toolbar">
        <div className="flex flex-wrap items-center gap-2">
          {(["ALL", "ACTIVE", "DISABLED", "EXPIRED"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilterStatus(status)}
              className={`inline-flex h-9 items-center rounded-full border px-3 text-xs font-medium transition ${
                filterStatus === status
                  ? "border-slate-400 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {status === "ALL" ? `All (${codes.length})` : status}
            </button>
          ))}
        </div>
      </section>

      <section className="campus-card overflow-hidden">
        <div className="max-h-[560px] overflow-auto rounded-3xl">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">Code</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Usage</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Expires</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Loading invite codes...
                  </td>
                </tr>
              ) : visibleCodes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    {codes.length === 0 ? "No invite codes available." : "No codes match current filter."}
                  </td>
                </tr>
              ) : (
                visibleCodes.map((item) => {
                  const { label, cls } = statusLabel(item);
                  const expired = isExpired(item);
                  return (
                    <tr key={item.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-slate-900">{item.code}</span>
                          <CopyButton code={item.code} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <UsageBar used={item.usedCount} max={item.maxUses} />
                      </td>
                      <td className="px-4 py-3">
                        {item.expiresAt ? (
                          <span className={expired ? "text-red-600" : "text-slate-700"}>
                            {new Date(item.expiresAt).toLocaleDateString()}
                            {expired ? " (expired)" : ""}
                          </span>
                        ) : (
                          <span className="text-slate-400">No expiry</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void toggleActive(item)}
                          className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          {item.active ? "Disable" : "Enable"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
