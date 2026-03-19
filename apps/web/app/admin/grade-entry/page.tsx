"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    studentId?: string | null;
    studentProfile?: { legalName?: string | null } | null;
  };
};

type SaveResult = {
  updated: number;
  failed: Array<{ enrollmentId: string; reason: string }>;
};

type CsvImportRow = { key: string; grade: string; matched: boolean };

const GRADE_OPTIONS = ["A", "A-", "B+", "B", "B-", "C+", "C", "D", "F", "W", "I"];
const VALID_GRADES = new Set(GRADE_OPTIONS);

function displayName(row: SectionEnrollment) {
  return row.student.studentProfile?.legalName || row.student.email;
}

function parseCsv(text: string): Array<{ key: string; grade: string }> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .slice(0) // may skip header below
    .reduce<Array<{ key: string; grade: string }>>((acc, line, idx) => {
      const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
      if (parts.length < 2) return acc;
      const [keyRaw, gradeRaw] = parts;
      // skip header row
      if (idx === 0 && (keyRaw?.toLowerCase().includes("student") || keyRaw?.toLowerCase().includes("email") || keyRaw?.toLowerCase().includes("id"))) return acc;
      const grade = gradeRaw?.toUpperCase() ?? "";
      if (keyRaw && VALID_GRADES.has(grade)) acc.push({ key: keyRaw, grade });
      return acc;
    }, []);
}

