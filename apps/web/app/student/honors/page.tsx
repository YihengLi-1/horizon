"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Honor = {
  type: string;
  termName: string;
  awardedAt: string;
};

type HonorsResponse = {
  honors: Honor[];
  summary: string;
};

function MedalIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-12" fill="none">
      <path d="M15 4h7l2 10-7 6-6-6 4-10Z" fill="#4f46e5" />
      <path d="M26 4h7l4 10-6 6-7-6 2-10Z" fill="#7c3aed" />
      <circle cx="24" cy="28" r="12" fill="#f59e0b" />
      <path d="m24 20 2.47 5 5.53.8-4 3.9.94 5.5L24 32.6l-4.94 2.6.94-5.5-4-3.9 5.53-.8L24 20Z" fill="white" />
    </svg>
  );
}

export default function StudentHonorsPage() {
  const [data, setData] = useState<HonorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch<HonorsResponse>("/students/honors")
      .then((payload) => setData(payload))
      .catch((err) => setError(err instanceof Error ? err.message : "加载荣誉榜失败"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Recognition</p>
        <h1 className="campus-title">我的荣誉榜</h1>
        <p className="campus-subtitle">查看学期荣誉与累计成就，作为本阶段学业表现的正式记录。</p>
      </section>

      {error ? <div className="campus-card border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {loading ? (
        <div className="campus-card px-6 py-14 text-center text-sm text-slate-500">加载中…</div>
      ) : !data || data.honors.length === 0 ? (
        <div className="campus-card campus-empty">
          <div className="campus-empty-icon"><MedalIcon /></div>
          <div className="campus-empty-title">继续努力，荣誉即将到来</div>
          <div className="campus-empty-desc">保持稳定成绩和完整修课记录，这里会逐步点亮属于你的学术勋章。</div>
        </div>
      ) : (
        <>
          <div className="campus-card px-5 py-4 text-sm text-slate-600">{data.summary}</div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.honors.map((honor) => (
              <div key={`${honor.type}-${honor.termName}`} className="campus-card flex items-start gap-4 p-5">
                <div className="rounded-2xl bg-[hsl(262_70%_95%)] p-3 text-[hsl(262_55%_35%)]">
                  <MedalIcon />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-slate-900">{honor.type}</p>
                  <p className="mt-1 text-sm text-slate-500">{honor.termName}</p>
                  <p className="mt-2 text-xs text-slate-400">{new Date(honor.awardedAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
