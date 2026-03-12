"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Link from "next/link";

type AtRiskStudent = {
  student: { id: string; email: string; legalName: string; studentId: string | null };
  termGpa: number | null;
  droppedCount: number;
  enrolledCount: number;
  riskFlags: string[];
};

export default function AtRiskPage() {
  const [students, setStudents] = useState<AtRiskStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<AtRiskStudent[]>("/admin/students/at-risk")
      .then((data) => setStudents(data ?? []))
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, []);

  const flagColor = (flag: string) => {
    if (flag.startsWith("GPA")) return "campus-chip bg-red-100 text-red-700 border-red-200";
    if (flag.startsWith("Dropped")) return "campus-chip bg-amber-100 text-amber-700 border-amber-200";
    return "campus-chip bg-slate-100 text-slate-600 border-slate-200";
  };

  return (
    <div className="campus-page">
      <div className="campus-hero">
        <div>
          <p className="campus-eyebrow">Admin · Students</p>
          <h1 className="campus-hero-title">At-Risk Students</h1>
          <p className="campus-hero-sub">Students with GPA &lt; 2.0, multiple drops, or no active enrollment this term.</p>
        </div>
      </div>

      {loading ? (
        <div className="campus-card p-8 text-center text-slate-400">Loading…</div>
      ) : students.length === 0 ? (
        <div className="campus-card p-8 text-center">
          <p className="text-2xl mb-2">✅</p>
          <p className="text-slate-500 font-medium">No at-risk students identified this term.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="campus-kpi">
              <p className="campus-kpi-label">At-Risk Students</p>
              <p className="campus-kpi-value text-red-600">{students.length}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">GPA &lt; 2.0</p>
              <p className="campus-kpi-value text-red-600">
                {students.filter((s) => s.riskFlags.some((f) => f.startsWith("GPA"))).length}
              </p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">Multiple Drops</p>
              <p className="campus-kpi-value text-amber-600">
                {students.filter((s) => s.riskFlags.some((f) => f.startsWith("Dropped"))).length}
              </p>
            </div>
          </div>

          <div className="campus-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-4 py-3 text-slate-500 font-medium">Student</th>
                  <th className="px-4 py-3 text-slate-500 font-medium">ID</th>
                  <th className="px-4 py-3 text-slate-500 font-medium">Term GPA</th>
                  <th className="px-4 py-3 text-slate-500 font-medium">Enrolled</th>
                  <th className="px-4 py-3 text-slate-500 font-medium">Risk Flags</th>
                </tr>
              </thead>
              <tbody>
                {students.map((row) => (
                  <tr key={row.student.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/students?search=${encodeURIComponent(row.student.email)}`}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {row.student.legalName}
                      </Link>
                      <p className="text-xs text-slate-400 mt-0.5">{row.student.email}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{row.student.studentId ?? "—"}</td>
                    <td className="px-4 py-3">
                      {row.termGpa !== null ? (
                        <span
                          className={`font-bold tabular-nums ${row.termGpa < 2.0 ? "text-red-600" : row.termGpa < 3.0 ? "text-amber-600" : "text-emerald-600"}`}
                        >
                          {row.termGpa.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.enrolledCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.riskFlags.map((f) => (
                          <span key={f} className={flagColor(f)}>
                            {f}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
