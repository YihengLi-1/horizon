"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = {
  id: string;
  name: string;
  maxCredits: number;
  timezone: string;
  startDate: string;
  endDate: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  dropDeadline: string;
};

export default function TermsPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    startDate: "",
    endDate: "",
    registrationOpenAt: "",
    registrationCloseAt: "",
    dropDeadline: "",
    maxCredits: 12,
    timezone: "America/Phoenix"
  });

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<Term[]>("/admin/terms");
      setTerms(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load terms");
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
      await apiFetch("/admin/terms", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          startDate: new Date(form.startDate).toISOString(),
          endDate: new Date(form.endDate).toISOString(),
          registrationOpenAt: new Date(form.registrationOpenAt).toISOString(),
          registrationCloseAt: new Date(form.registrationCloseAt).toISOString(),
          dropDeadline: new Date(form.dropDeadline).toISOString()
        })
      });
      setForm({
        name: "",
        startDate: "",
        endDate: "",
        registrationOpenAt: "",
        registrationCloseAt: "",
        dropDeadline: "",
        maxCredits: 12,
        timezone: "America/Phoenix"
      });
      setNotice("Term created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const stats = useMemo(() => {
    if (terms.length === 0) return { total: 0, latest: "-" };
    const sorted = [...terms].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    return { total: terms.length, latest: sorted[0].name };
  }, [terms]);

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Academic Calendar Control</p>
            <h1 className="font-heading text-4xl font-bold text-white md:text-5xl">Terms</h1>
            <p className="text-sm text-blue-100/90 md:text-base">
              Create and manage registration windows, drop deadlines, and per-term credit caps.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-blue-200/30 bg-white/10 text-blue-50">{stats.total} term(s)</span>
              <span className="campus-chip border-blue-200/30 bg-white/10 text-blue-50">Latest: {stats.latest}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center rounded-xl border border-white/40 bg-white/95 px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
          >
            Refresh
          </button>
        </div>
      </section>

      <section className="campus-card p-5 md:p-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Create New Term</h2>
        <form className="grid gap-3 md:grid-cols-4" onSubmit={onCreate}>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Term name</label>
            <input
              className="campus-input"
              placeholder="Spring 2027"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Max credits</label>
            <input
              className="campus-input"
              type="number"
              min={1}
              value={form.maxCredits}
              onChange={(e) => setForm((p) => ({ ...p, maxCredits: Number(e.target.value) }))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Timezone</label>
            <input
              className="campus-input"
              value={form.timezone}
              onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Start date</label>
            <input
              className="campus-input"
              type="datetime-local"
              value={form.startDate}
              onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">End date</label>
            <input
              className="campus-input"
              type="datetime-local"
              value={form.endDate}
              onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Registration opens</label>
            <input
              className="campus-input"
              type="datetime-local"
              value={form.registrationOpenAt}
              onChange={(e) => setForm((p) => ({ ...p, registrationOpenAt: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Registration closes</label>
            <input
              className="campus-input"
              type="datetime-local"
              value={form.registrationCloseAt}
              onChange={(e) => setForm((p) => ({ ...p, registrationCloseAt: e.target.value }))}
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Drop deadline</label>
            <input
              className="campus-input"
              type="datetime-local"
              value={form.dropDeadline}
              onChange={(e) => setForm((p) => ({ ...p, dropDeadline: e.target.value }))}
              required
            />
          </div>
          <div className="md:col-span-2 md:flex md:items-end">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
            >
              {creating ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Creating
                </>
              ) : (
                "Create term"
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
                <th className="px-4 py-3 font-semibold text-slate-700">Term</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Date Range</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Registration Window</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Drop Deadline</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Max Credits</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Timezone</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading terms...
                  </td>
                </tr>
              ) : terms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No terms yet.
                  </td>
                </tr>
              ) : (
                terms.map((term) => (
                  <tr key={term.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/60">
                    <td className="px-4 py-3 font-medium text-slate-900">{term.name}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(term.startDate).toLocaleDateString()} - {new Date(term.endDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(term.registrationOpenAt).toLocaleString()} - {new Date(term.registrationCloseAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{new Date(term.dropDeadline).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-700">{term.maxCredits}</td>
                    <td className="px-4 py-3 text-slate-700">{term.timezone}</td>
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
