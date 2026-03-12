"use client";

/**
 * Student — My Advisor page
 * Shows the student's assigned academic advisor(s) and recent advisor notes.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type AdvisorProfile = {
  displayName: string;
  department: string | null;
  officeLocation: string | null;
};

type Advisor = {
  id: string;
  email: string;
  advisorProfile: AdvisorProfile | null;
};

type Assignment = {
  id: string;
  active: boolean;
  assignedAt: string;
  advisor: Advisor;
  assignedBy: { id: string; email: string; role: string };
};

type AdvisorNote = {
  id: string;
  body: string;
  createdAt: string;
  advisor: {
    email: string;
    advisorProfile: { displayName: string } | null;
  };
};

type AdvisorData = {
  assignments: Assignment[];
  advisorNotes: AdvisorNote[];
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  return `${Math.floor(days / 30)}个月前`;
}

export default function MyAdvisorPage() {
  const [data, setData]       = useState<AdvisorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiFetch<AdvisorData>("/students/my-advisor")
      .then((d) => setData(d))
      .catch(() => setData({ assignments: [], advisorNotes: [] }))
      .finally(() => setLoading(false));
  }, []);

  const advisor = data?.assignments?.[0]?.advisor ?? null;
  const profile = advisor?.advisorProfile ?? null;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Support</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">我的学术顾问</h1>
        <p className="mt-1 text-sm text-slate-500">
          查看已分配的学术顾问信息及顾问留言
        </p>
      </section>

      {loading ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-2xl">⏳</p>
          <p className="mt-2 text-sm text-slate-600">加载中…</p>
        </div>
      ) : !advisor ? (
        <div className="campus-card px-6 py-16 text-center space-y-3">
          <p className="text-4xl">👤</p>
          <p className="text-lg font-semibold text-slate-700">尚未分配学术顾问</p>
          <p className="text-sm text-slate-500">
            如需分配顾问，请联系教务处或发送请求
          </p>
          <Link
            href="/student/contact"
            className="inline-block mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            联系支持 →
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Advisor card */}
          <div className="campus-card p-6">
            <div className="flex items-start gap-5">
              {/* Avatar */}
              <div className="shrink-0 flex items-center justify-center size-16 rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-white text-2xl font-bold select-none">
                {(profile?.displayName ?? advisor.email).slice(0, 1).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-slate-900">
                  {profile?.displayName ?? advisor.email}
                </h2>
                {profile?.department && (
                  <p className="text-sm text-indigo-600 font-medium mt-0.5">
                    {profile.department}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-3">
                  {advisor.email && (
                    <a
                      href={`mailto:${advisor.email}`}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      ✉️ {advisor.email}
                    </a>
                  )}
                  {profile?.officeLocation && (
                    <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
                      📍 {profile.officeLocation}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="mt-5 border-t border-slate-100 pt-4 flex flex-wrap gap-2">
              <a
                href={`mailto:${advisor.email}?subject=预约面谈&body=您好，我是您的学生，希望预约一次学术辅导面谈。请告知您方便的时间，谢谢。`}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                📧 预约面谈
              </a>
              <Link
                href="/student/contact"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                💬 发送消息
              </Link>
            </div>
          </div>

          {/* Assignment info */}
          {data?.assignments && data.assignments.length > 0 && (
            <div className="campus-card p-4">
              <h3 className="text-xs font-bold uppercase text-slate-500 mb-3">分配信息</h3>
              <div className="space-y-2">
                {data.assignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      分配日期：{new Date(a.assignedAt).toLocaleDateString("zh-CN")}
                    </span>
                    <span className={`campus-chip text-xs ${a.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
                      {a.active ? "当前顾问" : "已结束"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Advisor Notes */}
          <div className="campus-card p-4">
            <h3 className="text-xs font-bold uppercase text-slate-500 mb-3">顾问留言</h3>
            {!data?.advisorNotes || data.advisorNotes.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">暂无顾问留言</p>
            ) : (
              <div className="space-y-3">
                {data.advisorNotes.map((note) => (
                  <div key={note.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-700">
                        {note.advisor.advisorProfile?.displayName ?? note.advisor.email}
                      </span>
                      <span className="text-xs text-slate-400">{timeAgo(note.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{note.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resources */}
          <div className="campus-card p-4">
            <h3 className="text-xs font-bold uppercase text-slate-500 mb-3">学术资源</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { label: "学习目标", icon: "🎯", href: "/student/profile" },
                { label: "GPA 模拟", icon: "📊", href: "/student/gpa-sim" },
                { label: "毕业进度", icon: "🎓", href: "/student/degree" },
                { label: "可选课检测", icon: "✅", href: "/student/readiness" },
                { label: "四年规划", icon: "📅", href: "/student/planner/4year" },
                { label: "学术支持", icon: "💬", href: "/student/contact" }
              ].map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <span>{r.icon}</span>
                  {r.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
