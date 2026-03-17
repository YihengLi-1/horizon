"use client";

import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type TabKey = "enroll" | "drop" | "status";

type BulkEnrollResult = {
  succeeded: string[];
  failed: Array<{ studentId: string; reason: string }>;
};

type BulkDropResult = {
  succeeded: number;
  failed: Array<{ enrollmentId: string; reason: string }>;
};

type BulkStatusResult = {
  updated: number;
};

function parseIds(value: string) {
  return Array.from(new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)));
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, "\"\"")}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminBulkOpsPage() {
  const [tab, setTab] = useState<TabKey>("enroll");
  const [sectionId, setSectionId] = useState("");
  const [studentIdsText, setStudentIdsText] = useState("");
  const [enrollmentIdsText, setEnrollmentIdsText] = useState("");
  const [statusStudentIdsText, setStatusStudentIdsText] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [enrollResult, setEnrollResult] = useState<BulkEnrollResult | null>(null);
  const [dropResult, setDropResult] = useState<BulkDropResult | null>(null);
  const [statusResult, setStatusResult] = useState<BulkStatusResult | null>(null);

  const parsedStudentIds = useMemo(() => parseIds(studentIdsText), [studentIdsText]);
  const parsedEnrollmentIds = useMemo(() => parseIds(enrollmentIdsText), [enrollmentIdsText]);
  const parsedStatusStudentIds = useMemo(() => parseIds(statusStudentIdsText), [statusStudentIdsText]);

  async function runBulkEnroll() {
    setLoading(true);
    setError("");
    setDropResult(null);
    setStatusResult(null);
    try {
      const result = await apiFetch<BulkEnrollResult>("/admin/bulk-enroll", {
        method: "POST",
        body: JSON.stringify({
          sectionId,
          studentIds: parsedStudentIds
        })
      });
      setEnrollResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量选课失败");
    } finally {
      setLoading(false);
    }
  }

  async function runBulkDrop() {
    setLoading(true);
    setError("");
    setEnrollResult(null);
    setStatusResult(null);
    try {
      const result = await apiFetch<BulkDropResult>("/admin/bulk-drop", {
        method: "POST",
        body: JSON.stringify({
          enrollmentIds: parsedEnrollmentIds
        })
      });
      setDropResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量退课失败");
    } finally {
      setLoading(false);
    }
  }

  async function runBulkStatus() {
    setLoading(true);
    setError("");
    setEnrollResult(null);
    setDropResult(null);
    try {
      const result = await apiFetch<BulkStatusResult>("/admin/bulk-update-status", {
        method: "POST",
        body: JSON.stringify({
          studentIds: parsedStatusStudentIds,
          status
        })
      });
      setStatusResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量改状态失败");
    } finally {
      setLoading(false);
    }
  }

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "enroll", label: "批量选课" },
    { key: "drop", label: "批量退课" },
    { key: "status", label: "批量改状态" }
  ];

  return (
    <div className="campus-page space-y-6">
      <section
        className="campus-hero"
        style={{ background: "linear-gradient(135deg, hsl(38 100% 97%) 0%, white 60%)" }}
      >
        <p className="campus-eyebrow" style={{ color: "hsl(32 75% 40%)" }}>Registrar Tools</p>
        <h1 className="campus-title">批量操作中心</h1>
        <p className="campus-subtitle">谨慎操作，此处修改不可撤销。</p>
      </section>

      <div className="campus-card p-2">
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === item.key
                  ? "bg-[hsl(221_83%_43%)] text-white"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="campus-card border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {tab === "enroll" ? (
        <div className="campus-card space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-[220px,1fr]">
            <input className="campus-input" placeholder="Section ID" value={sectionId} onChange={(e) => setSectionId(e.target.value)} />
            <textarea
              className="min-h-[220px] rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700 outline-none focus:border-[hsl(221_83%_55%)] focus:ring-4 focus:ring-[hsl(221_83%_55%_/_0.15)]"
              placeholder="每行一个 studentId，或用逗号分隔"
              value={studentIdsText}
              onChange={(e) => setStudentIdsText(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="campus-chip chip-blue">已解析 {parsedStudentIds.length} 个 studentId</span>
            <button
              type="button"
              onClick={() => void runBulkEnroll()}
              disabled={loading || !sectionId.trim() || parsedStudentIds.length === 0}
              className="rounded-lg bg-[hsl(221_83%_43%)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(221_83%_38%)] disabled:opacity-50"
            >
              {loading ? "执行中…" : "执行"}
            </button>
          </div>
        </div>
      ) : null}

      {tab === "drop" ? (
        <div className="campus-card space-y-4 p-5">
          <textarea
            className="min-h-[220px] rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700 outline-none focus:border-[hsl(221_83%_55%)] focus:ring-4 focus:ring-[hsl(221_83%_55%_/_0.15)]"
            placeholder="每行一个 enrollmentId，或用逗号分隔"
            value={enrollmentIdsText}
            onChange={(e) => setEnrollmentIdsText(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="campus-chip chip-blue">已解析 {parsedEnrollmentIds.length} 个 enrollmentId</span>
            <button
              type="button"
              onClick={() => void runBulkDrop()}
              disabled={loading || parsedEnrollmentIds.length === 0}
              className="rounded-lg bg-[hsl(221_83%_43%)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(221_83%_38%)] disabled:opacity-50"
            >
              {loading ? "执行中…" : "执行"}
            </button>
          </div>
        </div>
      ) : null}

      {tab === "status" ? (
        <div className="campus-card space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-[1fr,220px]">
            <textarea
              className="min-h-[220px] rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700 outline-none focus:border-[hsl(221_83%_55%)] focus:ring-4 focus:ring-[hsl(221_83%_55%_/_0.15)]"
              placeholder="每行一个 studentId，或用逗号分隔"
              value={statusStudentIdsText}
              onChange={(e) => setStatusStudentIdsText(e.target.value)}
            />
            <select className="campus-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="campus-chip chip-blue">已解析 {parsedStatusStudentIds.length} 个 studentId</span>
            <button
              type="button"
              onClick={() => void runBulkStatus()}
              disabled={loading || parsedStatusStudentIds.length === 0}
              className="rounded-lg bg-[hsl(221_83%_43%)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(221_83%_38%)] disabled:opacity-50"
            >
              {loading ? "执行中…" : "执行"}
            </button>
          </div>
        </div>
      ) : null}

      {enrollResult ? (
        <div className="campus-card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="campus-chip chip-emerald">成功 {enrollResult.succeeded.length}</span>
            <span className="campus-chip chip-red">失败 {enrollResult.failed.length}</span>
            {enrollResult.failed.length > 0 ? (
              <button
                type="button"
                onClick={() => downloadCsv("bulk-enroll-failed.csv", [["studentId", "reason"], ...enrollResult.failed.map((item) => [item.studentId, item.reason])])}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                导出失败列表
              </button>
            ) : null}
          </div>
          {enrollResult.failed.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="campus-table">
                <thead><tr><th>Student ID</th><th>Reason</th></tr></thead>
                <tbody>{enrollResult.failed.map((item) => <tr key={item.studentId}><td>{item.studentId}</td><td>{item.reason}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {dropResult ? (
        <div className="campus-card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="campus-chip chip-emerald">成功 {dropResult.succeeded}</span>
            <span className="campus-chip chip-red">失败 {dropResult.failed.length}</span>
            {dropResult.failed.length > 0 ? (
              <button
                type="button"
                onClick={() => downloadCsv("bulk-drop-failed.csv", [["enrollmentId", "reason"], ...dropResult.failed.map((item) => [item.enrollmentId, item.reason])])}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                导出失败列表
              </button>
            ) : null}
          </div>
          {dropResult.failed.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="campus-table">
                <thead><tr><th>Enrollment ID</th><th>Reason</th></tr></thead>
                <tbody>{dropResult.failed.map((item) => <tr key={item.enrollmentId}><td>{item.enrollmentId}</td><td>{item.reason}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {statusResult ? (
        <div className="campus-card space-y-3 p-5">
          <span className="campus-chip chip-emerald">已更新 {statusResult.updated} 条</span>
        </div>
      ) : null}
    </div>
  );
}
