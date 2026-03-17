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

type StudentProfile = {
  legalName?: string;
  user?: {
    studentId?: string;
    email?: string;
  };
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
  const [student, setStudent] = useState<StudentProfile | null>(null);
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

    void apiFetch<StudentProfile>("/students/me")
      .then((data) => setStudent(data))
      .catch(() => setStudent(null));
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
      <div className="no-print sticky top-4 z-20 flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 items-center rounded-lg border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
        >
          打印确认单
        </button>
      </div>

      <div className="print-only hidden border-b border-slate-300 pb-3">
        <div className="space-y-1">
          <p className="text-xl font-bold text-slate-900">地平线大学</p>
          <p className="text-sm text-slate-600">选课确认单</p>
        </div>
        <div className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-3">
          <p>学生姓名：{student?.legalName || "—"}</p>
          <p>学号：{student?.user?.studentId || "—"}</p>
          <p>打印时间：{printedAt}</p>
        </div>
      </div>

      <section className="campus-hero print:pb-0">
        <p className="campus-eyebrow">Enrollment Record</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">选课确认单</h1>
        <p className="mt-1 text-sm text-slate-500">打印当前学期已选课程、班级和学分汇总</p>
      </section>

      <div className="campus-toolbar no-print">
        <select className="campus-select" value={termId} onChange={(event) => setTermId(event.target.value)}>
          <option value="">自动选择当前学期</option>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.name}
            </option>
          ))}
        </select>
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
            <p>学生：{student?.legalName || "—"} · {student?.user?.studentId || "—"}</p>
          </div>

          {receipt.items.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
              当前学期暂无已选课程。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="campus-table min-w-[960px] text-sm">
                <thead>
                  <tr>
                    <th>课程代码</th>
                    <th>课程名称</th>
                    <th>学分</th>
                    <th>教学班</th>
                    <th>教师</th>
                    <th>上课时间</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.items.map((item) => (
                    <tr key={item.enrollmentId}>
                      <td className="font-mono text-xs font-bold text-indigo-700">{item.courseCode}</td>
                      <td>{item.title}</td>
                      <td>{item.credits}</td>
                      <td className="font-mono text-xs text-slate-600">§{item.sectionCode}</td>
                      <td>{item.instructorName}</td>
                      <td className="text-slate-500">{formatMeetingTimes(item.meetingTimes)}</td>
                      <td>
                        <span className="campus-chip chip-emerald">ENROLLED</span>
                      </td>
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
