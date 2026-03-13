"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toast";
import { ApiError, apiFetch } from "@/lib/api";

type CartItem = {
  id: string;
  section: {
    id: string;
    sectionCode: string;
    instructorName: string;
    credits: number;
    term: {
      id: string;
      name: string;
    };
    course: {
      code: string;
      title: string;
    };
    meetingTimes: Array<{
      weekday: number;
      startMinutes: number;
      endMinutes: number;
    }>;
  };
};

type EnrollResult = {
  id: string;
  status: string;
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatMeetingTimes(meetingTimes: CartItem["section"]["meetingTimes"]) {
  if (!meetingTimes.length) return "TBD";
  return meetingTimes
    .map((meetingTime) => {
      const startHour = String(Math.floor(meetingTime.startMinutes / 60)).padStart(2, "0");
      const startMinute = String(meetingTime.startMinutes % 60).padStart(2, "0");
      const endHour = String(Math.floor(meetingTime.endMinutes / 60)).padStart(2, "0");
      const endMinute = String(meetingTime.endMinutes % 60).padStart(2, "0");
      return `${WEEKDAY[meetingTime.weekday]} ${startHour}:${startMinute}-${endHour}:${endMinute}`;
    })
    .join(", ");
}

function normalizeQuickAddError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "SECTION_FULL") return "该教学班已满员";
    if (error.code === "TIME_CONFLICT") return "当前课程与已选课程时间冲突";
    if (error.code === "CREDIT_LIMIT_EXCEEDED") return "超过当前学期可选学分上限";
    if (error.code === "ACTIVE_REGISTRATION_HOLD") return "存在生效中的限制，当前无法注册";
    if (error.code === "REGISTRATION_WINDOW_CLOSED") return "当前不在选课开放时间内";
    if (error.message.includes("PREREQ_NOT_MET")) return error.message.replace("PREREQ_NOT_MET: ", "先修课程未满足：");
    return error.message;
  }
  return error instanceof Error ? error.message : "注册失败，请稍后重试";
}

export default function QuickAddPage() {
  const toast = useToast();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  const totalCredits = useMemo(
    () => items.reduce((sum, item) => sum + item.section.credits, 0),
    [items]
  );

  function loadCart() {
    setLoading(true);
    setError("");
    void apiFetch<CartItem[]>("/students/cart")
      .then((data) => setItems(data ?? []))
      .catch((err) => {
        setItems([]);
        setError(err instanceof Error ? err.message : "加载购物车失败");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadCart();
  }, []);

  async function handleEnroll(item: CartItem) {
    setSubmittingId(item.id);
    setItemErrors((prev) => ({ ...prev, [item.id]: "" }));
    try {
      const result = await apiFetch<EnrollResult>("/registration/enroll", {
        method: "POST",
        body: JSON.stringify({
          termId: item.section.term.id,
          sectionId: item.section.id
        })
      });

      await apiFetch(`/registration/cart/${item.id}`, {
        method: "DELETE"
      }).catch(() => null);

      setItems((prev) => prev.filter((row) => row.id !== item.id));
      toast(
        result.status === "PENDING_APPROVAL"
          ? `已提交 §${item.section.sectionCode}，等待审批`
          : `已注册 §${item.section.sectionCode}`,
        "success"
      );
    } catch (err) {
      const message = normalizeQuickAddError(err);
      setItemErrors((prev) => ({ ...prev, [item.id]: message }));
      toast(message, "error");
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Registration Tools</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">快速注册</h1>
        <p className="mt-1 text-sm text-slate-500">从购物车中直接提交课程注册，失败时显示真实原因</p>
      </section>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">待注册课程</p>
          <p className="campus-kpi-value">{items.length}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">总学分</p>
          <p className="campus-kpi-value text-indigo-600">{totalCredits}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">当前状态</p>
          <p className="campus-kpi-value text-emerald-600">{loading ? "加载中" : "就绪"}</p>
        </div>
      </div>

      <div className="campus-toolbar justify-between">
        <div className="text-sm text-slate-500">仅显示已加入购物车但尚未完成注册的课程</div>
        <button
          type="button"
          onClick={loadCart}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          刷新列表
        </button>
      </div>

      {error ? (
        <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : items.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">购物车中暂无待注册课程</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="campus-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-mono text-xs font-bold text-indigo-700">{item.section.course.code}</p>
                  <h2 className="text-lg font-semibold text-slate-900">{item.section.course.title}</h2>
                  <p className="text-sm text-slate-500">§{item.section.sectionCode} · {item.section.term.name}</p>
                </div>
                <span className="campus-chip border-slate-200 bg-slate-50 text-slate-700">
                  {item.section.credits} 学分
                </span>
              </div>

              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <p>教师：{item.section.instructorName || "TBA"}</p>
                <p>时间：{formatMeetingTimes(item.section.meetingTimes)}</p>
              </div>

              {itemErrors[item.id] ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {itemErrors[item.id]}
                </div>
              ) : null}

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleEnroll(item)}
                  disabled={submittingId === item.id}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submittingId === item.id ? "提交中…" : "立即注册"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