export default function AdminGradeEntryPage() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [rows, setRows] = useState<SectionEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [csvPreview, setCsvPreview] = useState<CsvImportRow[]>([]);
  const [showCsvPanel, setShowCsvPanel] = useState(false);

  useEffect(() => {
    void apiFetch<SectionOption[]>("/admin/sections")
      .then((data) => {
        const allSections = data ?? [];
        const next = [...allSections].sort((a, b) => {
          if (a.term.registrationOpen && !b.term.registrationOpen) return -1;
          if (!a.term.registrationOpen && b.term.registrationOpen) return 1;
          if (a.term.name !== b.term.name) return b.term.name.localeCompare(a.term.name, "zh-Hans-CN");
          return `${a.course.code}-${a.sectionCode}`.localeCompare(`${b.course.code}-${b.sectionCode}`, "zh-Hans-CN");
        });
        setSections(next);
        if (next[0]) setSectionId(next[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "无法加载教学班列表"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!sectionId) return;
    setLoading(true);
    setError("");
    setCsvPreview([]);
    void apiFetch<SectionEnrollment[]>(`/admin/sections/${sectionId}/enrollments`)
      .then((data) =>
        setRows(
          (data ?? [])
            .filter((row) => row.status === "ENROLLED" || row.status === "COMPLETED")
            .sort((a, b) => {
              if (a.status === b.status) return displayName(a).localeCompare(displayName(b), "zh-Hans-CN");
              return a.status === "ENROLLED" ? -1 : 1;
            })
        )
      )
      .catch((err) => {
        setRows([]);
        setError(err instanceof Error ? err.message : "无法加载选课名单");
      })
      .finally(() => setLoading(false));
  }, [sectionId]);

  const selectedSection = useMemo(
    () => sections.find((s) => s.id === sectionId) ?? null,
    [sectionId, sections]
  );

  const gradesLockedAt = useMemo(() => {
    if (!selectedSection?.term?.endDate) return null;
    const endDate = new Date(selectedSection.term.endDate);
    return new Date(endDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  }, [selectedSection]);

  const isLocked = Boolean(gradesLockedAt && Date.now() > gradesLockedAt.getTime());
  const gradedCount = useMemo(() => rows.filter((row) => row.finalGrade).length, [rows]);

  // ── CSV import ────────────────────────────────────────────────────────────
  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCsv(text);
      // Match against current rows by email or studentId
      const preview: CsvImportRow[] = parsed.map(({ key, grade }) => {
        const matched = rows.some(
          (r) => r.student.email === key || r.student.studentId === key
        );
        return { key, grade, matched };
      });
      setCsvPreview(preview);
      setShowCsvPanel(true);
    };
    reader.readAsText(file);
  }

  function applyCsvImport() {
    const matched = csvPreview.filter((p) => p.matched);
    setRows((prev) =>
      prev.map((row) => {
        const hit = matched.find(
          (p) => p.key === row.student.email || p.key === row.student.studentId
        );
        return hit ? { ...row, finalGrade: hit.grade } : row;
      })
    );
    toast.success(`已导入 ${matched.length} 条成绩，点击"保存全部"提交`);
    setShowCsvPanel(false);
    setCsvPreview([]);
  }

  function exportTemplate() {
    const lines = [
      "# 成绩导入模板：学号或邮箱,成绩（A/B+/C 等）",
      "邮箱或学号,成绩",
      ...rows.map((r) => `${r.student.email},`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grades_template_${selectedSection?.course.code ?? "section"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function saveAll() {
    const grades = rows
      .filter((row) => row.finalGrade)
      .map((row) => ({
        enrollmentId: row.id,
        grade: row.finalGrade as string,
        gradePoints: GRADE_POINTS[row.finalGrade as string] ?? 0,
      }));

    if (!sectionId || grades.length === 0) {
      toast.warning("先选择教学班并至少填写一条成绩");
      return;
    }
    try {
      setSaving(true);
      const result = await apiFetch<SaveResult>(`/admin/sections/${sectionId}/grades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grades }),
      });
      toast.success(`已保存 ${result.updated} 条成绩`);
      if (result.failed.length > 0) toast.warning(`${result.failed.length} 条成绩保存失败`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "成绩保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">学术管理</p>
        <h1 className="campus-title">成绩批量录入</h1>
        <p className="campus-subtitle">按教学班录入成绩，支持手动填写或 CSV 批量导入。</p>
      </section>

      {/* Toolbar */}
      <div className="campus-toolbar flex-wrap gap-2">
        <label className="block min-w-[320px] flex-1">
          <span className="mb-2 block text-xs font-semibold text-slate-500">选择教学班</span>
          <select
            className="campus-select"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.term.name} · {s.course.code} {s.course.title} · {s.sectionCode}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end gap-2">
          {/* CSV import */}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleCsvFile(e.target.files[0]); }}
          />
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={exportTemplate}
            className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            下载模板
          </button>
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => fileRef.current?.click()}
            className="h-10 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            导入 CSV
          </button>
          <button
            type="button"
            onClick={() => void saveAll()}
            disabled={saving || loading || rows.length === 0 || isLocked}
            className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? "保存中…" : "保存全部"}
          </button>
        </div>
      </div>

      {/* KPIs */}
      {selectedSection ? (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="campus-kpi">
            <p className="campus-kpi-label">课程</p>
            <p className="campus-kpi-value">{selectedSection.course.code}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">教学班</p>
            <p className="campus-kpi-value">{selectedSection.sectionCode}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">学生人数</p>
            <p className="campus-kpi-value">{rows.length}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">已填成绩</p>
            <p className={`campus-kpi-value ${gradedCount === rows.length && rows.length > 0 ? "text-emerald-700" : ""}`}>
              {gradedCount} / {rows.length}
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="campus-card border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      {selectedSection && isLocked ? (
        <div className="campus-card border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          该学期（{selectedSection.term.name}）已超过常规录入窗口，管理员仍可修改，请谨慎操作。
        </div>
      ) : null}

      {/* CSV preview panel */}
      {showCsvPanel && csvPreview.length > 0 ? (
        <div className="campus-card space-y-3 border-blue-200 bg-blue-50/60 p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-blue-800">CSV 预览（共 {csvPreview.length} 行）</p>
            <button
              type="button"
              onClick={() => { setShowCsvPanel(false); setCsvPreview([]); }}
              className="text-xs text-blue-600 hover:underline"
            >
              取消
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto rounded border border-blue-200 bg-white text-xs">
            <table className="w-full">
              <thead className="bg-blue-50 text-blue-700">
                <tr>
                  <th className="px-3 py-2 text-left">学号/邮箱</th>
                  <th className="px-3 py-2 text-left">成绩</th>
                  <th className="px-3 py-2 text-left">匹配</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {csvPreview.map((r, i) => (
                  <tr key={i} className={r.matched ? "" : "opacity-40"}>
                    <td className="px-3 py-1.5 font-mono">{r.key}</td>
                    <td className="px-3 py-1.5 font-bold">{r.grade}</td>
                    <td className="px-3 py-1.5">
                      {r.matched ? (
                        <span className="text-emerald-600">✓ 已匹配</span>
                      ) : (
                        <span className="text-red-500">✗ 未找到</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-blue-700">
              {csvPreview.filter((r) => r.matched).length} 条将被导入，
              {csvPreview.filter((r) => !r.matched).length} 条无法匹配
            </p>
            <button
              type="button"
              onClick={applyCsvImport}
              disabled={csvPreview.every((r) => !r.matched)}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              应用导入
            </button>
          </div>
        </div>
      ) : null}

      {/* Grade table */}
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
                <th>状态</th>
                <th>成绩</th>
                <th>绩点</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{displayName(row)}</td>
                  <td className="text-slate-500">{row.student.email}</td>
                  <td>
                    <span className={`campus-chip ${row.status === "COMPLETED" ? "chip-blue" : "chip-emerald"}`}>
                      {row.status === "COMPLETED" ? "已结课" : "在读"}
                    </span>
                  </td>
                  <td>
                    <select
                      className="campus-select min-w-[120px]"
                      value={row.finalGrade ?? ""}
                      onChange={(e) =>
                        setRows((curr) =>
                          curr.map((item) =>
                            item.id === row.id ? { ...item, finalGrade: e.target.value || null } : item
                          )
                        )
                      }
                    >
                      <option value="">未填写</option>
                      {GRADE_OPTIONS.map((g) => (
                        <option key={g} value={g}>{g}</option>
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
