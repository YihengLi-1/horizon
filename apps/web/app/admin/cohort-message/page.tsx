"use client";

import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

type CohortSummary = {
  year: string;
  total: number;
  active: number;
  retentionPct: number;
  completedPct: number;
  avgGpa: number | null;
};

type SendResult = { cohortYear: string; total: number; sent: number };

export default function CohortMessagePage() {
  const [cohorts, setCohorts] = useState<CohortSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<CohortSummary[]>("/admin/cohort-analytics");
      setCohorts(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedYear || !subject.trim() || !body.trim()) {
      setError("请填写所有必填项");
      return;
    }
    setSending(true);
    setError("");
    setResult(null);
    try {
      const data = await apiFetch<SendResult>("/admin/cohort-message", {
        method: "POST",
        body: JSON.stringify({ cohortYear: selectedYear, subject, body })
      });
      setResult(data);
      setSubject("");
      setBody("");
    } catch (err) {
      setError(String(err));
    } finally {
      setSending(false);
    }
  }

  const selectedCohort = cohorts.find((c) => c.year === selectedYear);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">精准沟通</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">届次群发消息</h1>
        <p className="mt-1 text-sm text-slate-600 md:text-base">
          按入学年份向特定届次的所有学生发送邮件通知。
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Left: cohort picker */}
        <section className="campus-card p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-800">选择届次</h2>

          {loading ? (
            <p className="text-sm text-slate-500">加载中…</p>
          ) : cohorts.length === 0 ? (
            <p className="text-sm text-slate-500">暂无届次数据</p>
          ) : (
            <div className="space-y-2">
              {cohorts.map((c) => (
                <button
                  key={c.year}
                  onClick={() => setSelectedYear(c.year)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedYear === c.year ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{c.year} 届</span>
                    <span className="text-xs text-slate-500">{c.total} 名学生</span>
                  </div>
                  <div className="mt-1 flex gap-3 text-xs text-slate-500">
                    <span>活跃: {c.retentionPct}%</span>
                    <span>完成率: {c.completedPct}%</span>
                    {c.avgGpa !== null && <span>均绩: {c.avgGpa.toFixed(2)}</span>}
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-indigo-400"
                      style={{ width: `${c.retentionPct}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Right: compose form */}
        <section className="campus-card p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-800">撰写消息</h2>

          {selectedCohort ? (
            <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-sm text-indigo-700">
              将发送给 <strong>{selectedCohort.year} 届</strong>的{" "}
              <strong>{selectedCohort.total}</strong> 名学生
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-500">
              请先从左侧选择届次
            </div>
          )}

          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                邮件主题 <span className="text-red-500">*</span>
              </label>
              <input
                className="campus-input w-full"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="例如：关于本学期选课安排的通知"
                disabled={!selectedYear}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                消息正文 <span className="text-red-500">*</span>
              </label>
              <textarea
                className="campus-input w-full min-h-[160px] resize-y"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="请输入消息内容…"
                disabled={!selectedYear}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
            )}

            {result && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                ✅ 成功发送 <strong>{result.sent}</strong> / {result.total} 封邮件（{result.cohortYear} 届）
              </div>
            )}

            <button
              type="submit"
              disabled={sending || !selectedYear}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {sending ? "发送中…" : "📨 发送邮件"}
            </button>
          </form>
        </section>
      </div>

      <section className="campus-card p-5">
        <h2 className="text-sm font-semibold text-slate-600 mb-2">使用须知</h2>
        <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
          <li>消息将同步写入所有学生的通知记录</li>
          <li>发送结果将记录在审计日志中</li>
          <li>请确认收件人范围后再发送，发送后无法撤回</li>
          <li>按届次划分依据：学生账户创建年份</li>
        </ul>
      </section>
    </div>
  );
}
