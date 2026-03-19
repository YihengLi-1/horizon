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
        setError(err instanceof Error ? err.message : "名单加载失败");
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
      setNotice(`成绩已保存：${finalGrade}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "成绩保存失败");
      }
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">教师</p>
        <h1 className="font-heading text-3xl font-bold text-slate-900">
          {section ? `${section.course.code} §${section.sectionCode}` : "教学班名单"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {section
            ? `${section.course.title} · ${section.term.name} · 教师：${section.instructorName}`
            : "加载教学班名单中。"}
        </p>
      </section>

      <section className="campus-card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">名单与期末成绩</h2>
          <p className="mt-1 text-xs text-slate-500">
            仅显示您所负责教学班的学生记录。成绩更新操作将被审计记录。
          </p>
        </div>

        {loading ? <div className="px-4 py-10 text-center text-sm text-slate-400">加载名单中…</div> : null}
        {!loading && error ? <div className="px-4 py-10 text-center text-sm text-red-600">{error}</div> : null}
        {!loading && !error ? (
          <>
            {notice ? <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500">学生</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500">邮箱</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500">状态</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-slate-500">期末成绩</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-slate-400">暂无名单记录。</td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{row.student.studentProfile?.legalName ?? "—"}</p>
                        <p className="text-xs text-slate-500">{row.student.studentId ?? "无学号"}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.student.email}</td>
                      <td className="px-4 py-3">
                        <span className="campus-chip text-xs">{({"ENROLLED":"在读","COMPLETED":"已完成","DROPPED":"已退课","WAITLISTED":"候补","PENDING_APPROVAL":"待审批"} as Record<string,string>)[row.status] ?? row.status}</span>
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
                              <option value="">选择成绩</option>
                              {GRADES.map((grade) => (
                                <option key={grade} value={grade}>
                                  {grade}
                                </option>
                              ))}
                            </select>
                            {savingId === row.id ? <span className="text-xs text-slate-400">保存中…</span> : null}
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
                该教学班当前暂无可录入成绩的学生。
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
