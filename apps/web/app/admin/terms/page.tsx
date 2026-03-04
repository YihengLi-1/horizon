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

type TermForm = {
  name: string;
  startDate: string;
  endDate: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  dropDeadline: string;
  maxCredits: number;
  timezone: string;
};

function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function termToForm(term: Term): TermForm {
  return {
    name: term.name,
    startDate: toLocalInput(term.startDate),
    endDate: toLocalInput(term.endDate),
    registrationOpenAt: toLocalInput(term.registrationOpenAt),
    registrationCloseAt: toLocalInput(term.registrationCloseAt),
    dropDeadline: toLocalInput(term.dropDeadline),
    maxCredits: term.maxCredits,
    timezone: term.timezone
  };
}

const blankForm: TermForm = {
  name: "", startDate: "", endDate: "", registrationOpenAt: "",
  registrationCloseAt: "", dropDeadline: "", maxCredits: 12, timezone: "America/Phoenix"
};

function TermFormFields({
  form, setForm, onSubmit, saving, submitLabel
}: {
  form: TermForm;
  setForm: (f: TermForm) => void;
  onSubmit: (e: FormEvent) => void;
  saving: boolean;
  submitLabel: string;
}) {
  const f = (key: keyof TermForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: key === "maxCredits" ? Number(e.target.value) : e.target.value });

  return (
    <form className="grid gap-3 md:grid-cols-4" onSubmit={onSubmit}>
      <div className="md:col-span-2">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Term name</label>
        <input className="campus-input" placeholder="Spring 2027" value={form.name} onChange={f("name")} required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Max credits</label>
        <input className="campus-input" type="number" min={1} value={form.maxCredits} onChange={f("maxCredits")} required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Timezone</label>
        <input className="campus-input" value={form.timezone} onChange={f("timezone")} required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Start date</label>
        <input className="campus-input" type="datetime-local" value={form.startDate} onChange={f("startDate")} required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">End date</label>
        <input className="campus-input" type="datetime-local" value={form.endDate} onChange={f("endDate")} required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Registration opens</label>
        <input className="campus-input" type="datetime-local" value={form.registrationOpenAt} onChange={f("registrationOpenAt")} required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Registration closes</label>
        <input className="campus-input" type="datetime-local" value={form.registrationCloseAt} onChange={f("registrationCloseAt")} required />
      </div>
      <div className="md:col-span-2">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Drop deadline</label>
        <input className="campus-input" type="datetime-local" value={form.dropDeadline} onChange={f("dropDeadline")} required />
      </div>
      <div className="md:col-span-2 md:flex md:items-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
        >
          {saving ? (
            <><span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />{submitLabel}…</>
          ) : submitLabel}
        </button>
      </div>
    </form>
  );
}

export default function TermsPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<TermForm>(blankForm);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TermForm>(blankForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  useEffect(() => { void load(); }, []);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      setCreating(true);
      await apiFetch("/admin/terms", {
        method: "POST",
        body: JSON.stringify({
          ...createForm,
          startDate: new Date(createForm.startDate).toISOString(),
          endDate: new Date(createForm.endDate).toISOString(),
          registrationOpenAt: new Date(createForm.registrationOpenAt).toISOString(),
          registrationCloseAt: new Date(createForm.registrationCloseAt).toISOString(),
          dropDeadline: new Date(createForm.dropDeadline).toISOString()
        })
      });
      setCreateForm(blankForm);
      setNotice("Term created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (term: Term) => {
    setEditingId(term.id);
    setEditForm(termToForm(term));
    setError("");
    setNotice("");
  };

  const cancelEdit = () => setEditingId(null);

  const onSaveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    setError("");
    setNotice("");
    try {
      setSavingEdit(true);
      await apiFetch(`/admin/terms/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...editForm,
          startDate: new Date(editForm.startDate).toISOString(),
          endDate: new Date(editForm.endDate).toISOString(),
          registrationOpenAt: new Date(editForm.registrationOpenAt).toISOString(),
          registrationCloseAt: new Date(editForm.registrationCloseAt).toISOString(),
          dropDeadline: new Date(editForm.dropDeadline).toISOString()
        })
      });
      setEditingId(null);
      setNotice("Term updated successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSavingEdit(false);
    }
  };

  const onDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete term "${name}"? This cannot be undone and will remove all associated enrollments.`)) return;
    setError("");
    setNotice("");
    try {
      setDeletingId(id);
      await apiFetch(`/admin/terms/${id}`, { method: "DELETE" });
      setNotice(`Term "${name}" deleted.`);
      if (editingId === id) setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const stats = useMemo(() => {
    if (terms.length === 0) return { total: 0, latest: "-" };
    const sorted = [...terms].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    return { total: terms.length, latest: sorted[0].name };
  }, [terms]);

  const exportCsv = () => {
    const rows = [
      ["Name", "Start Date", "End Date", "Reg Open", "Reg Close", "Drop Deadline", "Max Credits", "Timezone"],
      ...terms.map((term) => [
        term.name,
        new Date(term.startDate).toLocaleDateString(),
        new Date(term.endDate).toLocaleDateString(),
        new Date(term.registrationOpenAt).toLocaleString(),
        new Date(term.registrationCloseAt).toLocaleString(),
        new Date(term.dropDeadline).toLocaleString(),
        String(term.maxCredits),
        term.timezone
      ])
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `terms-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Academic Calendar Control</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">Terms</h1>
            <p className="text-sm text-slate-600 md:text-base">
              Create and manage registration windows, drop deadlines, and per-term credit caps.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{stats.total} term(s)</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">Latest: {stats.latest}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={terms.length === 0}
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
        <h2 className="mb-3 text-base font-semibold text-slate-900">Create New Term</h2>
        <TermFormFields form={createForm} setForm={setCreateForm} onSubmit={onCreate} saving={creating} submitLabel="Create term" />
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      {editingId ? (
        <section className="campus-card border-blue-200 bg-blue-50/60 p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-blue-900">Editing: {editForm.name}</h2>
            <button type="button" onClick={cancelEdit} className="text-sm font-medium text-blue-700 underline underline-offset-2">
              Cancel
            </button>
          </div>
          <TermFormFields form={editForm} setForm={setEditForm} onSubmit={onSaveEdit} saving={savingEdit} submitLabel="Save changes" />
        </section>
      ) : null}

      <section className="campus-card overflow-hidden">
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">Term</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Date Range</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Registration Window</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Drop Deadline</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Max Cr.</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading terms...</td>
                </tr>
              ) : terms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">No terms yet. Create one above.</td>
                </tr>
              ) : (
                terms.map((term) => (
                  <tr
                    key={term.id}
                    className={`border-b border-slate-100 hover:bg-slate-100/60 ${editingId === term.id ? "bg-blue-50/40 outline outline-1 outline-blue-200" : "odd:bg-white even:bg-slate-50/40"}`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">{term.name}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(term.startDate).toLocaleDateString()} – {new Date(term.endDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(term.registrationOpenAt).toLocaleString()} –{" "}
                      {new Date(term.registrationCloseAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{new Date(term.dropDeadline).toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-700">{term.maxCredits}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => editingId === term.id ? cancelEdit() : startEdit(term)}
                          className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          {editingId === term.id ? "Cancel" : "Edit"}
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === term.id}
                          onClick={() => void onDelete(term.id, term.name)}
                          className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingId === term.id ? "…" : "Delete"}
                        </button>
                      </div>
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
