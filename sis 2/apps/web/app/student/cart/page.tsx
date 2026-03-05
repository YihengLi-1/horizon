"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Term = {
  id: string;
  name: string;
};

type CartItem = {
  id: string;
  section: {
    id: string;
    sectionCode: string;
    credits: number;
    requireApproval: boolean;
    course: {
      code: string;
      title: string;
    };
  };
};

type SubmitResult = {
  id: string;
  status: string;
  section: {
    sectionCode: string;
    course?: {
      code: string;
      title: string;
    };
  };
};

const statusOrder = ["ENROLLED", "PENDING_APPROVAL", "WAITLISTED"];

function statusBadgeClass(status: string): string {
  if (status === "ENROLLED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "WAITLISTED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "PENDING_APPROVAL") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function Alert({ type, message }: { type: "success" | "error" | "info"; message: string }) {
  const styles =
    type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : type === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{message}</div>;
}

export default function StudentCartPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [submitResults, setSubmitResults] = useState<SubmitResult[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const activeTerm = useMemo(() => terms.find((t) => t.id === termId), [terms, termId]);

  const groupedResults = useMemo(() => {
    const map = new Map<string, SubmitResult[]>();
    for (const result of submitResults) {
      const list = map.get(result.status) ?? [];
      list.push(result);
      map.set(result.status, list);
    }

    const orderedStatuses = [
      ...statusOrder.filter((status) => map.has(status)),
      ...Array.from(map.keys()).filter((status) => !statusOrder.includes(status))
    ];

    return orderedStatuses.map((status) => ({ status, items: map.get(status) ?? [] }));
  }, [submitResults]);

  const updateUrlTerm = (nextTermId: string) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("termId", nextTermId);
    window.history.replaceState({}, "", url.toString());
  };

  const loadCart = async (selectedTermId: string) => {
    if (!selectedTermId) {
      setItems([]);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const data = await apiFetch<CartItem[]>(`/registration/cart?termId=${selectedTermId}`);
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cart");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    async function loadTermsAndCart() {
      try {
        setError("");
        const termData = await apiFetch<Term[]>("/academics/terms");
        setTerms(termData);

        const queryTermId =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("termId") ?? "" : "";

        const validQueryTermId = queryTermId && termData.some((term) => term.id === queryTermId) ? queryTermId : "";
        const fallbackTermId = termData[0]?.id ?? "";
        const initialTermId = validQueryTermId || fallbackTermId;

        setTermId(initialTermId);

        if (initialTermId) {
          updateUrlTerm(initialTermId);
          await loadCart(initialTermId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load terms");
      }
    }

    void loadTermsAndCart();
  }, []);

  const onTermChange = async (nextTermId: string) => {
    setTermId(nextTermId);
    setMessage("");
    setSubmitResults([]);
    updateUrlTerm(nextTermId);
    await loadCart(nextTermId);
  };

  const removeItem = async (cartItemId: string) => {
    try {
      setError("");
      await apiFetch(`/registration/cart/${cartItemId}`, { method: "DELETE" });
      await loadCart(termId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove item");
    }
  };

  const submit = async () => {
    if (!termId) return;

    try {
      setSubmitting(true);
      setError("");
      setMessage("");
      const result = await apiFetch<SubmitResult[]>("/registration/submit", {
        method: "POST",
        body: JSON.stringify({ termId })
      });

      setSubmitResults(result);
      setMessage(`Submitted ${result.length} item(s).`);
      await loadCart(termId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Registration Cart</h1>
          <p className="mt-1 text-sm text-slate-600">
            Review your selected sections for {activeTerm ? activeTerm.name : "the selected term"} and submit when ready.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/student/catalog${termId ? `?termId=${termId}` : ""}`}
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Back to catalog
          </Link>
          <button
            type="button"
            onClick={submit}
            disabled={!termId || items.length === 0 || submitting}
            className="inline-flex h-10 min-w-28 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Submitting
              </>
            ) : (
              "Submit"
            )}
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="grid gap-3 md:grid-cols-[260px_minmax(0,1fr)] md:items-end">
          <label className="block">
            <span className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-slate-100 text-[10px]">T</span>
              Term
            </span>
            <select
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              value={termId}
              onChange={(event) => void onTermChange(event.target.value)}
            >
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {items.length} item{items.length === 1 ? "" : "s"} in cart
          </div>
        </div>
      </section>

      {message ? <Alert type="success" message={message} /> : null}
      {error ? <Alert type="error" message={error} /> : null}
      {!loading && items.length === 0 ? <Alert type="info" message="Your cart is empty. Add sections from catalog." /> : null}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="max-h-[460px] overflow-auto rounded-2xl">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700">Course</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Section</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Credits</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Approval</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? [1, 2, 3].map((row) => (
                    <tr key={row} className="border-b border-slate-100">
                      <td className="px-4 py-3" colSpan={5}>
                        <div className="animate-pulse space-y-2">
                          <div className="h-4 w-1/3 rounded bg-slate-200" />
                          <div className="h-4 w-1/2 rounded bg-slate-100" />
                        </div>
                      </td>
                    </tr>
                  ))
                : null}

              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Cart is empty.
                  </td>
                </tr>
              ) : null}

              {!loading &&
                items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/60">
                    <td className="px-4 py-3 text-slate-800">
                      {item.section.course.code} - {item.section.course.title}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.section.sectionCode}</td>
                    <td className="px-4 py-3 text-slate-700">{item.section.credits}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                          item.section.requireApproval
                            ? "border-blue-200 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      >
                        {item.section.requireApproval ? "Required" : "Not required"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void removeItem(item.id)}
                        className="inline-flex h-10 items-center rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-700 transition hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {groupedResults.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <h2 className="text-base font-semibold text-slate-900">Submission Results</h2>
          <div className="mt-3 space-y-3">
            {groupedResults.map((group) => (
              <div key={group.status} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(group.status)}`}>
                    {group.status}
                  </span>
                  <span className="text-xs text-slate-500">{group.items.length} item(s)</span>
                </div>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                    >
                      {(item.section.course?.code ? `${item.section.course.code} ` : "") + item.section.sectionCode}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
