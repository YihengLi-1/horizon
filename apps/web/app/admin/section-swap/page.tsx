"use client";

/**
 * Admin Section Swap Tool
 * Allows admins to move a student from one section to another.
 * Step 1: Enter enrollmentId + target sectionId → preview
 * Step 2: Confirm → execute swap
 */

import { useState } from "react";
import { apiFetch } from "@/lib/api";

type SwapPreview = {
  enrollment: { id: string; status: string };
  student: { id: string; name: string; email: string };
  fromSection: { id: string; sectionCode: string; courseCode: string; courseTitle: string; termName: string };
  toSection: { id: string; sectionCode: string; courseCode: string; courseTitle: string; termName: string; capacity: number; enrolled: number; available: number };
  warnings: string[];
  canSwap: boolean;
};

type SwapResult = { success: boolean; newStatus: string; enrollmentId: string };

export default function SectionSwapPage() {
  const [enrollmentId, setEnrollmentId] = useState("");
  const [targetSectionId, setTargetSectionId] = useState("");
  const [preview, setPreview] = useState<SwapPreview | null>(null);
  const [result, setResult] = useState<SwapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handlePreview() {
    if (!enrollmentId.trim() || !targetSectionId.trim()) {
      setError("请填写注册 ID 和目标班级 ID");
      return;
    }
    setLoading(true);
    setError("");
    setPreview(null);
    setResult(null);
    try {
      const data = await apiFetch<SwapPreview>(
        `/admin/section-swap/${enrollmentId.trim()}/preview?targetSectionId=${targetSectionId.trim()}`
      );
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "预览失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!preview) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<SwapResult>(
        `/admin/section-swap/${preview.enrollment.id}/execute?targetSectionId=${preview.toSection.id}`,
        { method: "POST" }
      );
      setResult(data);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "执行失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Enrollment Management</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">班级调换工具</h1>
        <p className="mt-1 text-sm text-slate-500">将学生从一个教学班调换至另一个教学班，支持预览与确认</p>
      </section>

      {/* Input form */}
      <div className="campus-card p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900">第一步：输入调换信息</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">注册记录 ID (Enrollment ID)</label>
            <input
              className="campus-input w-full font-mono text-xs"
              placeholder="cuid..."
              value={enrollmentId}
              onChange={(e) => setEnrollmentId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">目标班级 ID (Section ID)</label>
            <input
              className="campus-input w-full font-mono text-xs"
              placeholder="cuid..."
              value={targetSectionId}
              onChange={(e) => setTargetSectionId(e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handlePreview()}
          disabled={loading}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "加载中…" : "预览调换"}
        </button>
      </div>

      {error && <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div>}

      {/* Success result */}
      {result && (
        <div className="campus-card border-emerald-200 bg-emerald-50 px-6 py-5 space-y-1">
          <p className="font-bold text-emerald-800">✅ 调换成功</p>
          <p className="text-sm text-emerald-700">新状态：<strong>{result.newStatus}</strong></p>
          <button
            type="button"
            onClick={() => { setResult(null); setEnrollmentId(""); setTargetSectionId(""); }}
            className="mt-2 text-xs text-emerald-700 underline"
          >
            再次调换
          </button>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          <div className="campus-card p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">第二步：确认调换详情</h2>

            {/* Student */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="size-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                {preview.student.name.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">{preview.student.name}</p>
                <p className="text-xs text-slate-500">{preview.student.email}</p>
              </div>
              <span className="ml-auto text-xs font-semibold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                当前状态: {preview.enrollment.status}
              </span>
            </div>

            {/* Section comparison */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-3 border border-slate-200 rounded-lg space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">当前班级</p>
                <p className="font-mono font-bold text-slate-700">{preview.fromSection.courseCode} · §{preview.fromSection.sectionCode}</p>
                <p className="text-xs text-slate-600">{preview.fromSection.courseTitle}</p>
                <p className="text-xs text-slate-400">{preview.fromSection.termName}</p>
              </div>
              <div className="p-3 border-2 border-indigo-300 bg-indigo-50 rounded-lg space-y-1">
                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">目标班级</p>
                <p className="font-mono font-bold text-indigo-700">{preview.toSection.courseCode} · §{preview.toSection.sectionCode}</p>
                <p className="text-xs text-indigo-600">{preview.toSection.courseTitle}</p>
                <p className="text-xs text-indigo-400">{preview.toSection.termName}</p>
                <p className="text-xs text-slate-500 mt-1">
                  剩余容量：<strong className={preview.toSection.available <= 0 ? "text-red-600" : "text-emerald-600"}>
                    {preview.toSection.available}
                  </strong>/{preview.toSection.capacity}
                </p>
              </div>
            </div>

            {/* Warnings */}
            {preview.warnings.length > 0 && (
              <div className="space-y-1">
                {preview.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    {w}
                  </div>
                ))}
              </div>
            )}

            {/* Confirm buttons */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => void handleExecute()}
                disabled={loading}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? "执行中…" : "确认执行调换"}
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Usage guide */}
      {!preview && !result && (
        <div className="campus-card p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">使用说明</h2>
          <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside">
            <li>在 <strong>注册管理</strong> 页面找到要调换的学生注册记录，复制其 Enrollment ID</li>
            <li>在 <strong>教学班</strong> 页面找到目标班级，复制其 Section ID</li>
            <li>填入上方表单，点击「预览调换」查看变更详情</li>
            <li>确认信息无误后，点击「确认执行调换」完成操作</li>
          </ol>
          <p className="mt-3 text-xs text-slate-400">所有调换操作均记录审计日志。若目标班级已满员，学生将自动转为候补状态。</p>
        </div>
      )}
    </div>
  );
}
