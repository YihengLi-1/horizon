"use client";

/**
 * Admin Prerequisite Integrity Audit
 * Scans all ENROLLED/COMPLETED enrollments and flags students who may have
 * enrolled without satisfying prerequisite requirements.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Violation = {
  courseCode: string;
  courseTitle: string;
  studentId: string;
  studentEmail: string;
  studentName: string | null;
  termName: string;
  enrollmentStatus: string;
  missingPrereqs: string[];
};

const STATUS_CHIP: Record<string, string> = {
  ENROLLED:  "border-indigo-200 bg-indigo-50 text-indigo-700",
  COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-700"
};

export default function PrereqAuditPage() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");

  useEffect(() => {
    void apiFetch<Violation[]>("/admin/prereq-audit")
      .then((data) => setViolations(data ?? []))
      .catch(() => setViolations([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = violations.filter((v) => {
    const q = search.toLowerCase();
    return (
      v.courseCode.toLowerCase().includes(q) ||
      v.courseTitle.toLowerCase().includes(q) ||
      v.studentEmail.toLowerCase().includes(q) ||
      (v.studentName ?? "").toLowerCase().includes(q) ||
      v.termName.toLowerCase().includes(q)
    );
  });

  // Group by course
  const byCourse = filtered.reduce<Record<string, Violation[]>>((acc, v) => {
    const key = `${v.courseCode} ${v.courseTitle}`;
    (acc[key] ??= []).push(v);
    return acc;
  }, {});

  const courseKeys = Object.keys(byCourse).sort();

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Data Quality</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">
          先修课违规审计
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          扫描所有注册记录，标记可能未满足先修课要求的学生
        </p>
      </section>

      {/* KPIs */}
      {!loading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="campus-kpi">
            <p className="campus-kpi-label">违规记录总数</p>
            <p className={`campus-kpi-value ${violations.length > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {violations.length}
            </p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">涉及课程数</p>
            <p className="campus-kpi-value text-amber-600">
              {new Set(violations.map((v) => v.courseCode)).size}
            </p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">涉及学生数</p>
            <p className="campus-kpi-value text-indigo-600">
              {new Set(violations.map((v) => v.studentId)).size}
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="campus-toolbar">
        <input
          className="campus-input flex-1"
          placeholder="搜索课程代码、学生姓名或邮箱…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-xs text-slate-500 self-center">{filtered.length} 条</span>
      </div>

      {loading ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-2xl">⏳</p>
          <p className="mt-2 text-sm text-slate-600">正在扫描注册数据，可能需要数秒…</p>
        </div>
      ) : violations.length === 0 ? (
        <div className="campus-card px-6 py-16 text-center">
          <p className="text-4xl">✅</p>
          <p className="mt-3 text-lg font-semibold text-emerald-700">未发现先修课违规！</p>
          <p className="mt-1 text-sm text-slate-500">所有注册记录的先修课要求均已满足</p>
        </div>
      ) : courseKeys.length === 0 ? (
        <div className="campus-card px-6 py-10 text-center">
          <p className="text-sm text-slate-500">无符合搜索条件的结果</p>
        </div>
      ) : (
        <div className="space-y-5">
          {courseKeys.map((key) => {
            const rows = byCourse[key];
            const [code] = key.split(" ");
            return (
              <section key={key} className="campus-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-red-50 border-b border-red-100">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-indigo-700">{code}</span>
                    <span className="text-sm text-slate-700">{key.slice(code.length + 1)}</span>
                  </div>
                  <span className="campus-chip border-red-200 bg-red-100 text-red-700 text-xs">
                    {rows.length} 个违规
                  </span>
                </div>
                <div className="divide-y divide-slate-50">
                  {rows.map((v, idx) => (
                    <div key={idx} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800 truncate">
                            {v.studentName ?? v.studentEmail}
                          </span>
                          {v.studentName && (
                            <span className="text-xs text-slate-400 truncate">{v.studentEmail}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          学期：{v.termName} · 缺少先修课：
                          {v.missingPrereqs.map((p) => (
                            <span
                              key={p}
                              className="ml-1 font-mono font-bold text-red-600"
                            >
                              {p}
                            </span>
                          ))}
                        </p>
                      </div>
                      <span className={`campus-chip text-xs ${STATUS_CHIP[v.enrollmentStatus] ?? "border-slate-200 bg-slate-50 text-slate-500"}`}>
                        {v.enrollmentStatus}
                      </span>
                      <Link
                        href="/admin/students"
                        className="text-xs text-indigo-600 hover:underline shrink-0"
                      >
                        查看学生 →
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-400 text-center">
        注：此工具仅检查静态先修课链接，不含例外批准或等效替代情况。
      </p>
    </div>
  );
}
