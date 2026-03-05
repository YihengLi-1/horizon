"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = {
  id: string;
  name: string;
};

type MeetingTime = {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
};

type Section = {
  id: string;
  sectionCode: string;
  credits: number;
  modality: string;
  meetingTimes: MeetingTime[];
  course: {
    code: string;
    title: string;
  };
};

const weekdayLabel = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function formatMeetingChip(meeting: MeetingTime): string {
  return `${weekdayLabel[meeting.weekday] ?? meeting.weekday} ${formatTime(meeting.startMinutes)}-${formatTime(
    meeting.endMinutes
  )}`;
}

function Alert({
  type,
  message,
  action
}: {
  type: "success" | "error" | "info";
  message: string;
  action?: ReactNode;
}) {
  const styles =
    type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : type === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{message}</span>
        {action ? <div>{action}</div> : null}
      </div>
    </div>
  );
}

export default function StudentCatalogPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [addingSectionId, setAddingSectionId] = useState("");

  const updateUrlTerm = (nextTermId: string) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("termId", nextTermId);
    window.history.replaceState({}, "", url.toString());
  };

  useEffect(() => {
    async function loadTerms() {
      try {
        setError("");
        const data = await apiFetch<Term[]>("/academics/terms");
        setTerms(data);
        const queryTermId =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("termId") ?? "" : "";
        const validQueryTermId = queryTermId && data.some((term) => term.id === queryTermId) ? queryTermId : "";
        const initialTermId = validQueryTermId || data[0]?.id || "";
        setTermId(initialTermId);
        if (initialTermId) {
          updateUrlTerm(initialTermId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load terms");
      }
    }

    void loadTerms();
  }, []);

  useEffect(() => {
    async function loadSections() {
      if (!termId) {
        setSections([]);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const data = await apiFetch<Section[]>(`/academics/sections?termId=${termId}`);
        setSections(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sections");
      } finally {
        setLoading(false);
      }
    }

    void loadSections();
  }, [termId]);

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sections;

    return sections.filter((section) => {
      const target = `${section.course.code} ${section.course.title} ${section.sectionCode}`.toLowerCase();
      return target.includes(q);
    });
  }, [sections, search]);

  const addToCart = async (sectionId: string) => {
    if (!termId) return;

    try {
      setNotice("");
      setError("");
      setAddingSectionId(sectionId);
      await apiFetch("/registration/cart", {
        method: "POST",
        body: JSON.stringify({ termId, sectionId })
      });
      setNotice("Added to cart.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add section to cart");
    } finally {
      setAddingSectionId("");
    }
  };

  const onTermChange = (nextTermId: string) => {
    setTermId(nextTermId);
    updateUrlTerm(nextTermId);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Course Catalog</h1>
          <p className="mt-1 text-sm text-slate-600">Browse sections by term and add classes to your registration cart.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/student/cart${termId ? `?termId=${termId}` : ""}`}
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            View cart
          </Link>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="grid gap-3 md:grid-cols-[260px_minmax(0,1fr)]">
          <label className="block">
            <span className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-slate-100 text-[10px]">T</span>
              Term
            </span>
            <select
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              value={termId}
              onChange={(event) => onTermChange(event.target.value)}
            >
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-slate-100 text-[10px]">S</span>
              Search
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">⌕</span>
              <input
                className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                placeholder="Course code, title, or section"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </label>
        </div>
      </section>

      {notice ? (
        <Alert
          type="success"
          message={notice}
          action={
            <Link className="font-medium underline underline-offset-2" href={`/student/cart?termId=${termId}`}>
              Open cart
            </Link>
          }
        />
      ) : null}

      {error ? <Alert type="error" message={error} /> : null}
      {!termId ? <Alert type="info" message="Select a term to view available sections." /> : null}

      <section className="space-y-4">
        {loading ? (
          <>
            {[1, 2, 3].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 w-48 rounded bg-slate-200" />
                  <div className="h-4 w-72 rounded bg-slate-100" />
                  <div className="flex gap-2">
                    <div className="h-6 w-24 rounded-full bg-slate-100" />
                    <div className="h-6 w-24 rounded-full bg-slate-100" />
                    <div className="h-6 w-24 rounded-full bg-slate-100" />
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : null}

        {!loading && filteredSections.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
            No sections found for this term.
          </div>
        ) : null}

        {!loading &&
          filteredSections.map((section) => (
            <div key={section.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{section.course.code}</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">{section.course.title}</h3>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      Section {section.sectionCode}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {section.credits} Credits
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {section.modality}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {section.meetingTimes.length > 0 ? (
                      section.meetingTimes.map((meeting, idx) => (
                        <span
                          key={`${section.id}-${idx}`}
                          className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700"
                        >
                          {formatMeetingChip(meeting)}
                        </span>
                      ))
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                        No meeting time
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex w-full shrink-0 justify-end sm:w-auto">
                  <button
                    type="button"
                    onClick={() => addToCart(section.id)}
                    disabled={addingSectionId === section.id}
                    className="inline-flex h-10 min-w-32 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {addingSectionId === section.id ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Adding...
                      </span>
                    ) : (
                      "Add to cart"
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
      </section>
    </div>
  );
}
