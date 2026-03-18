"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type CartItem = {
  id: string;
  sectionId: string;
  section: {
    id: string;
    sectionCode: string;
    course: { id: string; code: string; title: string; credits: number };
    capacity: number;
    enrolledCount: number;
    instructorName: string | null;
    meetingTimes: { weekday: number; startMinutes: number; endMinutes: number }[];
  };
};

type EnrollResult = {
  sectionId: string;
  status: "success" | "error";
  code?: string;
  message?: string;
};

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function fmt(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const ERROR_MESSAGES: Record<string, string> = {
  SECTION_FULL: "班级已满员",
  TIME_CONFLICT: "时间与已注册课程冲突",
  ALREADY_ENROLLED: "已注册该课程",
  PREREQ_NOT_MET: "先修课程未满足",
  HOLD_ON_ACCOUNT: "账户存在限制，无法注册",
  REG_WINDOW_CLOSED: "选课窗口已关闭",
  CREDIT_LIMIT_EXCEEDED: "超出学分上限",
};

export default function QuickAddPage() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enrolling, setEnrolling] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Map<string, EnrollResult>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function loadCart() {
    setLoading(true);
    void apiFetch<CartItem[]>("/registration/cart")
      .then((d) => {
        const items = d ?? [];
        setCartItems(items);
        setSelected(new Set(items.map((i) => i.sectionId)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadCart(); }, []);

  async function enrollOne(item: CartItem) {
    setEnrolling((prev) => new Set(prev).add(item.sectionId));
    try {
      await apiFetch("/registration/enroll", { method: "POST", body: JSON.stringify({ sectionId: item.sectionId }) });
      setResults((prev) => new Map(prev).set(item.sectionId, { sectionId: item.sectionId, status: "success" }));
    } catch (err) {
      const errObj = err as Error & { code?: string };
      const code = errObj.code ?? "UNKNOWN";
      setResults((prev) => new Map(prev).set(item.sectionId, {
        sectionId: item.sectionId,
        status: "error",
        code,
        message: ERROR_MESSAGES[code] ?? errObj.message ?? "注册失败",
      }));
    } finally {
      setEnrolling((prev) => { const next = new Set(prev); next.delete(item.sectionId); return next; });
    }
  }

  async function enrollSelected() {
    const toEnroll = cartItems.filter((i) => selected.has(i.sectionId) && !results.get(i.sectionId)?.status);
    for (const item of toEnroll) {
      await enrollOne(item);
    }
    loadCart();
  }

  function toggleSelect(sectionId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  const successCount = [...results.values()].filter((r) => r.status === "success").length;
  const errorCount = [...results.values()].filter((r) => r.status === "error").length;
  const pendingCount = cartItems.filter((i) => !results.has(i.sectionId)).length;

  const enrollingAny = enrolling.size > 0;

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">选课工具</p>
        <h1 className="campus-hero-title">快速选课</h1>
        <p className="campus-hero-subtitle">勾选购物车中的课程，一键批量注册</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="campus-kpi">
          <p className="campus-kpi-label">购物车课程数</p>
          <p className="campus-kpi-value">{loading ? "—" : cartItems.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">已勾选</p>
          <p className="campus-kpi-value text-[hsl(221_83%_43%)]">{selected.size}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">注册成功</p>
          <p className="campus-kpi-value text-emerald-600">{successCount}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">注册失败</p>
          <p className="campus-kpi-value text-red-600">{errorCount}</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {successCount > 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✓ 已成功注册 <strong>{successCount}</strong> 门课程
        </div>
      ) : null}

      {loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : cartItems.length === 0 ? (
        <div className="campus-card p-12 text-center">
          <p className="text-4xl mb-3">🛒</p>
          <p className="text-sm font-semibold text-slate-600">购物车为空</p>
          <p className="mt-1 text-xs text-slate-400">
            请先前往<a href="/student/catalog" className="text-[hsl(221_83%_43%)] hover:underline mx-1">课程目录</a>添加课程到购物车
          </p>
        </div>
      ) : (
        <>
          <div className="campus-toolbar">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.size === cartItems.length && cartItems.length > 0}
                onChange={(e) => setSelected(e.target.checked ? new Set(cartItems.map((i) => i.sectionId)) : new Set())}
                className="w-4 h-4"
              />
              全选
            </label>
            <button
              type="button"
              onClick={() => void enrollSelected()}
              disabled={selected.size === 0 || enrollingAny}
              className="campus-btn-ghost shrink-0 disabled:opacity-40 font-semibold text-[hsl(221_83%_43%)]"
            >
              {enrollingAny ? "注册中…" : `注册 ${selected.size} 门课程`}
            </button>
          </div>

          <div className="space-y-3">
            {cartItems.map((item) => {
              const result = results.get(item.sectionId);
              const isEnrolling = enrolling.has(item.sectionId);
              const isSuccess = result?.status === "success";
              const isError = result?.status === "error";
              const isChecked = selected.has(item.sectionId);

              return (
                <div
                  key={item.id}
                  className={`campus-card p-5 transition border-2 ${
                    isSuccess ? "border-emerald-300 bg-emerald-50/30" :
                    isError ? "border-red-300 bg-red-50/30" :
                    isChecked ? "border-[hsl(221_83%_43%)]" :
                    "border-transparent"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isSuccess || isEnrolling}
                      onChange={() => toggleSelect(item.sectionId)}
                      className="mt-1 w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-bold text-slate-900">{item.section.course.code}</p>
                          <p className="text-sm text-slate-700">{item.section.course.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            班级：{item.section.sectionCode}
                            {item.section.instructorName ? ` · ${item.section.instructorName}` : ""}
                            {" · "}{item.section.course.credits} 学分
                          </p>
                          {item.section.meetingTimes.length > 0 ? (
                            <p className="text-xs text-slate-500 mt-0.5">
                              {item.section.meetingTimes.map((m) => `${WEEKDAY[m.weekday]} ${fmt(m.startMinutes)}–${fmt(m.endMinutes)}`).join(", ")}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Capacity indicator */}
                          <div className="text-right">
                            <p className="text-xs text-slate-500">
                              {item.section.enrolledCount}/{item.section.capacity} 人
                            </p>
                            <div className="h-1.5 w-16 rounded-full bg-slate-100 mt-0.5">
                              <div
                                className={`h-1.5 rounded-full ${item.section.enrolledCount >= item.section.capacity ? "bg-red-400" : "bg-emerald-400"}`}
                                style={{ width: `${Math.min(100, (item.section.enrolledCount / Math.max(1, item.section.capacity)) * 100)}%` }}
                              />
                            </div>
                          </div>
                          {/* Action / status */}
                          {isSuccess ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">✓ 已注册</span>
                          ) : isEnrolling ? (
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">注册中…</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void enrollOne(item)}
                              className="rounded-full border border-[hsl(221_83%_43%)] bg-[hsl(221_83%_43%)] px-3 py-1 text-xs font-semibold text-white hover:opacity-80 transition"
                            >
                              立即注册
                            </button>
                          )}
                        </div>
                      </div>
                      {isError ? (
                        <p className="mt-2 text-xs font-medium text-red-600">
                          ✗ {result!.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
