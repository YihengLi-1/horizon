"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type MeetingTime = {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
};

type Term = {
  id: string;
  name: string;
};

type Section = {
  id: string;
  sectionCode: string;
  credits?: number;
  instructorName?: string;
  meetingTimes?: MeetingTime[];
  course: {
    code: string;
    title: string;
  };
};

function timeOverlap(a: MeetingTime[], b: MeetingTime[]): boolean {
  return a.some((m1) =>
    b.some(
      (m2) =>
        m1.weekday === m2.weekday &&
        m1.startMinutes < m2.endMinutes &&
        m2.startMinutes < m1.endMinutes
    )
  );
}

function generateCombinations(courseOptions: Section[][]): Section[][] {
  const results: Section[][] = [];

  function backtrack(idx: number, current: Section[]) {
    if (results.length >= 24) return;
    if (idx === courseOptions.length) {
      results.push([...current]);
      return;
    }

    for (const section of courseOptions[idx]) {
      const conflict = current.some((existing) =>
        timeOverlap(existing.meetingTimes ?? [], section.meetingTimes ?? [])
      );
      if (!conflict) {
        current.push(section);
        backtrack(idx + 1, current);
        current.pop();
      }
    }
  }

  backtrack(0, []);
  return results;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function fmt(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export default function PlannerPage() {
  const [termId, setTermId] = useState("");
  const [terms, setTerms] = useState<Term[]>([]);
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [basket, setBasket] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [combos, setCombos] = useState<Section[][]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void apiFetch<Term[]>("/academics/terms").then(setTerms).catch(() => setTerms([]));
  }, []);

  const uniqueCourseCodes = useMemo(
    () => [...new Set(allSections.map((section) => section.course.code))],
    [allSections]
  );

  const searchResults = useMemo(
    () =>
      uniqueCourseCodes
        .filter((code) => code.toLowerCase().includes(search.toLowerCase()) && !basket.includes(code))
        .slice(0, 10),
    [uniqueCourseCodes, search, basket]
  );

  const generate = () => {
    const courseOptions = basket.map((code) => allSections.filter((section) => section.course.code === code));
    setCombos(generateCombinations(courseOptions));
  };

  return (
    <div className="campus-page space-y-5">
      <section className="campus-hero">
        <p className="campus-eyebrow">Academic Planning</p>
        <h1 className="font-heading text-3xl font-bold text-slate-900">选课规划器</h1>
        <p className="mt-1 text-sm text-slate-600">选择最多 5 门课，自动生成所有无时间冲突的选课方案</p>
      </section>

      <div className="campus-toolbar">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">学期</span>
          <select
            className="campus-select"
            value={termId}
            onChange={async (event) => {
              const nextTermId = event.target.value;
              setTermId(nextTermId);
              setBasket([]);
              setCombos([]);
              setSearch("");
              if (!nextTermId) {
                setAllSections([]);
                return;
              }
              setLoading(true);
              const data = await apiFetch<Section[]>(`/academics/sections?termId=${nextTermId}`).catch(() => []);
              setAllSections(data);
              setLoading(false);
            }}
          >
            <option value="">选择学期</option>
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <div className="campus-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">搜索课程</h2>
            <input
              className="campus-input"
              placeholder="输入课程代码（如 CS101）"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={!termId || loading}
            />
            <ul className="space-y-1">
              {searchResults.map((code) => (
                <li key={code}>
                  <button
                    type="button"
                    disabled={basket.length >= 5}
                    onClick={() => {
                      setBasket((prev) => [...prev, code]);
                      setSearch("");
                    }}
                    className="w-full text-left rounded-lg px-3 py-2 text-sm hover:bg-slate-50 border border-slate-100 flex justify-between items-center disabled:opacity-40"
                  >
                    <span className="font-medium">{code}</span>
                    <span className="text-slate-400 text-xs">
                      {allSections.filter((section) => section.course.code === code).length} 个班级
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="campus-card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">计划篮 ({basket.length}/5)</h2>
            {basket.length === 0 ? (
              <p className="text-xs text-slate-400">在上方搜索并添加课程</p>
            ) : (
              basket.map((code) => (
                <div key={code} className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                  <span className="text-sm font-semibold text-blue-800">{code}</span>
                  <button
                    type="button"
                    onClick={() => setBasket((prev) => prev.filter((item) => item !== code))}
                    className="text-blue-400 hover:text-red-500 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
            {basket.length >= 2 ? (
              <button
                type="button"
                onClick={generate}
                className="w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition"
              >
                生成无冲突方案
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          {combos.length === 0 ? (
            <div className="campus-card p-8 text-center text-slate-400">
              <p className="text-3xl">📅</p>
              <p className="mt-2 text-sm">在左侧选择 2 门以上课程，点击「生成无冲突方案」</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500">找到 {combos.length} 个无冲突方案（最多显示24个）</p>
              {combos.map((combo, idx) => {
                const totalCredits = combo.reduce((sum, section) => sum + (section.credits ?? 0), 0);
                const days = [...new Set(combo.flatMap((section) => (section.meetingTimes ?? []).map((meeting) => meeting.weekday)))].sort();
                return (
                  <div key={idx} className="campus-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">方案 {idx + 1}</span>
                      <span className="campus-chip border-slate-200 bg-slate-50 text-slate-600 text-xs">
                        {totalCredits} 学分 · {days.map((day) => WEEKDAY[day]).join("/")} 上课
                      </span>
                    </div>
                    <div className="space-y-1">
                      {combo.map((section) => (
                        <div key={section.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                          <span className="font-semibold text-slate-800">{section.course.code}</span>
                          <span className="text-slate-500">§{section.sectionCode}</span>
                          <span className="text-slate-500">{section.instructorName}</span>
                          <span className="ml-auto text-slate-400">
                            {(section.meetingTimes ?? [])
                              .map((meeting) => `${WEEKDAY[meeting.weekday]} ${fmt(meeting.startMinutes)}-${fmt(meeting.endMinutes)}`)
                              .join(" / ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
