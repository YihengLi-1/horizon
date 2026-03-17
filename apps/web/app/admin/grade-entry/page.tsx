"use client";

import { useEffect, useMemo, useState } from "react";
import { GRADE_POINTS } from "@sis/shared/constants";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast-provider";

type SectionOption = {
  id: string;
  sectionCode: string;
  course: { code: string; title: string };
  term: { id: string; name: string; registrationOpen: boolean; endDate?: string | null };
};

type SectionEnrollment = {
  id: string;
  status: string;
  finalGrade: string | null;
  student: {
    email: string;
    studentProfile?: { legalName?: string | null } | null;
  };
};

type SaveResult = {
  updated: number;
  failed: Array<{ enrollmentId: string; reason: string }>;
};

const GRADE_OPTIONS = ["A", "A-", "B+", "B", "B-", "C+", "C", "D", "F", "W", "I"];

function displayName(row: SectionEnrollment) {
  return row.student.studentProfile?.legalName || row.student.email;
}

export default function AdminGradeEntryPage() {
  const toast = useToast();
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [rows, setRows] = useState<SectionEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<SectionOption[]>("/admin/sections")
      .then((data) => {
        const current = (data ?? []).filter((section) => section.term.registrationOpen);
        const next = current.length > 0 ? current : data ?? [];
        setSections(next);
        if (next[0]) setSectionId(next[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "无法加载教学班列表"));
  }, []);

  useEffect(() => {
    if (!sectionId) return;
    setLoading(true);
    setError("");
    void apiFetch<SectionEnrollment[]>(`/admin/sections/${sectionId}/enrollments`)
      .then((data) => setRows((data ?? []).filter((row) => row.status === "ENROLLED")))
      .catch((err) => {
        setRows([]);
        setError(err instanceof Error ? err.message : "无法加载选课名单");
      })
      .finally(() => setLoading(false));
  }, [sectionId]);

  const selectedSection = useMemo(() => sections.find((section) => section.id === sectionId) ?? null, [sectionId, sections]);
  const gradesLockedAt = useMemo(() => {
    if (!selectedSection?.term?.endDate) return null;
    const endDate = new Date(selectedSection.term.endDate);
    return new Date(endDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  }, [selectedSection]);
  const isLocked = Boolean(gradesLockedAt && Date.now() > gradesLockedAt.getTime());

  const gradedCount = useMemo(() => rows.filter((row) => row.finalGrade).length, [rows]);

  async function saveAll() {
    const grades = rows
      .filter((row) => row.finalGrade)
      .map((row) => ({
        enrollmentId: row.id,
        grade: row.finalGrade as string,
        gradePoints: GRADE_POINTS[row.finalGrade as string] ?? 0
      }));

    if (!sectionId || grades.length === 0) {
      toast.warning("先选择教学班并至少填写一条成绩");
      return;
    }

    if (isLocked) {
      toast.warning("该学期成绩已锁定。如需修改，请联系系统管理员。");
      return;
    }

    try {
      setSaving(true);
      const result = await apiFetch<SaveResult>(`/sections/${sectionId}/grades/submit`, {
        method: "POST",
        body: JSON.stringify({ grades })
      });
      toast.success(`已保存 ${result.updated} 条成绩`);
      if (result.failed.length > 0) {
        toast.warning(`${result.failed.length} 条成绩保存失败`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "成绩保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Operations</p>
        <h1 className="campus-title">成绩批量录入</h1>
        <p className="campus-subtitle">按教学班批量录入或修改学生成绩，适合学期末集中处理。</p>
      </section>

      <div className="campus-toolbar">
        <label className="block min-w-[320px] flex-1">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">选择教学班</span>
          <select className="campus-select" value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.term.name} · {section.course.code} {section.course.title} · {section.sectionCode}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void saveAll()}
          disabled={saving || loading || rows.length === 0 || isLocked}
          className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "保存中…" : "保存全部"}
        </button>
      </div>

      {selectedSection ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="campus-kpi">
            <p className="campus-kpi-label">课程</p>
            <p className="campus-kpi-value">{selectedSection.course.code}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">教学班</p>
            <p className="campus-kpi-value">{selectedSection.sectionCode}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">已填写成绩</p>
            <p className="campus-kpi-value">{gradedCount}</p>
          </div>
        </div>
      ) : null}

      {error ? <div className="campus-card border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {selectedSection && isLocked ? (
        <div className="campus-card border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          该学期（{selectedSection.term.name}）的成绩已锁定。如需修改，请联系系统管理员。
        </div>
      ) : null}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">加载名单中…</div>
      ) : rows.length === 0 ? (
        <div className="campus-empty campus-card">
          <div className="campus-empty-title">当前教学班暂无在读学生</div>
          <div className="campus-empty-desc">换一个教学班，或先确认该班已有 ENROLLED 学生。</div>
        </div>
      ) : (
        <div className="campus-card overflow-x-auto">
          <table className="campus-table min-w-[760px]">
            <thead>
              <tr>
                <th>学生</th>
                <th>邮箱</th>
                <th>当前成绩</th>
                <th>绩点</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{displayName(row)}</td>
                  <td className="text-slate-500">{row.student.email}</td>
                  <td>
                    <select
                      className="campus-select min-w-[120px]"
                      value={row.finalGrade ?? ""}
                      disabled={isLocked}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item) =>
                            item.id === row.id ? { ...item, finalGrade: event.target.value || null } : item
                          )
                        )
                      }
                    >
                      <option value="">未填写</option>
                      {GRADE_OPTIONS.map((grade) => (
                        <option key={grade} value={grade}>
                          {grade}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{row.finalGrade ? (GRADE_POINTS[row.finalGrade] ?? 0).toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
