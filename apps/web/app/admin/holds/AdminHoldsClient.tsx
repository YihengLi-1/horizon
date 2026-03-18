"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type HoldType = "REGISTRATION" | "ACADEMIC" | "FINANCIAL";

type HoldRecord = {
  id: string;
  type: HoldType;
  reason: string;
  note?: string | null;
  expiresAt?: string | null;
  active: boolean;
  createdAt: string;
  resolvedAt?: string | null;
  student: {
    id: string;
    email: string;
    studentId: string | null;
    studentProfile?: { legalName?: string | null } | null;
  };
  createdBy?: { email: string; role: string } | null;
  resolvedBy?: { email: string; role: string } | null;
};

type StudentOption = {
  id: string;
  email: string;
  studentId: string | null;
  studentProfile?: { legalName?: string | null } | null;
};

type StudentListResponse = {
  data: StudentOption[];
  total: number;
  page: number;
  pageSize: number;
};

const HOLD_TYPES: HoldType[] = ["REGISTRATION", "ACADEMIC", "FINANCIAL"];

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function holdTone(type: HoldType) {
  if (type === "FINANCIAL") return "border-amber-200 bg-amber-50 text-amber-700";
  if (type === "ACADEMIC") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-red-200 bg-red-50 text-red-700";
}

export default function AdminHoldsClient() {
  const [holds, setHolds] = useState<HoldRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentError, setStudentError] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);
  const [type, setType] = useState<HoldType>("REGISTRATION");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState("");

  const loadHolds = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<HoldRecord[]>("/admin/holds");
      setHolds(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "限制记录加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHolds();
  }, []);

  useEffect(() => {
    if (!studentQuery.trim()) {
      setStudentOptions([]);
      setStudentError("");
      return;
    }

    const handle = window.setTimeout(async () => {
      try {
        setStudentLoading(true);
        setStudentError("");
        const result = await apiFetch<StudentListResponse>(`/admin/students?search=${encodeURIComponent(studentQuery.trim())}&pageSize=20`);
        setStudentOptions(result.data ?? []);
      } catch (err) {
        setStudentOptions([]);
        setStudentError(err instanceof Error ? err.message : "学生搜索失败");
      } finally {
        setStudentLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(handle);
  }, [studentQuery]);

  const filteredHolds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return holds;
    return holds.filter((hold) => {
      const haystack = [
        hold.type,
        hold.reason,
        hold.note ?? "",
        hold.student.email,
        hold.student.studentId ?? "",
        hold.student.studentProfile?.legalName ?? ""
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [holds, search]);

  const activeCount = useMemo(() => holds.filter((hold) => hold.active).length, [holds]);

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedStudent) {
      setError("请先选择学生后再创建限制。");
      return;
    }

    try {
      setCreating(true);
      setError("");
      setNotice("");
      await apiFetch("/admin/holds", {
        method: "POST",
        body: JSON.stringify({
          studentId: selectedStudent.id,
          type,
          reason: reason.trim(),
          note: note.trim() || null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null
        })
      });
      setNotice(`Created ${type} hold for ${selectedStudent.studentProfile?.legalName || selectedStudent.email}.`);
      setReason("");
      setNote("");
      setExpiresAt("");
      setSelectedStudent(null);
      setStudentQuery("");
      setStudentOptions([]);
      await loadHolds();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建限制失败");
    } finally {
      setCreating(false);
    }
  };

  const resolveHold = async (holdId: string) => {
    try {
      setResolvingId(holdId);
      setError("");
      setNotice("");
      await apiFetch(`/admin/holds/${holdId}`, {
        method: "DELETE",
        body: JSON.stringify({
          resolutionNote: resolveNotes[holdId]?.trim() || null
        })
      });
      setResolveNotes((prev) => ({ ...prev, [holdId]: "" }));
      setNotice("限制已移除。");
      await loadHolds();
    } catch (err) {
      setError(err instanceof Error ? err.message : "移除限制失败");
    } finally {
      setResolvingId("");
    }
  };

  return (
    <div className="campus-page space-y-5">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="campus-eyebrow">合规管理</p>
            <h1 className="font-heading text-3xl font-bold text-slate-900">学生保留</h1>
            <p className="mt-2 text-sm text-slate-600">
              Create and remove registration-blocking holds through the product UI.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="campus-kpi border-slate-200 bg-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">学籍限制总数</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{holds.length}</p>
            </div>
            <div className="campus-kpi border-red-200 bg-red-50">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">生效中</p>
              <p className="mt-1 text-2xl font-semibold text-red-900">{activeCount}</p>
            </div>
          </div>
        </div>
      </section>

      <div aria-live="polite" className="space-y-3">
        {notice ? <div className="campus-card border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div> : null}
        {error ? <div className="campus-card border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      </div>

      <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <form className="campus-card space-y-4 p-5" onSubmit={submitCreate}>
          <div>
            <h2 className="text-base font-semibold text-slate-900">创建限制</h2>
            <p className="mt-1 text-sm text-slate-600">搜索学生，选择类型，并清楚记录原因。</p>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">搜索学生</span>
            <input
              className="campus-input"
              value={studentQuery}
              onChange={(event) => setStudentQuery(event.target.value)}
              placeholder="邮箱、学号或姓名"
            />
          </label>

          {selectedStudent ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-semibold">{selectedStudent.studentProfile?.legalName || selectedStudent.email}</p>
              <p className="mt-1 text-xs text-blue-700">{selectedStudent.email} · {selectedStudent.studentId || "无学号"}</p>
            </div>
          ) : null}

          {studentLoading ? <p className="text-xs text-slate-500">搜索学生中…</p> : null}
          {studentError ? <p className="text-xs text-red-700">{studentError}</p> : null}
          {!selectedStudent && studentOptions.length > 0 ? (
            <div className="max-h-56 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
              {studentOptions.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => setSelectedStudent(student)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-slate-50"
                >
                  <p className="font-semibold">{student.studentProfile?.legalName || student.email}</p>
                  <p className="mt-1 text-xs text-slate-500">{student.email} · {student.studentId || "无学号"}</p>
                </button>
              ))}
            </div>
          ) : null}

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">保留类型</span>
            <select className="campus-select" value={type} onChange={(event) => setType(event.target.value as HoldType)}>
              {HOLD_TYPES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">原因</span>
            <input className="campus-input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例：教务处审核" />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">备注</span>
            <textarea className="campus-input min-h-28" value={note} onChange={(event) => setNote(event.target.value)} placeholder="显示在保留详情中的备注" />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">过期时间（选填）</span>
            <input className="campus-input" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </label>

          <button
            type="submit"
            disabled={creating || !selectedStudent || reason.trim().length < 3}
            className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? "创建中…" : "创建保留"}
          </button>
        </form>

        <section className="space-y-4">
          <div className="campus-toolbar">
            <label className="block max-w-md flex-1">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">筛选保留记录</span>
              <input
                className="campus-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="按学生、类型、原因或备注搜索"
              />
            </label>
            <button
              type="button"
              onClick={() => void loadHolds()}
              disabled={loading}
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "刷新中…" : "刷新"}
            </button>
          </div>

          {loading ? (
            <div className="campus-card p-5 text-sm text-slate-500">加载学籍限制中…</div>
          ) : filteredHolds.length === 0 ? (
            <div className="campus-card p-5 text-sm text-slate-500">暂无符合条件的学籍限制记录。</div>
          ) : (
            filteredHolds.map((hold) => (
              <article key={hold.id} className={`campus-card space-y-3 p-5 ${hold.active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`campus-chip text-xs ${holdTone(hold.type)}`}>{hold.type}</span>
                      <span className={`campus-chip text-xs ${hold.active ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-slate-100 text-slate-600"}`}>
                        {hold.active ? "生效中" : "已解除"}
                      </span>
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-slate-900">{hold.student.studentProfile?.legalName || hold.student.email}</h3>
                    <p className="mt-1 text-sm text-slate-500">{hold.student.email} · {hold.student.studentId || "无学号"}</p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>创建于 {formatDateTime(hold.createdAt)}</p>
                    <p>{hold.createdBy?.email || "未知操作者"}</p>
                    {hold.expiresAt ? <p>过期：{formatDateTime(hold.expiresAt)}</p> : null}
                    {hold.resolvedAt ? <p>解除于 {formatDateTime(hold.resolvedAt)}</p> : null}
                    {hold.resolvedBy?.email ? <p>{hold.resolvedBy.email}</p> : null}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">{hold.reason}</p>
                  {hold.note ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{hold.note}</p> : null}
                </div>

                {hold.active ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">解除备注</span>
                      <textarea
                        className="campus-input min-h-20"
                        value={resolveNotes[hold.id] ?? ""}
                        onChange={(event) => setResolveNotes((prev) => ({ ...prev, [hold.id]: event.target.value }))}
                        placeholder="说明移除原因（选填）"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void resolveHold(hold.id)}
                      disabled={resolvingId === hold.id}
                      className="mt-3 inline-flex h-9 items-center rounded-lg border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {resolvingId === hold.id ? "移除中…" : "移除保留"}
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </section>
      </section>
    </div>
  );
}
