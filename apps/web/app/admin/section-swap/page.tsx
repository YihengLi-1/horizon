"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type PreviewResult = {
  enrollment: { id: string; status: string };
  student: { id: string; email: string };
  fromSection: { id: string; sectionCode: string; courseCode: string; courseTitle: string; termName: string };
  toSection: { id: string; sectionCode: string; courseCode: string; courseTitle: string; termName: string; capacity: number; enrolled: number; available: number };
  warnings: string[];
  canSwap: boolean;
};

export default function SectionSwapPage() {
  const [enrollmentId, setEnrollmentId] = useState("");
  const [targetSectionId, setTargetSectionId] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function fetchPreview() {
    if (!enrollmentId.trim() || !targetSectionId.trim()) return;
    setLoadingPreview(true);
    setError(""); setSuccess(""); setPreview(null);
    try {
      const data = await apiFetch<PreviewResult>(`/admin/section-swap/${enrollmentId.trim()}/preview?targetSectionId=${targetSectionId.trim()}`);
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "预览失败");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function executeSwap() {
    if (!preview) return;
    setExecuting(true);
    setError("");
    try {
      await apiFetch(`/admin/section-swap/${enrollmentId.trim()}/execute`, {
        method: "POST",
        body: JSON.stringify({ targetSectionId: targetSectionId.trim() }),
      });
      setSuccess(`✓ 已成功将 ${preview.student.email} 从 ${preview.fromSection.sectionCode} 转移至 ${preview.toSection.sectionCode}`);
      setPreview(null);
      setEnrollmentId("");
      setTargetSectionId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">管理工具</p>
        <h1 className="campus-title">学生换班工具</h1>
        <p className="campus-subtitle">将学生从一个教学班调换至另一个教学班，需先预览确认</p>
      </section>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 font-semibold">{success}</div> : null}

      <section className="campus-card p-6">
        <p className="font-semibold text-slate-800 mb-4">填写换班信息</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-slate-600 mb-1 block">注册记录 ID</label>
            <input
              className="campus-input w-full"
              placeholder="输入注册记录的 UUID…"
              value={enrollmentId}
              onChange={(e) => { setEnrollmentId(e.target.value); setPreview(null); }}
            />
          </div>
          <div>
            <label className="text-sm text-slate-600 mb-1 block">目标教学班 ID</label>
            <input
              className="campus-input w-full"
              placeholder="输入目标教学班的 UUID…"
              value={targetSectionId}
              onChange={(e) => { setTargetSectionId(e.target.value); setPreview(null); }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchPreview()}
          disabled={!enrollmentId.trim() || !targetSectionId.trim() || loadingPreview}
          className="mt-4 rounded-lg bg-[hsl(221_83%_43%)] px-5 py-2 text-sm font-semibold text-white hover:opacity-80 transition disabled:opacity-40"
        >
          {loadingPreview ? "查询中…" : "预览换班效果"}
        </button>
      </section>

      {preview ? (
        <section className="campus-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="font-semibold text-slate-800">换班预览</p>
            <p className="text-xs text-slate-400 mt-0.5">学生：{preview.student.email}</p>
          </div>

          <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            <div className="p-5">
              <p className="text-xs font-semibold text-slate-400 mb-2">原教学班</p>
              <p className="font-bold text-slate-900">{preview.fromSection.courseCode} — {preview.fromSection.sectionCode}</p>
              <p className="text-sm text-slate-600 mt-0.5">{preview.fromSection.courseTitle}</p>
              <p className="text-xs text-slate-400 mt-1">{preview.fromSection.termName}</p>
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold text-slate-400 mb-2">目标教学班</p>
              <p className="font-bold text-slate-900">{preview.toSection.courseCode} — {preview.toSection.sectionCode}</p>
              <p className="text-sm text-slate-600 mt-0.5">{preview.toSection.courseTitle}</p>
              <p className="text-xs text-slate-400 mt-1">{preview.toSection.termName}</p>
              <p className="text-xs mt-1">
                <span className={preview.toSection.available <= 0 ? "text-red-600 font-bold" : "text-emerald-600 font-bold"}>
                  {preview.toSection.available <= 0 ? "已满员" : `剩余 ${preview.toSection.available} 位`}
                </span>
                <span className="text-slate-400 ml-1">({preview.toSection.enrolled}/{preview.toSection.capacity})</span>
              </p>
            </div>
          </div>

          {preview.warnings.length > 0 ? (
            <div className="mx-5 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
              {preview.warnings.map((w, i) => <p key={i} className="text-sm text-amber-800">{w}</p>)}
            </div>
          ) : null}

          <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
            <button
              type="button"
              onClick={() => void executeSwap()}
              disabled={!preview.canSwap || executing}
              className="rounded-lg bg-[hsl(221_83%_43%)] px-5 py-2 text-sm font-semibold text-white hover:opacity-80 transition disabled:opacity-40"
            >
              {executing ? "处理中…" : "确认换班"}
            </button>
            <button type="button" onClick={() => setPreview(null)} className="campus-btn-ghost text-sm">取消</button>
          </div>
        </section>
      ) : null}

      <section className="campus-card p-5">
        <p className="font-semibold text-slate-800 mb-2 text-sm">使用说明</p>
        <ul className="text-sm text-slate-500 space-y-1 list-disc list-inside">
          <li>注册记录 ID 可在"注册管理"列表或审计日志中找到</li>
          <li>教学班 ID 可在"教学班"列表的详情页中找到</li>
          <li>目标班级为同一课程时为普通换班，跨课程换班会产生警告</li>
          <li>若目标班级已满，学生将进入候补名单</li>
          <li>操作将写入审计日志</li>
        </ul>
      </section>
    </div>
  );
}
