"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ConfirmDialog } from "@/components/confirm-dialog";

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

type StudentRow = {
  id: string;
  email: string;
  studentId: string | null;
  studentProfile?: {
    legalName?: string | null;
    programMajor?: string | null;
  } | null;
};

type StudentListResponse = {
  data: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
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
  const [confirmState, setConfirmState] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [enrollResult, setEnrollResult] = useState<BulkEnrollResult | null>(null);
  const [dropResult, setDropResult] = useState<BulkDropResult | null>(null);
  const [statusResult, setStatusResult] = useState<BulkStatusResult | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState("");

  const parsedStudentIds = useMemo(() => parseIds(studentIdsText), [studentIdsText]);
  const parsedEnrollmentIds = useMemo(() => parseIds(enrollmentIdsText), [enrollmentIdsText]);
  const parsedStatusStudentIds = useMemo(() => parseIds(statusStudentIdsText), [statusStudentIdsText]);
  const visibleStudents = useMemo(() => {
    const keyword = studentSearch.trim().toLowerCase();
    if (!keyword) return students;
    return students.filter((student) =>
      [student.email, student.studentId ?? "", student.studentProfile?.legalName ?? "", student.studentProfile?.programMajor ?? ""]
        .some((value) => value.toLowerCase().includes(keyword))
    );
  }, [studentSearch, students]);

  useEffect(() => {
    let active = true;
    setLoadingStudents(true);
    void apiFetch<StudentListResponse>("/admin/students?pageSize=200")
      .then((result) => {
        if (!active) return;
        setStudents(result.data ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "学生列表加载失败");
      })
      .finally(() => {
        if (active) setLoadingStudents(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]
    );
  }

  function fillSelectedStudents(target: "enroll" | "status") {
    const nextValue = selectedStudentIds.join("\n");
    if (target === "enroll") setStudentIdsText(nextValue);
    if (target === "status") setStatusStudentIdsText(nextValue);
  }

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
      <section className="campus-hero">
        <p className="campus-eyebrow">教务工具</p>
        <h1 className="campus-title">批量操作中心</h1>
        <p className="campus-subtitle">谨慎操作，此处修改不可撤销。</p>
      </section>

      <div className="campus-card border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        批量操作按条逐个执行，已成功的记录不会在后续失败时自动回滚。执行后请先查看成功/失败汇总，再决定是否重试失败项。
      </div>

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
        <div className="grid gap-6 xl:grid-cols-[1.25fr,0.95fr]">
          <div className="campus-card space-y-4 p-5">
            <div className="grid gap-4 md:grid-cols-[220px,1fr]">
              <input className="campus-input" placeholder="班级ID" value={sectionId} onChange={(e) => setSectionId(e.target.value)} />
              <textarea
                className="min-h-[220px] rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700 outline-none focus:border-[hsl(221_83%_55%)] focus:ring-4 focus:ring-[hsl(221_83%_55%_/_0.15)]"
                placeholder="每行一个 studentId，或用逗号分隔"
                value={studentIdsText}
                onChange={(e) => setStudentIdsText(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="campus-chip chip-blue">已解析 {parsedStudentIds.length} 名学生</span>
              <button
                type="button"
                onClick={() => setConfirmState({
                  title: "批量选课",
                  message: `确认将 ${parsedStudentIds.length} 名学生批量加入班级？此操作不可撤销。`,
                  onConfirm: () => { setConfirmState(null); void runBulkEnroll(); },
                })}
                disabled={loading || !sectionId.trim() || parsedStudentIds.length === 0}
                className="rounded-lg bg-[hsl(221_83%_43%)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(221_83%_38%)] disabled:opacity-50"
              >
                {loading ? "执行中…" : "执行"}
              </button>
            </div>
          </div>

          <div className="campus-card space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">真实学生列表</h2>
                <p className="text-xs text-slate-500">勾选后可直接回填到批量选课名单，减少手工录入错误。</p>
              </div>
              <button
                type="button"
                onClick={() => fillSelectedStudents("enroll")}
                disabled={selectedStudentIds.length === 0}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                将选中学生填入名单
              </button>
            </div>
            <input
              className="campus-input"
              placeholder="按姓名 / 邮箱 / 学号筛选"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="max-h-[360px] overflow-y-auto">
                {loadingStudents ? (
                  <div className="px-4 py-10 text-center text-sm text-slate-500">加载学生中…</div>
                ) : visibleStudents.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-slate-500">没有匹配的学生。</div>
                ) : (
                  <table className="campus-table">
                    <thead>
                      <tr>
                        <th className="w-12">选择</th>
                        <th>学生</th>
                        <th>学号</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleStudents.map((student) => {
                        const checked = selectedStudentIds.includes(student.id);
                        return (
                          <tr key={student.id}>
                            <td>
                              <input type="checkbox" checked={checked} onChange={() => toggleStudent(student.id)} />
                            </td>
                            <td>
                              <div className="space-y-0.5">
                                <div className="font-medium text-slate-900">{student.studentProfile?.legalName || student.email}</div>
                                <div className="text-xs text-slate-500">{student.email}</div>
                              </div>
                            </td>
                            <td>{student.studentId || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
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
            <span className="campus-chip chip-blue">已解析 {parsedEnrollmentIds.length} 条注册记录</span>
            <button
              type="button"
              onClick={() => setConfirmState({
                title: "批量退课",
                message: `确认批量退课 ${parsedEnrollmentIds.length} 条注册记录？此操作不可撤销。`,
                onConfirm: () => { setConfirmState(null); void runBulkDrop(); },
              })}
              disabled={loading || parsedEnrollmentIds.length === 0}
              className="rounded-lg bg-[hsl(221_83%_43%)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(221_83%_38%)] disabled:opacity-50"
            >
              {loading ? "执行中…" : "执行"}
            </button>
          </div>
        </div>
      ) : null}

      {tab === "status" ? (
        <div className="grid gap-6 xl:grid-cols-[1.25fr,0.95fr]">
          <div className="campus-card space-y-4 p-5">
            <div className="grid gap-4 md:grid-cols-[1fr,220px]">
              <textarea
                className="min-h-[220px] rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700 outline-none focus:border-[hsl(221_83%_55%)] focus:ring-4 focus:ring-[hsl(221_83%_55%_/_0.15)]"
                placeholder="每行一个 studentId，或用逗号分隔"
                value={statusStudentIdsText}
                onChange={(e) => setStatusStudentIdsText(e.target.value)}
              />
              <select className="campus-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ACTIVE">在读</option>
                <option value="INACTIVE">非在读</option>
                <option value="SUSPENDED">停学</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="campus-chip chip-blue">已解析 {parsedStatusStudentIds.length} 名学生</span>
              <button
                type="button"
                onClick={() => setConfirmState({
                  title: "批量改状态",
                  message: `确认将 ${parsedStatusStudentIds.length} 名学生的学籍状态批量更改？此操作不可撤销。`,
                  onConfirm: () => { setConfirmState(null); void runBulkStatus(); },
                })}
                disabled={loading || parsedStatusStudentIds.length === 0}
                className="rounded-lg bg-[hsl(221_83%_43%)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[hsl(221_83%_38%)] disabled:opacity-50"
              >
                {loading ? "执行中…" : "执行"}
              </button>
            </div>
          </div>

          <div className="campus-card space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">按真实学生批量选中</h2>
                <p className="text-xs text-slate-500">用于批量更改学籍状态，避免手工复制 studentId。</p>
              </div>
              <button
                type="button"
                onClick={() => fillSelectedStudents("status")}
                disabled={selectedStudentIds.length === 0}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                将选中学生填入名单
              </button>
            </div>
            <input
              className="campus-input"
              placeholder="按姓名 / 邮箱 / 学号筛选"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="max-h-[360px] overflow-y-auto">
                {loadingStudents ? (
                  <div className="px-4 py-10 text-center text-sm text-slate-500">加载学生中…</div>
                ) : visibleStudents.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-slate-500">没有匹配的学生。</div>
                ) : (
                  <table className="campus-table">
                    <thead>
                      <tr>
                        <th className="w-12">选择</th>
                        <th>学生</th>
                        <th>学号</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleStudents.map((student) => {
                        const checked = selectedStudentIds.includes(student.id);
                        return (
                          <tr key={student.id}>
                            <td>
                              <input type="checkbox" checked={checked} onChange={() => toggleStudent(student.id)} />
                            </td>
                            <td>
                              <div className="space-y-0.5">
                                <div className="font-medium text-slate-900">{student.studentProfile?.legalName || student.email}</div>
                                <div className="text-xs text-slate-500">{student.email}</div>
                              </div>
                            </td>
                            <td>{student.studentId || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
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
                <thead><tr><th>学号</th><th>原因</th></tr></thead>
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
                <thead><tr><th>注册记录 ID</th><th>原因</th></tr></thead>
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
