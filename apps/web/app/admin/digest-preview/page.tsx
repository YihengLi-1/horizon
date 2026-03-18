"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type DigestPreview = {
  enrolledCount: number;
  waitlistedCount: number;
  cartCount: number;
  pendingAppeals: number;
  upcomingDeadline: string | null;
  topSections: { code: string; title: string; enrolled: number; capacity: number }[];
  htmlPreview: string;
};

type Term = { id: string; name: string };

export default function DigestPreviewPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [digest, setDigest] = useState<DigestPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState("");
  const [email, setEmail] = useState("");
  const [tab, setTab] = useState<"preview" | "html">("preview");

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    setDigest(null);
    const url = termId ? `/admin/digest-preview?termId=${termId}` : "/admin/digest-preview";
    void apiFetch<DigestPreview>(url)
      .then((d) => setDigest(d))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId]);

  async function sendDigest() {
    if (!email.trim()) {
      setSendError("请输入收件人邮箱。");
      return;
    }
    setSending(true);
    setSendError("");
    setSendSuccess("");
    try {
      const res = await apiFetch<{ sent: boolean; to: string }>("/admin/digest-send", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), termId: termId || undefined }),
      });
      if (res?.sent) {
        setSendSuccess(`周报已成功发送至 ${res.to}`);
        setEmail("");
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">运营工具</p>
        <h1 className="campus-hero-title">管理员周报预览</h1>
        <p className="campus-hero-subtitle">查看当前注册运营摘要，并一键发送邮件周报至指定收件人</p>
      </section>

      {digest ? (
        <section className="grid gap-3 sm:grid-cols-4">
          <div className="campus-kpi">
            <p className="campus-kpi-label">已选课人数</p>
            <p className="campus-kpi-value">{digest.enrolledCount}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">候补人数</p>
            <p className="campus-kpi-value text-amber-600">{digest.waitlistedCount}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">购物车中</p>
            <p className="campus-kpi-value text-blue-600">{digest.cartCount}</p>
          </div>
          <div className="campus-kpi">
            <p className="campus-kpi-label">待审申诉</p>
            <p className={`campus-kpi-value ${digest.pendingAppeals > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {digest.pendingAppeals}
            </p>
          </div>
        </section>
      ) : null}

      {digest?.upcomingDeadline ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⏰ 即将到来的退课截止日期：<span className="font-bold">{digest.upcomingDeadline}</span>
        </div>
      ) : null}

      <div className="campus-toolbar">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <select
            className="campus-select w-48"
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
          >
            <option value="">全部学期</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        {/* Send section */}
        <div className="flex items-center gap-2 shrink-0">
          <input
            className="campus-input w-52"
            type="email"
            placeholder="收件人邮箱…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void sendDigest()}
            disabled={sending || !digest}
            className="campus-btn-ghost disabled:opacity-40"
          >
            {sending ? "发送中…" : "发送周报"}
          </button>
        </div>
      </div>

      {sendError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{sendError}</div>
      ) : null}
      {sendSuccess ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{sendSuccess}</div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : digest ? (
        <section className="campus-card overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-slate-200">
            {(["preview", "html"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-5 py-3 text-sm font-semibold border-b-2 transition ${
                  tab === t
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t === "preview" ? "邮件预览" : "HTML 源码"}
              </button>
            ))}
          </div>

          {tab === "preview" ? (
            <div className="p-4">
              <iframe
                srcDoc={digest.htmlPreview}
                className="w-full rounded-lg border border-slate-200"
                style={{ height: "600px" }}
                title="周报邮件预览"
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <div className="p-4">
              <pre className="overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-emerald-400 max-h-[600px]">
                {digest.htmlPreview}
              </pre>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
