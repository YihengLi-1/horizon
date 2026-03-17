"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = { id: string; name: string };
type MeetingTime = { weekday: number; startMinutes: number; endMinutes: number };
type Enrollment = {
  id: string;
  status: string;
  section: {
    course: { code: string; title: string };
    meetingTimes: MeetingTime[];
  };
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const COLORS = ["#2563eb", "#7c3aed", "#0f766e", "#ea580c", "#be123c", "#0891b2"];

function hashColor(code: string) {
  return COLORS[Math.abs(code.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % COLORS.length];
}

export default function StudentScheduleImagePage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms").then((data) => {
      const nextTerms = data ?? [];
      setTerms(nextTerms);
      setTermId(nextTerms[0]?.id ?? "");
    });
  }, []);

  useEffect(() => {
    if (!termId) return;
    void apiFetch<Enrollment[]>(`/registration/schedule?termId=${termId}`).then((data) => setEnrollments(data ?? []));
  }, [termId]);

  const activeTerm = useMemo(() => terms.find((term) => term.id === termId) ?? null, [termId, terms]);

  function drawAndDownload() {
    const canvas = document.createElement("canvas");
    canvas.width = 1480;
    canvas.height = 980;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1e3a8a";
    ctx.font = "700 34px Inter, sans-serif";
    ctx.fillText("地平线大学课程表", 64, 64);
    ctx.fillStyle = "#64748b";
    ctx.font = "500 18px Inter, sans-serif";
    ctx.fillText(activeTerm?.name ?? "当前学期", 64, 96);

    const originX = 110;
    const originY = 150;
    const dayWidth = 180;
    const hourHeight = 52;
    for (let day = 0; day < 7; day += 1) {
      ctx.fillStyle = "#eff6ff";
      ctx.fillRect(originX + day * dayWidth, originY, dayWidth - 8, 42);
      ctx.fillStyle = "#334155";
      ctx.font = "600 16px Inter, sans-serif";
      ctx.fillText(DAYS[day], originX + day * dayWidth + 16, originY + 27);
    }
    for (let hour = 8; hour <= 20; hour += 1) {
      const y = originY + 54 + (hour - 8) * hourHeight;
      ctx.fillStyle = "#94a3b8";
      ctx.font = "500 14px Inter, sans-serif";
      ctx.fillText(`${String(hour).padStart(2, "0")}:00`, 40, y + 18);
      ctx.strokeStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(originX, y);
      ctx.lineTo(originX + dayWidth * 7 - 8, y);
      ctx.stroke();
    }

    enrollments
      .filter((item) => item.status !== "DROPPED")
      .forEach((enrollment) => {
        enrollment.section.meetingTimes.forEach((meeting) => {
          const dayIndex = meeting.weekday === 0 ? 6 : meeting.weekday - 1;
          const x = originX + dayIndex * dayWidth + 6;
          const startOffset = (meeting.startMinutes - 8 * 60) / 60;
          const endOffset = (meeting.endMinutes - 8 * 60) / 60;
          const y = originY + 54 + startOffset * hourHeight;
          const height = Math.max(36, (endOffset - startOffset) * hourHeight - 6);
          ctx.fillStyle = hashColor(enrollment.section.course.code);
          ctx.fillRect(x, y, dayWidth - 20, height);
          ctx.fillStyle = "#ffffff";
          ctx.font = "600 14px Inter, sans-serif";
          ctx.fillText(enrollment.section.course.code, x + 12, y + 22);
          ctx.font = "500 12px Inter, sans-serif";
          ctx.fillText(enrollment.section.course.title.slice(0, 18), x + 12, y + 42);
        });
      });

    const url = canvas.toDataURL("image/png");
    setPreviewUrl(url);
    const link = document.createElement("a");
    link.href = url;
    link.download = "schedule.png";
    link.click();
  }

  return (
    <div className="campus-page space-y-6">
      <section className="campus-hero">
        <p className="campus-eyebrow">Schedule Export</p>
        <h1 className="campus-title">一键生成课程表图片</h1>
        <p className="campus-subtitle">选择学期后生成 PNG 图片，适合发给同学、家长或保存到相册。</p>
      </section>

      <div className="campus-toolbar flex-wrap gap-3">
        <select className="campus-select max-w-xs" value={termId} onChange={(event) => setTermId(event.target.value)}>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>{term.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={drawAndDownload}
          disabled={!termId || enrollments.length === 0}
          className="inline-flex h-10 items-center rounded-lg border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50"
        >
          生成并下载 PNG
        </button>
      </div>

      <section className="campus-card p-5">
        <p className="text-sm font-semibold text-slate-900">当前将导出 {enrollments.length} 条课表记录</p>
        <p className="mt-2 text-sm text-slate-600">图片会按周一到周日的网格排布课程块，并使用课程色块区分不同课程。</p>
      </section>

      {previewUrl ? (
        <section className="campus-card p-5">
          <p className="mb-4 text-sm font-semibold text-slate-900">最近一次生成预览</p>
          <img src={previewUrl} alt="Schedule preview" className="w-full rounded-xl border border-slate-200" />
        </section>
      ) : null}
    </div>
  );
}
