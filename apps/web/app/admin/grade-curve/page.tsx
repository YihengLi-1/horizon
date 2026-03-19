"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type GradeCurvePreview = {
  sectionId: string;
  steps: number;
  totalStudents: number;
  changedCount: number;
  currentGpa: number;
  newGpa: number;
  preview: { enrollmentId: string; originalGrade: string; curvedGrade: string; changed: boolean }[];
};

type Term = { id: string; name: string };
type Section = { id: string; sectionCode: string; courseCode: string; courseTitle: string };

const GRADE_COLORS: Record<string, string> = {
  "A+": "text-emerald-700", "A": "text-emerald-700", "A-": "text-emerald-600",
  "B+": "text-blue-700", "B": "text-blue-600", "B-": "text-blue-500",
  "C+": "text-amber-700", "C": "text-amber-600", "C-": "text-amber-500",
  "D+": "text-orange-600", "D": "text-orange-500", "D-": "text-orange-400",
  "F": "text-red-600",
};

export default function GradeCurvePage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [steps, setSteps] = useState(1);
  const [preview, setPreview] = useState<GradeCurvePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!termId) { setSections([]); setSectionId(""); return; }
    void apiFetch<Section[]>(`/admin/sections?termId=${termId}&limit=200`)
      .then((d) => setSections(d ?? []))
      .catch(() => setSections([]));
  }, [termId]);

  async function fetchPreview() {
    if (!sectionId) return;
    setLoading(true);
    setError(""); setPreview(null);
    try {
      const data = await apiFetch<GradeCurvePreview>(`/admin/grade-curve/${sectionId}/preview?steps=${steps}`);
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "预览失败");
    } finally {
      setLoading(false);
    }
  }

  // Distribution helpers
  function distribution(grades: string[]) {
    const counts: Record<string, number> = {};
    for (const g of grades) counts[g] = (counts[g] ?? 0) + 1;
    return counts;
  }

  const origGrades = preview?.preview.map((p) => p.originalGrade) ?? [];
  const curvedGrades = preview?.preview.map((p) => p.curvedGrade) ?? [];
  const origDist = distribution(origGrades);
  const curvedDist = distribution(curvedGrades);
  const allGrades = [...new Set([...Object.keys(origDist), ...Object.keys(curvedDist)])].sort((a, b) => {
    const order = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "W"];
    return order.indexOf(a) - order.indexOf(b);
  });
  const maxCount = Math.max(1, ...Object.values(origDist), ...Object.values(curvedDist));

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">成绩管理</p>
        <h1 className="campus-title">成绩曲线工具</h1>
        <p className="campus-subtitle">预览将指定教学班所有成绩提升 N 个等级的效果</p>
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 font-semibold">{success}</div> : null}

      <section className="campus-card p-6">
        <p className="font-semibold text-slate-800 mb-4">设置参数</p>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-slate-600 mb-1 block">学期</label>
            <select className="campus-select w-full" value={termId} onChange={(e) => { setTermId(e.target.value); setSectionId(""); }}>
              <option value="">选择学期…</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-600 mb-1 block">教学班</label>
            <select className="campus-select w-full" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!termId}>
              <option value="">选择教学班…</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.courseCode} {s.sectionCode}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-600 mb-1 block">提升等级数</label>
            <input
              type="number"
              className="campus-input w-full"
              value={steps}
              min={1}
              max={6}
              onChange={(e) => setSteps(Math.max(1, Math.min(6, Number(e.target.value))))}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchPreview()}
          disabled={!sectionId || loading}
          className="mt-4 rounded-lg bg-[hsl(221_83%_43%)] px-5 py-2 text-sm font-semibold text-white hover:opacity-80 transition disabled:opacity-40"
        >
          {loading ? "预览中…" : "生成预览"}
        </button>
      </section>

      {preview ? (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">学生总数</p>
              <p className="campus-kpi-value">{preview.totalStudents}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">变更人数</p>
              <p className="campus-kpi-value text-amber-600">{preview.changedCount}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">原 GPA</p>
              <p className="campus-kpi-value">{preview.currentGpa.toFixed(2)}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">曲线后 GPA</p>
              <p className="campus-kpi-value text-emerald-600">{preview.newGpa.toFixed(2)}</p>
            </div>
          </section>

          {/* Distribution comparison */}
          <section className="campus-card p-5">
            <p className="font-semibold text-slate-800 mb-4">成绩分布对比</p>
            <div className="space-y-2">
              {allGrades.map((g) => {
                const orig = origDist[g] ?? 0;
                const curved = curvedDist[g] ?? 0;
                return (
                  <div key={g} className="flex items-center gap-3 text-sm">
                    <span className={`w-8 font-bold ${GRADE_COLORS[g] ?? "text-slate-700"}`}>{g}</span>
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center gap-1">
                        <div className="h-2 rounded-full bg-slate-200" style={{ width: `${(orig / maxCount) * 160}px` }} />
                        {orig > 0 ? <span className="text-xs text-slate-400">{orig}</span> : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${(curved / maxCount) * 160}px` }} />
                        {curved > 0 ? <span className="text-xs text-emerald-600 font-bold">{curved}</span> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-3 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded bg-slate-200" /> 原始</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded bg-emerald-400" /> 曲线后</span>
            </div>
          </section>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            ⚠ 成绩曲线仅提供预览，实际修改需通过"成绩录入"页面逐条确认。此处不会自动修改任何成绩。
          </div>
        </>
      ) : null}
    </div>
  );
}
