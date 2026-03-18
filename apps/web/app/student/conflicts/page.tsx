"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type MeetingTime = { weekday: number; startMinutes: number; endMinutes: number };
type Enrollment = {
  enrollmentId: string;
  courseCode: string;
  title: string;
  sectionCode: string;
  status: string;
  meetingTimes: MeetingTime[];
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

type ReceiptData = {
  term: { id: string; name: string; startDate: string; endDate: string } | null;
  items: ReceiptItem[];
  totalCredits: number;
};

type Conflict = {
  a: ReceiptItem;
  b: ReceiptItem;
  day: number;
  overlapStart: number;
  overlapEnd: number;
};

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function fmt(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function detectConflicts(items: ReceiptItem[]): Conflict[] {
  const conflicts: Conflict[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      for (const mt1 of a.meetingTimes) {
        for (const mt2 of b.meetingTimes) {
          if (mt1.weekday !== mt2.weekday) continue;
          const overlapStart = Math.max(mt1.startMinutes, mt2.startMinutes);
          const overlapEnd = Math.min(mt1.endMinutes, mt2.endMinutes);
          if (overlapStart < overlapEnd) {
            conflicts.push({ a, b, day: mt1.weekday, overlapStart, overlapEnd });
          }
        }
      }
    }
  }
  return conflicts;
}

export default function ConflictsPage() {
  const [data, setData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<ReceiptData>("/students/enrollment-receipt")
      .then((d) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const conflicts = useMemo(() => detectConflicts(data?.items ?? []), [data]);

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">选课工具</p>
        <h1 className="campus-hero-title">时间冲突检测</h1>
        <p className="campus-hero-subtitle">检测当前学期已注册课程中存在时间重叠的教学班</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="campus-kpi">
          <p className="campus-kpi-label">已注册课程数</p>
          <p className="campus-kpi-value">{loading ? "—" : data?.items.length ?? 0}</p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">冲突对数</p>
          <p className={`campus-kpi-value ${conflicts.length > 0 ? "text-red-600" : "text-emerald-600"}`}>
            {loading ? "—" : conflicts.length}
          </p>
        </div>
        <div className="campus-kpi">
          <p className="campus-kpi-label">检测状态</p>
          <p className={`campus-kpi-value text-base ${loading ? "text-slate-400" : conflicts.length === 0 ? "text-emerald-600" : "text-red-600"}`}>
            {loading ? "检测中…" : conflicts.length === 0 ? "✓ 无冲突" : "⚠ 发现冲突"}
          </p>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card p-10 text-center text-slate-400">检测中…</div>
      ) : !data?.term ? (
        <div className="campus-card p-10 text-center text-slate-400">暂无学期数据</div>
      ) : conflicts.length === 0 ? (
        <div className="campus-card p-12 text-center">
          <p className="text-5xl mb-3">✅</p>
          <p className="text-base font-semibold text-emerald-700">当前学期所有已注册课程无时间冲突</p>
          <p className="mt-1 text-sm text-slate-500">
            {data.term.name} · {data.items.length} 门课程已检测
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            ⚠ 发现 <strong>{conflicts.length}</strong> 个时间冲突，请联系注册处或通过课程替换解决。
          </div>

          {conflicts.map((c, i) => (
            <section key={i} className="campus-card border-l-4 border-red-400 overflow-hidden">
              <div className="px-5 py-3 bg-red-50 border-b border-red-100">
                <p className="font-semibold text-red-800 text-sm">
                  冲突 #{i + 1} · {WEEKDAY[c.day]} {fmt(c.overlapStart)}–{fmt(c.overlapEnd)}
                  <span className="ml-2 text-xs font-normal text-red-600">（重叠 {c.overlapEnd - c.overlapStart} 分钟）</span>
                </p>
              </div>
              <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                {[c.a, c.b].map((item, idx) => (
                  <div key={idx} className="p-5">
                    <p className="font-bold text-slate-900">{item.courseCode}</p>
                    <p className="text-sm text-slate-700 mt-0.5">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-1">班级：{item.sectionCode}</p>
                    <div className="mt-2 space-y-0.5">
                      {item.meetingTimes.map((mt, k) => (
                        <p key={k} className={`text-xs ${mt.weekday === c.day ? "font-bold text-red-600" : "text-slate-500"}`}>
                          {WEEKDAY[mt.weekday]} {fmt(mt.startMinutes)}–{fmt(mt.endMinutes)}
                          {mt.weekday === c.day ? " ⚠" : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* All courses */}
      {!loading && data?.items?.length ? (
        <section className="campus-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="font-semibold text-slate-800">已注册课程（{data.term?.name}）</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2 text-left">课程</th>
                <th className="px-5 py-2 text-left">教学班</th>
                <th className="px-5 py-2 text-left">上课时间</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => {
                const hasConflict = conflicts.some((c) => c.a.enrollmentId === item.enrollmentId || c.b.enrollmentId === item.enrollmentId);
                return (
                  <tr key={item.enrollmentId} className={`border-t border-slate-100 ${hasConflict ? "bg-red-50" : ""}`}>
                    <td className="px-5 py-2.5">
                      <span className="font-semibold text-slate-900">{item.courseCode}</span>
                      {hasConflict ? <span className="ml-1 text-red-500">⚠</span> : null}
                      <p className="text-xs text-slate-500">{item.title}</p>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-600">{item.sectionCode}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-600">
                      {item.meetingTimes.length === 0 ? "—" :
                        item.meetingTimes.map((m) => `${WEEKDAY[m.weekday]} ${fmt(m.startMinutes)}–${fmt(m.endMinutes)}`).join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
