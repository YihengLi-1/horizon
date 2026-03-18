"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };

type AtRiskStudent = {
  student: {
    id: string;
    email: string;
    legalName: string;
    studentId: string | null;
  };
  termGpa: number | null;
  droppedCount: number;
  enrolledCount: number;
  riskFlags: string[];
};

const FLAG_LABEL: Record<string, string> = {
  "GPA < 2.0": "GPA < 2.0",
  "No active enrollment": "无在修课程",
};

function flagLabel(flag: string) {
  if (FLAG_LABEL[flag]) return FLAG_LABEL[flag];
  // Dropped X courses
  const m = flag.match(/Dropped (\d+) courses?/);
  if (m) return `已退 ${m[1]} 门课`;
  return flag;
}

function gpaTone(gpa: number | null) {
  if (gpa === null) return "text-slate-400";
  if (gpa < 1.5) return "text-red-700 font-bold";
  if (gpa < 2.0) return "text-amber-700 font-semibold";
  return "text-slate-700";
}

export default function AtRiskPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [rows, setRows] = useState<AtRiskStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms")
      .then((d) => setTerms(d ?? []))
      .catch(() => {});
  }, []);

  const load = useCallback(async (tid: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (tid) params.set("termId", tid);
      const d = await apiFetch<AtRiskStudent[]>(`/admin/students/at-risk${params.size ? `?${params}` : ""}`);
      setRows(d ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "预警数据加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(termId);
  }, [load, termId]);

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.student.email.toLowerCase().includes(q) ||
      r.student.legalName.toLowerCase().includes(q) ||
      (r.student.studentId ?? "").toLowerCase().includes(q)
    );
  });

  const exportCsv = () => {
    const header = ["学号", "姓名", "邮箱", "学期GPA", "已退课数", "在修课数", "预警原因"];
    const csvRows = [
      header.join(","),
      ...filtered.map((r) =>
        [
          r.student.studentId ?? "",
          `"${r.student.legalName}"`,
          r.student.email,
          r.termGpa !== null ? r.termGpa.toFixed(2) : "",
          r.droppedCount,
          r.enrolledCount,
          `"${r.riskFlags.map(flagLabel).join("; ")}"`,
        ].join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "at-risk-students.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">学生支持</p>
        <h1 className="font-heading text-3xl font-bold text-slate-900">学生预警</h1>
        <p className="mt-2 text-sm text-slate-600">
          本学期 GPA 低于 2.0、大量退课或无在修课程的高风险学生。
        </p>
      </section>

      <section className="campus-toolbar flex-wrap gap-3">
        <select
          className="campus-select w-48"
          value={termId}
          onChange={(e) => setTermId(e.target.value)}
        >
          <option value="">最近学期</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          className="campus-input max-w-xs"
          placeholder="搜索姓名、学号或邮箱…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={exportCsv}
          disabled={!filtered.length}
          className="campus-btn-ghost shrink-0 disabled:opacity-40"
        >
          导出 CSV
        </button>
      </section>

      {!loading && !error ? (
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="campus-kpi">
            <p className="campus-kpi-label">预警学生数</p>
            <p className="mt-1 text-2xl font-semibold text-red-700">{filtered.length}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">GPA &lt; 2.0</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {filtered.filter((r) => r.riskFlags.some((f) => f === "GPA < 2.0")).length}
            </p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">无在修课程</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {filtered.filter((r) => r.riskFlags.some((f) => f === "No active enrollment")).length}
            </p>
          </div>
        </section>
      ) : null}

      {error ? (
        <section className="campus-card p-6 text-sm text-red-600">预警数据暂时不可用：{error}</section>
      ) : null}

      {loading ? (
        <section className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="campus-card p-4 animate-pulse">
              <div className="h-4 w-1/3 rounded bg-slate-200" />
              <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
            </div>
          ))}
        </section>
      ) : null}

      {!loading && !error && filtered.length === 0 ? (
        <section className="campus-card p-8 text-center text-sm text-slate-500">
          {search ? "没有符合搜索条件的预警学生。" : "本学期暂无预警学生。"}
        </section>
      ) : null}

      {!loading && !error && filtered.length > 0 ? (
        <section className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">学生</th>
                <th className="px-4 py-3 font-semibold text-slate-700">学期 GPA</th>
                <th className="px-4 py-3 font-semibold text-slate-700">退课 / 在修</th>
                <th className="px-4 py-3 font-semibold text-slate-700">预警原因</th>
                <th className="px-4 py-3 font-semibold text-slate-700">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.student.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{r.student.legalName}</p>
                    <p className="text-xs text-slate-500">{r.student.studentId ?? "无学号"} · {r.student.email}</p>
                  </td>
                  <td className={`px-4 py-3 font-mono ${gpaTone(r.termGpa)}`}>
                    {r.termGpa !== null ? r.termGpa.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.droppedCount} / {r.enrolledCount}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.riskFlags.map((f) => (
                        <span
                          key={f}
                          className="campus-chip text-[11px] border-red-200 bg-red-50 text-red-700"
                        >
                          {flagLabel(f)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/students/${r.student.id}`}
                      className="campus-chip cursor-pointer text-xs"
                    >
                      查看档案
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
