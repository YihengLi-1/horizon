"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type AdviseeAssignment = {
  id: string;
  assignedAt: string;
  student: {
    id: string;
    email: string;
    studentId?: string | null;
    studentProfile?: {
      legalName?: string;
      programMajor?: string | null;
      academicStatus?: string | null;
      enrollmentStatus?: string | null;
    } | null;
  };
};

const STATUS_STYLE: Record<string, string> = {
  GOOD_STANDING: "text-emerald-700 bg-emerald-50 border-emerald-200",
  PROBATION: "text-red-700 bg-red-50 border-red-200",
  SUSPENDED: "text-red-800 bg-red-100 border-red-300",
  AT_RISK: "text-amber-700 bg-amber-50 border-amber-200",
};
const STATUS_LABEL: Record<string, string> = {
  GOOD_STANDING: "成绩良好",
  PROBATION: "学业观察",
  SUSPENDED: "学业暂停",
  AT_RISK: "存在风险",
};

export default function AdviseeListPage() {
  const [assignments, setAssignments] = useState<AdviseeAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    void apiFetch<AdviseeAssignment[]>("/advising/advisees")
      .then((d) => setAssignments(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assignments.filter((a) => {
      const name = (a.student.studentProfile?.legalName ?? a.student.email).toLowerCase();
      const major = (a.student.studentProfile?.programMajor ?? "").toLowerCase();
      const matchQ = !q || name.includes(q) || a.student.email.toLowerCase().includes(q) || major.includes(q);
      const matchStatus = !statusFilter || a.student.studentProfile?.academicStatus === statusFilter;
      return matchQ && matchStatus;
    });
  }, [assignments, search, statusFilter]);

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">顾问工作台</p>
        <h1 className="campus-hero-title">辅导学生名单</h1>
        <p className="campus-hero-subtitle">搜索和筛选您负责辅导的所有学生</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">辅导学生总数</p>
          <p className="campus-kpi-value">{loading ? "—" : assignments.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">学业风险</p>
          <p className="campus-kpi-value text-amber-600">
            {loading ? "—" : assignments.filter((a) => a.student.studentProfile?.academicStatus === "AT_RISK").length}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">学业观察</p>
          <p className="campus-kpi-value text-red-600">
            {loading ? "—" : assignments.filter((a) => a.student.studentProfile?.academicStatus === "PROBATION").length}
          </p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="campus-toolbar">
        <input
          className="campus-input max-w-xs"
          placeholder="搜索姓名、邮箱或专业…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="campus-select w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">全部状态</option>
          <option value="GOOD_STANDING">成绩良好</option>
          <option value="AT_RISK">存在风险</option>
          <option value="PROBATION">学业观察</option>
          <option value="SUSPENDED">学业暂停</option>
        </select>
      </div>

      <section className="campus-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 text-left">学生</th>
              <th className="px-4 py-3 text-left">专业</th>
              <th className="px-4 py-3 text-left">学业状态</th>
              <th className="px-4 py-3 text-left">分配日期</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">加载中…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                {assignments.length === 0 ? "暂无辅导学生" : "无匹配结果"}
              </td></tr>
            ) : filtered.map((a) => {
              const profile = a.student.studentProfile;
              const academicStatus = profile?.academicStatus ?? "";
              return (
                <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">
                      {profile?.legalName ?? a.student.email}
                    </p>
                    <p className="text-xs text-slate-500">{a.student.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {profile?.programMajor ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {academicStatus ? (
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[academicStatus] ?? "border-slate-200 bg-slate-50 text-slate-500"}`}>
                        {STATUS_LABEL[academicStatus] ?? academicStatus}
                      </span>
                    ) : <span className="text-slate-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{a.assignedAt?.slice(0, 10)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/advisor/students/${a.student.id}`}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      查看详情
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
