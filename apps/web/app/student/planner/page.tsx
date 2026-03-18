"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ApiError, apiFetch } from "@/lib/api";

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

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function fmt(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function comboScore(combo: Section[]): number {
  const credits = combo.reduce((s, sec) => s + (sec.credits ?? 0), 0);
  const days = new Set(combo.flatMap((sec) => (sec.meetingTimes ?? []).map((m) => m.weekday))).size;
  // Penalize very early starts (<8am) or very late ends (>20:00)
  const earlyPenalty = combo.flatMap((sec) => sec.meetingTimes ?? []).filter((m) => m.startMinutes < 480).length;
  const latePenalty = combo.flatMap((sec) => sec.meetingTimes ?? []).filter((m) => m.endMinutes > 1200).length;
  // Lower score = better; prefer 15 credits, fewer days, no early/late
  return Math.abs(credits - 15) * 2 + days + earlyPenalty + latePenalty;
}

function creditLoadLabel(credits: number): { label: string; cls: string } {
  if (credits === 0) return { label: "", cls: "" };
  if (credits < 12) return { label: "兼读生负荷（<12学分）", cls: "border-amber-200 bg-amber-50 text-amber-700" };
  if (credits <= 18) return { label: "正常负荷（12-18学分）", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  return { label: "超载（>18学分）⚠️", cls: "border-red-200 bg-red-50 text-red-700" };
}

export default function PlannerPage() {
  const router = useRouter();
  const toast = useToast();
  const [termId, setTermId] = useState("");
  const [terms, setTerms] = useState<Term[]>([]);
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [basket, setBasket] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [combos, setCombos] = useState<Section[][]>([]);
  const [loading, setLoading] = useState(false);
  const [applyingComboIndex, setApplyingComboIndex] = useState<number | null>(null);
  const [appliedComboKey, setAppliedComboKey] = useState<string | null>(null);

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
    const raw = generateCombinations(courseOptions);
    // Sort by score (lower = better) and put recommended first
    setCombos([...raw].sort((a, b) => comboScore(a) - comboScore(b)));
  };

  const basketCredits = useMemo(() => {
    // sum up the minimum credits from any section of each basket course
    return basket.reduce((sum, code) => {
      const secs = allSections.filter((s) => s.course.code === code);
      const minCr = secs.length > 0 ? Math.min(...secs.map((s) => s.credits ?? 0)) : 0;
      return sum + minCr;
    }, 0);
  }, [basket, allSections]);

  const comboKey = (combo: Section[]) => combo.map((section) => section.id).join("|");

  const applyComboToCart = async (combo: Section[], comboIndex: number) => {
    if (!termId) return;
    const key = comboKey(combo);
    if (appliedComboKey === key) {
      router.push(`/student/cart?termId=${termId}`);
      return;
    }

    try {
      setApplyingComboIndex(comboIndex);
      let added = 0;
      const skipped: string[] = [];

      for (const section of combo) {
        try {
          await apiFetch("/registration/cart", {
            method: "POST",
            body: JSON.stringify({ termId, sectionId: section.id })
          });
          added += 1;
        } catch (err) {
          if (err instanceof ApiError && (err.code === "ALREADY_IN_CART" || err.code === "ALREADY_REGISTERED")) {
            skipped.push(`${section.course.code} §${section.sectionCode}`);
            continue;
          }
          throw err;
        }
      }

      if (added > 0) {
        toast.success(`已将 ${added} 门课加入购物车`);
      }
      if (skipped.length > 0) {
        toast.info(`已跳过 ${skipped.length} 门课程：${skipped.join("、")}`);
      }
      if (added === 0 && skipped.length === 0) {
        toast.info("该方案没有可加入购物车的课程");
      }
      setAppliedComboKey(key);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加入购物车失败");
    } finally {
      setApplyingComboIndex(null);
    }
  };

  return (
    <div className="campus-page space-y-5">
      <section className="campus-hero">
        <p className="campus-eyebrow">学业规划</p>
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
              basket.map((code) => {
                const secs = allSections.filter((s) => s.course.code === code);
                const cr = secs.length > 0 ? Math.min(...secs.map((s) => s.credits ?? 0)) : 0;
                return (
                  <div key={code} className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                    <div>
                      <span className="text-sm font-semibold text-blue-800">{code}</span>
                      {cr > 0 && <span className="ml-2 text-xs text-blue-500">{cr}学分</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setBasket((prev) => prev.filter((item) => item !== code)); setCombos([]); }}
                      className="text-blue-400 hover:text-red-500 text-lg leading-none"
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
            {basket.length > 0 && basketCredits > 0 && (() => {
              const load = creditLoadLabel(basketCredits);
              return load.label ? (
                <div className={`rounded-lg border px-3 py-2 text-xs font-medium ${load.cls}`}>
                  📊 预计学分：{basketCredits} — {load.label}
                </div>
              ) : null;
            })()}
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
                const isRecommended = idx === 0;
                const load = creditLoadLabel(totalCredits);
                const key = comboKey(combo);
                const isApplied = appliedComboKey === key;
                return (
                  <div key={idx} className={`campus-card p-4 space-y-3 ${isRecommended ? "ring-2 ring-indigo-400" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-700">方案 {idx + 1}</span>
                        {isRecommended && (
                          <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">⭐ 推荐</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="campus-chip border-slate-200 bg-slate-50 text-slate-600 text-xs">
                          {totalCredits} 学分 · {days.length} 天
                        </span>
                        <span className="campus-chip text-xs border-slate-200 bg-slate-50 text-slate-600">
                          {days.map((day) => WEEKDAY[day]).join("/")}
                        </span>
                        {load.label && (
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${load.cls}`}>
                            {load.label}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {combo.map((section) => (
                        <div key={section.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                          <span className="font-semibold text-slate-800">{section.course.code}</span>
                          <span className="text-slate-500">§{section.sectionCode}</span>
                          {section.credits != null && <span className="text-slate-400">{section.credits}cr</span>}
                          <span className="text-slate-500">{section.instructorName}</span>
                          <span className="ml-auto text-slate-400">
                            {(section.meetingTimes ?? [])
                              .map((meeting) => `${WEEKDAY[meeting.weekday]} ${fmt(meeting.startMinutes)}-${fmt(meeting.endMinutes)}`)
                              .join(" / ")}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end pt-1">
                      {isApplied ? (
                        <button
                          type="button"
                          onClick={() => router.push(`/student/cart?termId=${termId}`)}
                          className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700"
                        >
                          查看购物车 →
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void applyComboToCart(combo, idx)}
                          disabled={applyingComboIndex === idx}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[hsl(221_83%_43%)] bg-white px-4 text-sm font-semibold text-[hsl(221_83%_43%)] transition hover:bg-[hsl(221_83%_43%)] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {applyingComboIndex === idx ? (
                            <>
                              <span className="size-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />
                              加入中…
                            </>
                          ) : (
                            "将此方案加入购物车"
                          )}
                        </button>
                      )}
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
