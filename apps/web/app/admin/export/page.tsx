"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

type ExportDef = {
  id: string;
  label: string;
  desc: string;
  endpoint: string;
  filename: string;
  transform?: (data: Record<string, unknown>[]) => Record<string, unknown>[];
};

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(",")
    )
  ];
  return lines.join("\n");
}

function download(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const EXPORTS: ExportDef[] = [
  {
    id: "students",
    label: "All Students",
    desc: "Student roster with email, ID, name, and GPA",
    endpoint: "/admin/students?pageSize=9999",
    filename: `students-${new Date().toISOString().slice(0, 10)}.csv`,
    transform: (data) => {
      const paginated = (data as unknown as { data: Record<string, unknown>[] }).data ?? data;
      return paginated.map((s: Record<string, unknown>) => ({
        email: s.email,
        studentId: (s.studentProfile as Record<string, unknown>)?.studentId ?? "",
        name: (s.studentProfile as Record<string, unknown>)?.legalName ?? "",
        role: s.role,
        gpa: ""
      }));
    }
  },
  {
    id: "courses",
    label: "All Courses",
    desc: "Courses with code, title, credits, weeklyHours, and prerequisites",
    endpoint: "/admin/courses",
    filename: `courses-${new Date().toISOString().slice(0, 10)}.csv`,
    transform: (data) =>
      (data as Record<string, unknown>[]).map((c) => ({
        code: c.code,
        title: c.title,
        credits: c.credits,
        weeklyHours: c.weeklyHours ?? "",
        description: c.description ?? "",
        prerequisites: ((c.prerequisiteLinks as Array<{ prerequisiteCourse?: { code?: string } }>) ?? [])
          .map((l) => l.prerequisiteCourse?.code)
          .filter(Boolean)
          .join("; ")
      }))
  },
  {
    id: "sections",
    label: "All Sections",
    desc: "Sections with course, instructor, capacity, enrolled count",
    endpoint: "/academics/sections",
    filename: `sections-${new Date().toISOString().slice(0, 10)}.csv`,
    transform: (data) =>
      (data as Record<string, unknown>[]).map((s) => {
        const course = s.course as Record<string, unknown>;
        const term = s.term as Record<string, unknown>;
        const enrs = s.enrollments as Array<{ status: string }> ?? [];
        return {
          term: term?.name ?? "",
          courseCode: course?.code ?? "",
          sectionCode: s.sectionCode,
          instructor: s.instructorName,
          location: s.location ?? "",
          modality: s.modality,
          capacity: s.capacity,
          enrolled: enrs.filter((e) => e.status === "ENROLLED").length,
          waitlisted: enrs.filter((e) => e.status === "WAITLISTED").length,
          credits: s.credits
        };
      })
  },
  {
    id: "enrollments",
    label: "All Enrollments",
    desc: "Enrollment records with student, course, status, and grade",
    endpoint: "/admin/enrollments?pageSize=9999",
    filename: `enrollments-${new Date().toISOString().slice(0, 10)}.csv`,
    transform: (data) => {
      const paginated = (data as unknown as { data: Record<string, unknown>[] }).data ?? data;
      return paginated.map((e: Record<string, unknown>) => {
        const student = e.student as Record<string, unknown> ?? {};
        const section = e.section as Record<string, unknown> ?? {};
        const course = section.course as Record<string, unknown> ?? {};
        const term = e.term as Record<string, unknown> ?? {};
        return {
          term: term.name ?? "",
          courseCode: course.code ?? "",
          studentEmail: student.email ?? "",
          studentId: (student.studentProfile as Record<string, unknown>)?.studentId ?? "",
          status: e.status,
          finalGrade: e.finalGrade ?? ""
        };
      });
    }
  },
  {
    id: "instructors",
    label: "Instructor Analytics",
    desc: "Instructor teaching load and rating statistics",
    endpoint: "/admin/instructors/analytics",
    filename: `instructors-${new Date().toISOString().slice(0, 10)}.csv`,
    transform: (data) =>
      (data as Record<string, unknown>[]).map((r) => ({
        name: r.name,
        sectionCount: r.sectionCount,
        totalEnrolled: r.totalEnrolled,
        depts: (r.depts as string[]).join("; "),
        ratingCount: r.ratingCount,
        avgRating: r.avgRating != null ? (r.avgRating as number).toFixed(2) : "",
        avgDifficulty: r.avgDifficulty != null ? (r.avgDifficulty as number).toFixed(2) : "",
        recommendPct: r.recommendPct != null ? `${r.recommendPct}%` : ""
      }))
  }
];

type ExportState = "idle" | "loading" | "done" | "error";

export default function AdminExportPage() {
  const [states, setStates] = useState<Record<string, ExportState>>({});

  async function doExport(def: ExportDef) {
    setStates((prev) => ({ ...prev, [def.id]: "loading" }));
    try {
      const raw = await apiFetch<Record<string, unknown>[]>(def.endpoint);
      const rows = def.transform ? def.transform(raw ?? []) : (raw ?? []) as Record<string, unknown>[];
      const csv = toCsv(rows);
      download(csv, def.filename);
      setStates((prev) => ({ ...prev, [def.id]: "done" }));
      setTimeout(() => setStates((prev) => ({ ...prev, [def.id]: "idle" })), 3000);
    } catch {
      setStates((prev) => ({ ...prev, [def.id]: "error" }));
    }
  }

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <p className="campus-eyebrow">Data Management</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900">Export Center</h1>
        <p className="mt-1 text-sm text-slate-600">
          One-click CSV downloads for all major system datasets.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {EXPORTS.map((def) => {
          const st = states[def.id] ?? "idle";
          return (
            <div key={def.id} className="campus-card p-5 flex flex-col gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">{def.label}</p>
                <p className="mt-1 text-xs text-slate-500">{def.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => doExport(def)}
                disabled={st === "loading"}
                className={`mt-auto inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  st === "loading"
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : st === "done"
                    ? "bg-emerald-600 text-white"
                    : st === "error"
                    ? "border border-red-300 bg-red-50 text-red-700"
                    : "bg-slate-900 text-white hover:bg-slate-700"
                }`}
              >
                {st === "loading" ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-slate-600" />
                    Exporting…
                  </>
                ) : st === "done" ? (
                  <>✓ Downloaded</>
                ) : st === "error" ? (
                  <>⚠ Error — Retry</>
                ) : (
                  <>⬇ Export CSV</>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="campus-card p-4 text-xs text-slate-500 space-y-1">
        <p className="font-semibold text-slate-700">Note</p>
        <p>All exports reflect current live data. For large datasets, export may take a few seconds.</p>
        <p>CSV files are suitable for Excel, Google Sheets, or any data analysis tool.</p>
      </div>
    </div>
  );
}
