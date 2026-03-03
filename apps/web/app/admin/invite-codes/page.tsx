"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type InviteCode = {
  id: string;
  code: string;
  usedCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  active: boolean;
};

export default function InviteCodesPage() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [form, setForm] = useState({ code: "", maxUses: 100, expiresAt: "", active: true });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

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
    const active = codes.filter((item) => item.active).length;
    const totalUsed = codes.reduce((sum, item) => sum + item.usedCount, 0);
    return { total: codes.length, active, totalUsed };
  }, [codes]);

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
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">Active {stats.active}</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">Used {stats.totalUsed}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
          >
            Refresh
          </button>
        </div>
      </section>

      <section className="campus-card p-5 md:p-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Create Invite Code</h2>
        <form className="grid gap-3 md:grid-cols-4" onSubmit={onCreate}>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Code</label>
            <input
              className="campus-input"
              placeholder="INVITE-2027"
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              required
            />
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

      <section className="campus-card overflow-hidden">
        <div className="max-h-[560px] overflow-auto rounded-3xl">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">Code</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Used</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Max Uses</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Expires</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading invite codes...
                  </td>
                </tr>
              ) : codes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No invite codes available.
                  </td>
                </tr>
              ) : (
                codes.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/60">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.code}</td>
                    <td className="px-4 py-3 text-slate-700">{item.usedCount}</td>
                    <td className="px-4 py-3 text-slate-700">{item.maxUses ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          item.active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-300 bg-slate-100 text-slate-600"
                        }`}
                      >
                        {item.active ? "ACTIVE" : "DISABLED"}
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
