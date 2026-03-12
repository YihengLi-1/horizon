"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };
type DigestPreview = {
  enrolledCount: number;
  waitlistedCount: number;
  cartCount: number;
  pendingAppeals: number;
  upcomingDeadline: string | null;
  topSections: Array<{ code: string; title: string; enrolled: number; capacity: number }>;
  htmlPreview: string;
};

export default function AdminDigestPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [preview, setPreview] = useState<DigestPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [showHtml, setShowHtml] = useState(false);

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms").then(setTerms).catch(() => {});
  }, []);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setSendResult(null);
    try {
      const data = await apiFetch<DigestPreview>(`/admin/digest-preview${termId ? `?termId=${termId}` : ""}`);
      setPreview(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [termId]);

  useEffect(() => { void loadPreview(); }, [loadPreview]);

  async function sendDigest() {
    if (!email.trim() || !preview) return;
    setSending(true);
    setSendResult(null);
    try {
      await apiFetch("/admin/digest-send", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), termId: termId || undefined })
      });
      setSendResult(`✅ 已发送至 ${email.trim()}`);
    } catch {
      setSendResult("❌ 发送失败，请检查 SMTP 配置");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Admin Tools</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">邮件摘要预览</h1>
        <p className="mt-1 text-sm text-slate-500">预览并发送注册管理周报邮件</p>
      </section>

      <div className="campus-card p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900">摘要配置</h2>
        <div className="flex gap-3">
          <select
            className="campus-select flex-1"
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
          >
            <option value="">所有学期</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadPreview()}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "生成中…" : "🔄 刷新预览"}
          </button>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-xs font-semibold uppercase text-slate-500 mb-2">发送测试邮件</h3>
          <div className="flex gap-2">
            <input
              className="campus-input flex-1"
              type="email"
              placeholder="输入收件人邮箱…"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              type="button"
              disabled={sending || !email.trim() || !preview}
              onClick={() => void sendDigest()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              {sending ? "发送中…" : "发送"}
            </button>
          </div>
          {sendResult && (
            <p className="mt-2 text-sm font-medium">{sendResult}</p>
          )}
        </div>
      </div>

      {preview && (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="campus-kpi">
              <p className="campus-kpi-label">已选课</p>
              <p className="campus-kpi-value text-indigo-600">{preview.enrolledCount}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">候补</p>
              <p className="campus-kpi-value text-amber-600">{preview.waitlistedCount}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">购物车</p>
              <p className="campus-kpi-value text-sky-600">{preview.cartCount}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">待审申诉</p>
              <p className="campus-kpi-value text-red-600">{preview.pendingAppeals}</p>
            </div>
          </div>

          {preview.upcomingDeadline && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              ⏰ 即将到来的退课截止日期：{preview.upcomingDeadline}
            </div>
          )}

          {preview.topSections.length > 0 && (
            <div className="campus-card p-4 space-y-2">
              <h3 className="text-xs font-bold uppercase text-slate-500">教学班快览</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="py-1.5 text-left text-xs font-semibold text-slate-500">代码</th>
                    <th className="py-1.5 text-left text-xs font-semibold text-slate-500">课程名</th>
                    <th className="py-1.5 text-right text-xs font-semibold text-slate-500">选课/容量</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {preview.topSections.map((s) => (
                    <tr key={s.code}>
                      <td className="py-1.5 font-mono text-xs font-bold text-indigo-700">{s.code}</td>
                      <td className="py-1.5 text-slate-700">{s.title}</td>
                      <td className="py-1.5 text-right font-mono text-xs text-slate-600">{s.enrolled}/{s.capacity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* HTML Preview toggle */}
          <div className="campus-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-slate-500">HTML 邮件预览</h3>
              <button
                type="button"
                onClick={() => setShowHtml((v) => !v)}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                {showHtml ? "▲ 收起" : "▼ 展开"}
              </button>
            </div>
            {showHtml && (
              <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
                <iframe
                  srcDoc={preview.htmlPreview}
                  className="w-full"
                  style={{ height: "500px", border: "none" }}
                  title="Email Preview"
                  sandbox="allow-same-origin"
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
