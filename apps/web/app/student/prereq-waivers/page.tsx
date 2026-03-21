"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type WaiverRequest = {
  id: string;
  type: string;
  status: string;
  reason: string | null;
  submittedAt: string;
  updatedAt: string;
  section: {
    id: string;
    sectionCode: string;
    course: { code: string; title: string };
  } | null;
  term: { id: string; name: string } | null;
};

const STATUS_STYLES: Record<string, { label: string; chip: string }> = {
  SUBMITTED: { label: "待审核", chip: "chip-blue" },
  APPROVED: { label: "已批准", chip: "chip-emerald" },
  REJECTED: { label: "已拒绝", chip: "chip-red" },
  WITHDRAWN: { label: "已撤回", chip: "campus-chip border-slate-200 bg-slate-50 text-slate-500" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN");
}

export default function StudentPrereqWaiversPage() {
  const [items, setItems] = useState<WaiverRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<WaiverRequest[]>("/students/prereq-waivers")
      .then((data) => setItems(data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const pending = items.filter((i) => i.status === "SUBMITTED").length;
  const approved = items.filter((i) => i.status === "APPROVED").length;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">学术申请</p>
        <h1 className="campus-title">先修豁免申请</h1>
        <p className="campus-subtitle">
          查看你提交的先修课豁免申请进度。如需新增申请，请在课程目录中点击相应课程提交。
        </p>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">加载中…</div>
      ) : items.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-sm font-medium text-slate-700">暂无申请记录</p>
          <p className="mt-1 text-xs text-slate-400">你还未提交过先修豁免申请。</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="campus-kpi">
              <p className="campus-kpi-label">申请总数</p>
              <p className="campus-kpi-value">{items.length}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">待审核</p>
              <p className="campus-kpi-value text-blue-600">{pending}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">已批准</p>
              <p className="campus-kpi-value text-emerald-600">{approved}</p>
            </div>
          </div>

          <div className="space-y-3">
            {items.map((req) => {
              const s = STATUS_STYLES[req.status] ?? { label: req.status, chip: "campus-chip" };
              return (
                <div key={req.id} className="campus-card p-5 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      {req.section ? (
                        <p className="font-semibold text-slate-900">
                          {req.section.course.code} — {req.section.course.title}
                        </p>
                      ) : (
                        <p className="font-semibold text-slate-900">课程已删除</p>
                      )}
                      {req.section && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          班级 {req.section.sectionCode}
                          {req.term ? ` · ${req.term.name}` : ""}
                        </p>
                      )}
                    </div>
                    <span className={`campus-chip ${s.chip}`}>{s.label}</span>
                  </div>
                  {req.reason ? (
                    <p className="text-sm text-slate-600 border-l-2 border-slate-200 pl-3">{req.reason}</p>
                  ) : null}
                  <p className="text-[11px] text-slate-400">
                    提交于 {fmt(req.submittedAt)}
                    {req.status !== "SUBMITTED" ? ` · 更新于 ${fmt(req.updatedAt)}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
