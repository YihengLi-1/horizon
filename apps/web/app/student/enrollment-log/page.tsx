"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type EnrollmentLogItem = {
  auditId: string;
  createdAt: string;
  action: string;
  courseCode: string;
  courseTitle: string;
  sectionCode: string;
  termName: string;
};

function actionTone(action: string) {
  return action.toUpperCase().includes("DROP") ? "chip-red" : "chip-blue";
}

function actionLabel(action: string) {
  const normalized = action.toUpperCase();
  if (normalized.includes("DROP")) return "退课";
  if (normalized.includes("ENROLL")) return "选课";
  return action;
}

export default function StudentEnrollmentLogPage() {
  const [items, setItems] = useState<EnrollmentLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiFetch<EnrollmentLogItem[]>("/students/enrollment-log")
      .then((data) => setItems(data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, EnrollmentLogItem[]>();
    for (const item of items) {
      const key = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long" }).format(new Date(item.createdAt));
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Registration History</p>
        <h1 className="campus-title">选课历史回放</h1>
        <p className="campus-subtitle">按时间查看你的选课与退课操作记录，最新事件优先显示。</p>
      </section>

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">加载中…</div>
      ) : groups.length === 0 ? (
        <div className="campus-empty campus-card">
          <div className="campus-empty-title">暂无选课操作记录</div>
          <div className="campus-empty-desc">完成选课或退课后，时间线会显示在这里。</div>
        </div>
      ) : (
        groups.map(([label, rows]) => (
          <section key={label} className="campus-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">{label}</h2>
              <span className="campus-chip chip-purple">{rows.length} 条记录</span>
            </div>
            <div className="space-y-4">
              {rows.map((item) => (
                <div key={`${item.auditId}-${item.courseCode}`} className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
                  <div className="text-sm text-slate-500">
                    {new Date(item.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </div>
                  <div className="relative rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <span className="absolute left-0 top-4 h-8 w-1 rounded-r-full bg-gradient-to-b from-blue-500 to-violet-500" />
                    <div className="ml-3 flex flex-wrap items-center gap-2">
                      <span className={`campus-chip ${actionTone(item.action)}`}>{actionLabel(item.action)}</span>
                      <span className="font-mono text-sm font-semibold text-slate-900">{item.courseCode}</span>
                      <span className="text-sm text-slate-500">§{item.sectionCode}</span>
                    </div>
                    <p className="ml-3 mt-2 text-sm text-slate-700">{item.courseTitle}</p>
                    <p className="ml-3 mt-1 text-xs text-slate-500">{item.termName}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
