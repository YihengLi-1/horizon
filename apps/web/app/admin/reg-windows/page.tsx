"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type WindowRow = {
  id: string;
  name: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  status: "open" | "closed" | "scheduled";
};

type Drafts = Record<string, { openAt: string; closeAt: string }>;

function tone(status: WindowRow["status"]) {
  if (status === "open") return "campus-chip chip-emerald";
  if (status === "scheduled") return "campus-chip chip-blue";
  return "campus-chip chip-amber";
}

function toLocalValue(value: string) {
  const date = new Date(value);
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

export default function AdminRegWindowsPage() {
  const [rows, setRows] = useState<WindowRow[]>([]);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<WindowRow[]>("/admin/reg-windows");
      setRows(data ?? []);
      setDrafts(
        Object.fromEntries((data ?? []).map((row) => [row.id, { openAt: toLocalValue(row.registrationOpenAt), closeAt: toLocalValue(row.registrationCloseAt) }]))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载注册窗口失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

  async function saveRow(termId: string) {
    const draft = drafts[termId];
    if (!draft) return;
    setSavingId(termId);
    setNotice("");
    setError("");
    try {
      await apiFetch(`/admin/reg-windows/${termId}`, {
        method: "PATCH",
        body: JSON.stringify({
          openAt: new Date(draft.openAt).toISOString(),
          closeAt: new Date(draft.closeAt).toISOString()
        })
      });
      setNotice("窗口已更新");
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Registration Operations</p>
        <h1 className="campus-title">注册窗口管理</h1>
        <p className="campus-subtitle">统一查看各学期注册窗口，并直接内联调整开放与关闭时间。</p>
      </section>

      {notice ? <div className="campus-card border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
      {error ? <div className="campus-card border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">加载中…</div>
      ) : (
        <div className="campus-card overflow-x-auto">
          <table className="campus-table min-w-[940px]">
            <thead>
              <tr>
                <th>学期</th>
                <th>状态</th>
                <th>开放时间</th>
                <th>关闭时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="font-semibold text-slate-900">{row.name}</td>
                  <td><span className={tone(row.status)}>{row.status}</span></td>
                  <td>
                    <input
                      type="datetime-local"
                      className="campus-input"
                      value={drafts[row.id]?.openAt ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [row.id]: { ...prev[row.id], openAt: e.target.value } }))}
                    />
                  </td>
                  <td>
                    <input
                      type="datetime-local"
                      className="campus-input"
                      value={drafts[row.id]?.closeAt ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [row.id]: { ...prev[row.id], closeAt: e.target.value } }))}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => void saveRow(row.id)}
                      disabled={savingId === row.id}
                      className="rounded-lg bg-[hsl(221_83%_43%)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(221_83%_38%)] disabled:opacity-50"
                    >
                      {savingId === row.id ? "保存中…" : "保存"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
