"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { apiFetch } from "@/lib/api";

type Appeal = {
  id: string;
  status: string;
  contestedGrade: string;
  requestedGrade: string | null;
  reason: string;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  enrollment: {
    section: {
      course: { code: string; title: string };
      term: { name: string };
    };
  };
};

const STATUS_STYLES: Record<string, { label: string; chip: string }> = {
  PENDING: { label: "审核中", chip: "chip-blue" },
  APPROVED: { label: "已批准", chip: "chip-emerald" },
  REJECTED: { label: "已拒绝", chip: "chip-red" },
  WITHDRAWN: { label: "已撤回", chip: "border-slate-200 bg-slate-50 text-slate-500" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN");
}

function AppealsContent() {
  const searchParams = useSearchParams();
  const justSubmitted = searchParams.get("appeal") === "submitted";

  const [items, setItems] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<Appeal[]>("/students/appeals")
      .then((data) => setItems(data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const pending = items.filter((i) => i.status === "PENDING").length;

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">学籍申请</p>
        <h1 className="campus-title">成绩申诉记录</h1>
        <p className="campus-subtitle">查看你提交的成绩复核申请及审核结果。</p>
      </section>

      {justSubmitted ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          <p className="font-semibold">申诉已提交</p>
          <p className="mt-0.5 opacity-80">审核结果将通过通知中心告知，通常在 5–10 个工作日内完成。</p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">加载中…</div>
      ) : items.length === 0 ? (
        <div className="campus-card px-6 py-14 text-center">
          <p className="text-sm font-medium text-slate-700">暂无申诉记录</p>
          <p className="mt-1 text-xs text-slate-400">你还未提交过成绩申诉。</p>
          <Link
            href="/student/appeals/new"
            className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white no-underline hover:bg-slate-700"
          >
            提交新申诉
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="campus-kpi">
              <p className="campus-kpi-label">申诉总数</p>
              <p className="campus-kpi-value">{items.length}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">审核中</p>
              <p className="campus-kpi-value text-blue-600">{pending}</p>
            </div>
            <div className="campus-kpi">
              <p className="campus-kpi-label">已批准</p>
              <p className="campus-kpi-value text-emerald-600">
                {items.filter((i) => i.status === "APPROVED").length}
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Link
              href="/student/appeals/new"
              className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white no-underline hover:bg-slate-700"
            >
              提交新申诉 →
            </Link>
          </div>

          <div className="space-y-3">
            {items.map((appeal) => {
              const s = STATUS_STYLES[appeal.status] ?? { label: appeal.status, chip: "" };
              return (
                <div key={appeal.id} className="campus-card p-5 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {appeal.enrollment.section.course.code} —{" "}
                        {appeal.enrollment.section.course.title}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {appeal.enrollment.section.term.name}
                      </p>
                    </div>
                    <span className={`campus-chip ${s.chip}`}>{s.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="text-slate-600">
                      申诉成绩：<span className="font-semibold text-red-600">{appeal.contestedGrade}</span>
                    </span>
                    {appeal.requestedGrade ? (
                      <span className="text-slate-600">
                        期望成绩：<span className="font-semibold text-emerald-600">{appeal.requestedGrade}</span>
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-slate-600 border-l-2 border-slate-200 pl-3">{appeal.reason}</p>
                  {appeal.resolution ? (
                    <p className="text-sm text-slate-700 border-l-2 border-emerald-300 pl-3 bg-emerald-50 py-1 rounded-r">
                      审核意见：{appeal.resolution}
                    </p>
                  ) : null}
                  <p className="text-[11px] text-slate-400">
                    提交于 {fmt(appeal.createdAt)}
                    {appeal.status !== "PENDING" ? ` · 更新于 ${fmt(appeal.updatedAt)}` : ""}
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

export default function StudentAppealsPage() {
  return (
    <Suspense fallback={<div className="campus-page"><div className="campus-card px-6 py-14 text-center text-sm text-slate-500">加载中…</div></div>}>
      <AppealsContent />
    </Suspense>
  );
}
