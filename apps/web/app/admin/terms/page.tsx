"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { apiFetch } from "@/lib/api";

type Term = {
  id: string;
  name: string;
  maxCredits: number;
  registrationOpen: boolean;
  timezone: string;
  startDate: string;
  endDate: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  dropDeadline: string;
  sectionCount?: number;
  enrollmentCount?: number;
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
  registrationOpen: boolean;
};

const blankForm: TermForm = {
  name: "",
  startDate: "",
  endDate: "",
  registrationOpenAt: "",
  registrationCloseAt: "",
  dropDeadline: "",
  maxCredits: 18,
  timezone: "America/Phoenix",
  registrationOpen: true
};

function toLocalInput(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function shiftMonths(localValue: string, months: number): string {
  if (!localValue) return "";
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return localValue;
  date.setMonth(date.getMonth() + months);
  return toLocalInput(date.toISOString());
}

function termStatusBadge(term: Term): { label: string; cls: string } {
  const now = Date.now();
  const start = new Date(term.startDate).getTime();
  const end = new Date(term.endDate).getTime();
  const regOpen = new Date(term.registrationOpenAt).getTime();
  const regClose = new Date(term.registrationCloseAt).getTime();

  if (now > end) return { label: "已结束", cls: "border-slate-300 bg-slate-100 text-slate-500" };
  if (now >= regOpen && now <= regClose) return { label: "注册开放中", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (now >= start && now <= end) return { label: "进行中", cls: "border-blue-200 bg-blue-50 text-blue-700" };
  return { label: "即将开始", cls: "border-amber-200 bg-amber-50 text-amber-700" };
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
    timezone: term.timezone,
    registrationOpen: term.registrationOpen
  };
}

function TermFormFields({
  form,
  setForm,
  onSubmit,
  saving,
  submitLabel,
  onCancel
}: {
  form: TermForm;
  setForm: (next: TermForm) => void;
  onSubmit: (event: FormEvent) => void;
  saving: boolean;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const onInput =
    (key: keyof TermForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm({
        ...form,
        [key]:
          key === "maxCredits"
            ? Number(event.target.value)
            : key === "registrationOpen"
              ? event.target.checked
              : event.target.value
      });
    };

  return (
    <form className="grid gap-3 md:grid-cols-4" onSubmit={onSubmit}>
      <div className="md:col-span-2">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">学期名称</label>
        <input className="campus-input" placeholder="2027年春季" value={form.name} onChange={onInput("name")} required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">最大学分</label>
        <input className="campus-input" type="number" min={1} value={form.maxCredits} onChange={onInput("maxCredits")} required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">时区</label>
        <input className="campus-input" value={form.timezone} onChange={onInput("timezone")} required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">开始时间</label>
        <input className="campus-input" type="datetime-local" value={form.startDate} onChange={onInput("startDate")} required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">结束时间</label>
        <input className="campus-input" type="datetime-local" value={form.endDate} onChange={onInput("endDate")} required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">开放注册</label>
        <input className="campus-input" type="datetime-local" value={form.registrationOpenAt} onChange={onInput("registrationOpenAt")} required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">关闭注册</label>
        <input className="campus-input" type="datetime-local" value={form.registrationCloseAt} onChange={onInput("registrationCloseAt")} required />
      </div>
      <div className="md:col-span-2">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">退课截止</label>
        <input className="campus-input" type="datetime-local" value={form.dropDeadline} onChange={onInput("dropDeadline")} required />
      </div>
      <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 md:col-span-2">
        <input type="checkbox" checked={form.registrationOpen} onChange={onInput("registrationOpen")} className="size-4 accent-slate-900" />
        registrationOpen / 开放中
      </label>
      <div className="md:col-span-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <><span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Saving…</> : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export default function TermsPage() {
  const toast = useToast();
  const [terms, setTerms] = useState<Term[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<TermForm>(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TermForm>(blankForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<Term[]>("/admin/terms");
      setTerms([...data].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "学期加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    if (terms.length === 0) {
      return { total: 0, active: 0, totalSections: 0, totalEnrollments: 0 };
    }
    return {
      total: terms.length,
      active: terms.filter((term) => term.registrationOpen).length,
      totalSections: terms.reduce((sum, term) => sum + (term.sectionCount ?? 0), 0),
      totalEnrollments: terms.reduce((sum, term) => sum + (term.enrollmentCount ?? 0), 0)
    };
  }, [terms]);

  const toPayload = (form: TermForm) => ({
    ...form,
    startDate: new Date(form.startDate).toISOString(),
    endDate: new Date(form.endDate).toISOString(),
    registrationOpenAt: new Date(form.registrationOpenAt).toISOString(),
    registrationCloseAt: new Date(form.registrationCloseAt).toISOString(),
    dropDeadline: new Date(form.dropDeadline).toISOString()
  });

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    try {
      setCreating(true);
      await apiFetch("/admin/terms", { method: "POST", body: JSON.stringify(toPayload(createForm)) });
      setCreateForm(blankForm);
      setShowCreateForm(false);
      setNotice("学期创建成功。");
      toast("学期已创建", "success");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "创建失败";
      setError(message);
      toast(message, "error");
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

  const onSaveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    setError("");
    setNotice("");
    try {
      setSavingEdit(true);
      await apiFetch(`/admin/terms/${editingId}`, { method: "PATCH", body: JSON.stringify(toPayload(editForm)) });
      setEditingId(null);
      setNotice("学期更新成功。");
      toast("学期已更新", "success");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "更新失败";
      setError(message);
      toast(message, "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const onDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete term \"${name}\"?`)) return;
    try {
      setDeletingId(id);
      setError("");
      await apiFetch(`/admin/terms/${id}`, { method: "DELETE" });
      toast(`已删除学期 ${name}`, "success");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败";
      setError(message);
      toast(message.includes("active") ? "此学期有学生在读，无法删除" : message, "error");
    } finally {
      setDeletingId(null);
    }
  };

  const onToggleRegistration = async (term: Term) => {
    const previous = terms;
    setTerms((current) => current.map((item) => (item.id === term.id ? { ...item, registrationOpen: !item.registrationOpen } : item)));
    try {
      setTogglingId(term.id);
      await apiFetch(`/admin/terms/${term.id}/toggle-registration`, { method: "PATCH" });
      toast(term.registrationOpen ? "注册已关闭" : "注册已开放", "success");
      await load();
    } catch (err) {
      setTerms(previous);
      const message = err instanceof Error ? err.message : "切换失败";
      setError(message);
      toast(message, "error");
    } finally {
      setTogglingId(null);
    }
  };

  const copyTerm = (term: Term) => {
    const base = termToForm(term);
    setCreateForm({
      ...base,
      name: `${term.name} (Copy)`,
      startDate: shiftMonths(base.startDate, 6),
      endDate: shiftMonths(base.endDate, 6),
      registrationOpenAt: shiftMonths(base.registrationOpenAt, 6),
      registrationCloseAt: shiftMonths(base.registrationCloseAt, 6),
      dropDeadline: shiftMonths(base.dropDeadline, 6),
      registrationOpen: false
    });
    setShowCreateForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const exportCsv = () => {
    const rows = [
      ["学期名称", "开始时间", "结束时间", "注册开放", "注册截止", "退课截止", "最大学分", "时区", "教学班数", "报名人数"],
      ...terms.map((term) => [
        term.name,
        new Date(term.startDate).toLocaleDateString(),
        new Date(term.endDate).toLocaleDateString(),
        new Date(term.registrationOpenAt).toLocaleString(),
        new Date(term.registrationCloseAt).toLocaleString(),
        new Date(term.dropDeadline).toLocaleString(),
        String(term.maxCredits),
        term.timezone,
        String(term.sectionCount ?? 0),
        String(term.enrollmentCount ?? 0)
      ])
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = Object.assign(document.createElement("a"), {
      href: url,
      download: `terms-${new Date().toISOString().slice(0, 10)}.csv`
    });
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">教学日历管理</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">学期管理</h1>
            <p className="text-sm text-slate-600 md:text-base">Create, copy, and manage registration windows, drop deadlines, and per-term credit caps.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{stats.total} term(s)</span>
              <span className="campus-chip border-emerald-200 bg-emerald-50 text-emerald-700">{stats.active} active</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm((prev) => !prev)}
              className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90"
            >
              {showCreateForm ? "收起" : "新增学期"}
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={terms.length === 0}
              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
            >
              CSV 导出
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="campus-kpi border-slate-200 bg-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">学期总数</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.total}</p>
        </div>
        <div className="campus-kpi border-emerald-200 bg-emerald-50/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">活跃学期</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-900">{stats.active}</p>
        </div>
        <div className="campus-kpi border-blue-200 bg-blue-50/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">教学班总数</p>
          <p className="mt-1 text-2xl font-semibold text-blue-900">{stats.totalSections}</p>
        </div>
        <div className="campus-kpi border-amber-200 bg-amber-50/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">报名总数</p>
          <p className="mt-1 text-2xl font-semibold text-amber-900">{stats.totalEnrollments}</p>
        </div>
      </section>

      {showCreateForm ? (
        <section className="campus-card p-5 md:p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">新增学期</h2>
            <button type="button" onClick={() => { setShowCreateForm(false); setCreateForm(blankForm); }} className="text-xs font-medium text-slate-500 hover:text-slate-700">
              Reset
            </button>
          </div>
          <TermFormFields form={createForm} setForm={setCreateForm} onSubmit={onCreate} saving={creating} submitLabel="创建学期" />
        </section>
      ) : null}

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      {editingId ? (
        <section className="campus-card border-blue-200 bg-blue-50/60 p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-blue-900">编辑学期</h2>
            <button type="button" onClick={() => setEditingId(null)} className="text-sm font-medium text-blue-700 underline underline-offset-2">取消</button>
          </div>
          <TermFormFields form={editForm} setForm={setEditForm} onSubmit={onSaveEdit} saving={savingEdit} submitLabel="保存更改" onCancel={() => setEditingId(null)} />
        </section>
      ) : null}

      <section className="campus-card overflow-hidden">
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">学期</th>
                <th className="px-4 py-3 font-semibold text-slate-700">状态</th>
                <th className="px-4 py-3 font-semibold text-slate-700">教学班</th>
                <th className="px-4 py-3 font-semibold text-slate-700">报名</th>
                <th className="px-4 py-3 font-semibold text-slate-700">注册</th>
                <th className="px-4 py-3 font-semibold text-slate-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">加载学期数据中...</td></tr>
              ) : terms.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">暂无学期记录。</td></tr>
              ) : (
                terms.map((term) => {
                  const badge = termStatusBadge(term);
                  return (
                    <tr key={term.id} className={`border-b border-slate-100 ${term.registrationOpen ? "border-l-4 border-l-emerald-400" : ""} hover:bg-slate-50`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{term.name}</p>
                        <p className="text-xs text-slate-500">{new Date(term.startDate).toLocaleDateString()} – {new Date(term.endDate).toLocaleDateString()}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{term.sectionCount ?? 0}</td>
                      <td className="px-4 py-3 text-slate-700">{term.enrollmentCount ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            disabled={togglingId === term.id}
                            onClick={() => void onToggleRegistration(term)}
                            className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${term.registrationOpen ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}
                          >
                            {togglingId === term.id ? "更新中…" : term.registrationOpen ? "开放中" : "已关闭"}
                          </button>
                          <span className="text-xs text-slate-500">dropDeadline: {new Date(term.dropDeadline).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => startEdit(term)} className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50">编辑</button>
                          <button type="button" onClick={() => copyTerm(term)} className="inline-flex h-8 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-medium text-blue-700 transition hover:bg-blue-100">复制学期</button>
                          <button type="button" disabled={deletingId === term.id} onClick={() => void onDelete(term.id, term.name)} className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50">{deletingId === term.id ? "…" : "删除"}</button>
                        </div>
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
