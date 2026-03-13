"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = {
  id: string;
  name: string;
};

type MeetingTime = {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
};

type ReceiptItem = {
  enrollmentId: string;
  courseCode: string;
  title: string;
  credits: number;
  sectionCode: string;
  instructorName: string;
  meetingTimes: MeetingTime[];
};

type EnrollmentReceipt = {
  term: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  } | null;
  items: ReceiptItem[];
  totalCredits: number;
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatMeetingTimes(meetingTimes: MeetingTime[]) {
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export default function StudentReceiptPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [receipt, setReceipt] = useState<EnrollmentReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms")
      .then((data) => {
        const nextTerms = (data ?? []).sort((a, b) => b.name.localeCompare(a.name));
        setTerms(nextTerms);
        const params = new URLSearchParams(window.location.search);
        const queryTermId = params.get("termId") ?? "";
        const initialTermId = queryTermId || nextTerms[0]?.id || "";
        setTermId(initialTermId);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "加载学期失败"));
  }, []);

  useEffect(() => {
    if (!termId && terms.length === 0) return;
    setLoading(true);
    setError("");
    const suffix = termId ? `?termId=${termId}` : "";
    void apiFetch<EnrollmentReceipt>(`/students/enrollment-receipt${suffix}`)
      .then((data) => {
        setReceipt(data);
        const url = new URL(window.location.href);
        if (termId) {
          url.searchParams.set("termId", termId);
        } else {
          url.searchParams.delete("termId");
        }
        window.history.replaceState({}, "", url.toString());
      })
      .catch((err) => {
        setReceipt(null);
        setError(err instanceof Error ? err.message : "加载选课确认单失败");
      })
      .finally(() => setLoading(false));
  }, [termId, terms.length]);

  const printedAt = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date()),
    []
  );

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero print:pb-0">
        <p className="campus-eyebrow">Enrollment Record</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">选课确认单</h1>
        <p className="mt-1 text-sm text-slate-500">打印当前学期已选课程、班级和学分汇总</p>
      </section>

      <div className="campus-toolbar print:hidden">
        <select className="campus-select" value={termId} onChange={(event) => setTermId(event.target.value)}>
          <option value="">自动选择当前学期</option>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          打印确认单
        </button>
      </div>

      {error ? <div className="campus-card border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">⏳ 加载中…</div>
      ) : !receipt?.term ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-400">当前没有可打印的选课记录</div>
      ) : (
        <section className="campus-card space-y-6 p-6 print:shadow-none">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="campus-kpi">
              <p className="campus-kpi-label">学期</p>
              <p className="campus-kpi-value text-indigo-600">{receipt.term.name}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">课程数</p>
              <p className="campus-kpi-value">{receipt.items.length}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">总学分</p>
              <p className="campus-kpi-value text-emerald-600">{receipt.totalCredits}</p>
            </div>
          </div>

          <div className="space-y-1 text-sm text-slate-600">
            <p>打印时间：{printedAt}</p>
            <p>
              学期区间：{formatDate(receipt.term.startDate)} - {formatDate(receipt.term.endDate)}
            </p>
          </div>

          {receipt.items.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
              当前学期暂无已选课程。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">课程</th>
                    <th className="px-4 py-3">标题</th>
                    <th className="px-4 py-3">学分</th>
                    <th className="px-4 py-3">教学班</th>
                    <th className="px-4 py-3">教师</th>
                    <th className="px-4 py-3">上课时间</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.items.map((item) => (
                    <tr key={item.enrollmentId} className="border-b border-slate-50">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-indigo-700">{item.courseCode}</td>
                      <td className="px-4 py-3 text-slate-700">{item.title}</td>
                      <td className="px-4 py-3 text-slate-700">{item.credits}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">§{item.sectionCode}</td>
                      <td className="px-4 py-3 text-slate-700">{item.instructorName}</td>
                      <td className="px-4 py-3 text-slate-500">{formatMeetingTimes(item.meetingTimes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
