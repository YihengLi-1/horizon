"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function StudentTagsPage() {
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiFetch<string[]>("/admin/student-tags/available")
      .then((data) => setTags(data ?? []))
      .catch(() => setTags([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Student Tags</p>
        <h1 className="campus-title">学生标签系统</h1>
        <p className="text-sm text-slate-600 md:text-base">
          查看系统内已使用的标签，并在学生详情抽屉中直接编辑每位学生的标签。
        </p>
      </section>

      <section className="campus-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">已使用标签</h2>
            <p className="text-sm text-slate-500">标签编辑入口位于学生列表的详情侧栏中。</p>
          </div>
          <span className="campus-chip chip-blue">{tags.length} tags</span>
        </div>

        {loading ? (
          <div className="mt-6 text-sm text-slate-500">加载中…</div>
        ) : tags.length === 0 ? (
          <div className="campus-empty mt-4">
            <div className="campus-empty-title">还没有学生标签</div>
            <div className="campus-empty-desc">前往学生页面，在详情侧栏里为学生添加第一批标签。</div>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag} className="campus-chip chip-purple">
                {tag}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
