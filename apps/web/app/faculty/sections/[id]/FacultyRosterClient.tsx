"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

type EnrollmentRow = {
  id: string;
  status: string;
  finalGrade?: string | null;
  student: {
    email: string;
    studentId?: string | null;
    studentProfile?: {
      legalName?: string;
      programMajor?: string | null;
      academicStatus?: string | null;
    } | null;
  };
};

type SectionData = {
  id: string;
  sectionCode: string;
  instructorName: string;
  course: { code: string; title: string };
  term: { name: string };
};

type RosterPayload = {
  section: SectionData;
  enrollments: EnrollmentRow[];
};

const GRADES = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F", "W"];

export default function FacultyRosterClient({ sectionId }: { sectionId: string }) {
  const [section, setSection] = useState<SectionData | null>(null);
  const [items, setItems] = useState<EnrollmentRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    void apiFetch<RosterPayload>(`/faculty/sections/${sectionId}/roster`)
      .then((payload) => {
        if (!alive) return;
        setSection(payload.section);
        setItems(payload.enrollments);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load section roster");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sectionId]);

  const gradeableRows = useMemo(
    () => items.filter((row) => row.status === "ENROLLED" || row.status === "COMPLETED"),
    [items]
  );

  const saveGrade = async (enrollmentId: string, finalGrade: string) => {
    setError("");
    setNotice("");
    setSavingId(enrollmentId);
    try {
      await apiFetch(`/faculty/sections/${sectionId}/grades/${enrollmentId}`, {
        method: "PATCH",
        body: JSON.stringify({ finalGrade })
      });
      setItems((prev) =>
        prev.map((row) => (row.id === enrollmentId ? { ...row, finalGrade, status: "COMPLETED" } : row))
      );
      setNotice(`Grade saved: ${finalGrade}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to save grade");
      }
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Faculty</p>
        <h1 className="font-heading text-3xl font-bold text-slate-900">
          {section ? `${section.course.code} §${section.sectionCode}` : "Section Roster"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {section
            ? `${section.course.title} · ${section.term.name} · Instructor ${section.instructorName}`
            : "Loading your owned section roster."}
        </p>
      </section>

      <section className="campus-card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Roster & Final Grades</h2>
          <p className="mt-1 text-xs text-slate-500">
            Only records for your owned section are listed here. Grade updates are audit-logged.
          </p>
        </div>

        {loading ? <div className="px-4 py-10 text-center text-sm text-slate-400">Loading roster…</div> : null}
        {!loading && error ? <div className="px-4 py-10 text-center text-sm text-red-600">{error}</div> : null}
        {!loading && !error ? (
          <>
            {notice ? <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Student</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Email</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Final Grade</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-400">No roster records found.</td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{row.student.studentProfile?.legalName ?? "—"}</p>
                        <p className="text-xs text-slate-500">{row.student.studentId ?? "No student ID"}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.student.email}</td>
                      <td className="px-4 py-3">
                        <span className="campus-chip text-xs">{row.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        {row.status === "ENROLLED" || row.status === "COMPLETED" ? (
                          <div className="flex items-center gap-2">
                            <select
                              className="campus-select min-w-[100px]"
                              defaultValue={row.finalGrade ?? ""}
                              disabled={savingId === row.id}
                              onChange={(event) => {
                                if (event.currentTarget.value) {
                                  void saveGrade(row.id, event.currentTarget.value);
                                }
                              }}
                            >
                              <option value="">Select</option>
                              {GRADES.map((grade) => (
                                <option key={grade} value={grade}>
                                  {grade}
                                </option>
                              ))}
                            </select>
                            {savingId === row.id ? <span className="text-xs text-slate-400">Saving…</span> : null}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {gradeableRows.length === 0 ? (
              <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                No gradeable enrollments are currently in this section.
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
