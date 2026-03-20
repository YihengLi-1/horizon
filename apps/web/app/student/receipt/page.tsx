"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type MeetingTime = { weekday: number; startMinutes: number; endMinutes: number };
type ReceiptItem = {
  enrollmentId: string;
  courseCode: string;
  title: string;
  credits: number;
  sectionCode: string;
  instructorName: string;
  meetingTimes: MeetingTime[];
};

type ReceiptData = {
  term: { id: string; name: string; startDate: string; endDate: string } | null;
  items: ReceiptItem[];
  totalCredits: number;
};

type Term = { id: string; name: string };

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function fmt(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export default function ReceiptPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [data, setData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<Term[]>("/admin/terms").then((d) => setTerms(d ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "学期列表加载失败"));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    const url = termId ? `/students/enrollment-receipt?termId=${termId}` : "/students/enrollment-receipt";
    void apiFetch<ReceiptData>(url)
      .then((d) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [termId]);

  function print() {
    window.print();
  }

  const receiptDate = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="campus-page">
      <section className="campus-hero no-print">
        <p className="campus-eyebrow">选课凭证</p>
        <h1 className="campus-title">注册确认书</h1>
        <p className="campus-subtitle">当前已注册课程的正式确认凭证，可打印留存</p>
      </section>

      <div className="campus-toolbar no-print">
        <select
          className="campus-select w-48"
          value={termId}
          onChange={(e) => setTermId(e.target.value)}
        >
          <option value="">当前学期</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={print}
          disabled={!data?.items.length}
          className="campus-btn-ghost disabled:opacity-40"
        >
          🖨 打印
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">加载中…</div>
      ) : !data?.term ? (
        <div className="campus-card p-10 text-center text-slate-400">暂无学期数据</div>
      ) : data.items.length === 0 ? (
        <div className="campus-card p-10 text-center text-slate-400">
          {data.term.name} 尚未注册任何课程。
        </div>
      ) : (
        <section className="campus-card overflow-hidden print:shadow-none print:border-0">
          {/* Receipt header */}
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-bold text-slate-900">地平线大学选课系统</p>
                <p className="text-sm text-slate-600 mt-0.5">注册确认书</p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>打印日期：{receiptDate}</p>
                <p className="mt-0.5">学期：<span className="font-semibold text-slate-700">{data.term.name}</span></p>
              </div>
            </div>
          </div>

          {/* Course table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-500 border-b border-slate-200">
                  <th className="px-5 py-3 text-left">课程代码</th>
                  <th className="px-5 py-3 text-left">课程名称</th>
                  <th className="px-5 py-3 text-left">班级</th>
                  <th className="px-5 py-3 text-left">教师</th>
                  <th className="px-5 py-3 text-left">上课时间</th>
                  <th className="px-5 py-3 text-right">学分</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.enrollmentId} className="border-t border-slate-100">
                    <td className="px-5 py-3 font-mono font-semibold text-slate-900">{item.courseCode}</td>
                    <td className="px-5 py-3 text-slate-800">{item.title}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{item.sectionCode}</td>
                    <td className="px-5 py-3 text-slate-700">{item.instructorName || "—"}</td>
                    <td className="px-5 py-3 text-xs text-slate-600">
                      {item.meetingTimes.length === 0 ? "—" : item.meetingTimes.map((m) =>
                        `${WEEKDAY[m.weekday]} ${fmt(m.startMinutes)}–${fmt(m.endMinutes)}`
                      ).join(", ")}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-900">{item.credits}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td colSpan={5} className="px-5 py-3 text-right text-sm font-semibold text-slate-700">合计学分</td>
                  <td className="px-5 py-3 text-right text-lg font-bold text-slate-900">{data.totalCredits}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 px-6 py-4 text-xs text-slate-500">
            <p>本确认书由学生信息系统自动生成，如有疑问请联系注册处。</p>
            <p className="mt-0.5">学期日期：{new Date(data.term.startDate).toLocaleDateString("zh-CN")} — {new Date(data.term.endDate).toLocaleDateString("zh-CN")}</p>
          </div>
        </section>
      )}
    </div>
  );
}
