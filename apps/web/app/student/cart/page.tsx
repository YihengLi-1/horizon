"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { RegistrationStepper } from "@/components/registration-stepper";
import { useToast } from "@/components/Toast";
import { ApiError, apiFetch } from "@/lib/api";
import { enrollmentStatusLabel, reasonCodeLabel } from "@/lib/labels";

type Term = {
  id: string;
  name: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  maxCredits: number;
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

type SubmitIssue = {
  sectionId: string;
  sectionCode: string;
  courseCode: string;
  reasonCode: string;
  message: string;
};

type PrecheckPreviewItem = {
  sectionId: string;
  sectionCode: string;
  courseCode: string;
  status: string;
  waitlistPosition: number | null;
};

type PrecheckResponse = {
  termId: string;
  cartCount: number;
  ok: boolean;
  preview: PrecheckPreviewItem[];
  issues: SubmitIssue[];
};

type NextAction = {
  title: string;
  detail: string;
  tone: "slate" | "amber" | "red" | "emerald";
  buttonLabel?: string;
  buttonTone?: "primary" | "neutral" | "danger";
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
};

const statusOrder = ["ENROLLED", "PENDING_APPROVAL", "WAITLISTED"];

function statusBadgeClass(status: string): string {
  if (status === "ENROLLED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "WAITLISTED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "PENDING_APPROVAL") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function issueHint(reasonCode: string): string | null {
  if (reasonCode === "SECTION_ALREADY_STARTED") return "Section already started. Contact advisor/registrar for support.";
  if (reasonCode === "PREREQUISITE_NOT_MET") return "Complete prerequisite course(s) first or request departmental override.";
  if (reasonCode === "TIME_CONFLICT") return "Remove or swap one of the conflicting sections.";
  if (reasonCode === "CREDIT_LIMIT_EXCEEDED") return "Reduce planned credits or request an overload approval.";
  if (reasonCode === "ALREADY_REGISTERED") return "This section is already active in your enrollments.";
  return null;
}

function creditBarClass(used: number, max: number): string {
  if (max <= 0) return "bg-emerald-400";
  const pct = used / max;
  if (pct >= 1) return "bg-red-500";
  if (pct >= 0.85) return "bg-amber-400";
  return "bg-emerald-400";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function buildIssueToastMessage(issues: SubmitIssue[], maxCredits?: number | null): string {
  if (issues.some((issue) => issue.reasonCode === "TIME_CONFLICT")) {
    return "时间冲突：有课程时间重叠，无法提交";
  }
  if (issues.some((issue) => issue.reasonCode === "CREDIT_LIMIT_EXCEEDED")) {
    return maxCredits
      ? `学分上限已达，本学期最多可修 ${maxCredits} 学分`
      : "学分上限已达，无法提交当前购物车";
  }
  if (issues.some((issue) => issue.reasonCode === "PREREQUISITE_NOT_MET")) {
    return "先修课未满足，请先完成前置课程";
  }
  return "Some sections could not be submitted.";
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
  const [submitIssues, setSubmitIssues] = useState<SubmitIssue[]>([]);
  const [precheckPreview, setPrecheckPreview] = useState<PrecheckPreviewItem[]>([]);
  const [precheckIssues, setPrecheckIssues] = useState<SubmitIssue[]>([]);
  const [precheckError, setPrecheckError] = useState("");
  const [prechecking, setPrechecking] = useState(false);
  const [precheckRan, setPrecheckRan] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [removingInvalid, setRemovingInvalid] = useState(false);
  const [removingItemId, setRemovingItemId] = useState("");
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  const toast = useToast();

  const activeTerm = useMemo(() => terms.find((t) => t.id === termId), [terms, termId]);
  const cartItemIdBySectionId = useMemo(
    () => new Map(items.map((item) => [item.section.id, item.id])),
    [items]
  );
  const registrationWindow = useMemo(() => {
    if (!activeTerm) {
      return { isOpen: false, message: "" };
    }
    const now = Date.now();
    const openAt = new Date(activeTerm.registrationOpenAt).getTime();
    const closeAt = new Date(activeTerm.registrationCloseAt).getTime();
    if (now < openAt) {
      return {
        isOpen: false,
        message: `Registration opens on ${formatDateTime(activeTerm.registrationOpenAt)}.`
      };
    }
    if (now > closeAt) {
      return {
        isOpen: false,
        message: `Registration closed on ${formatDateTime(activeTerm.registrationCloseAt)}.`
      };
    }
    return { isOpen: true, message: "" };
  }, [activeTerm]);

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

  const groupedIssues = useMemo(() => {
    const map = new Map<string, SubmitIssue[]>();
    for (const issue of submitIssues) {
      const key = `${issue.courseCode}::${issue.sectionCode}`;
      const list = map.get(key) ?? [];
      list.push(issue);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, issues]) => {
      const [courseCode, sectionCode] = key.split("::");
      return { key, courseCode, sectionCode, issues };
    });
  }, [submitIssues]);

  const summaryIssues = useMemo(() => {
    const source = submitIssues.length > 0 ? submitIssues : precheckIssues;
    const seen = new Set<string>();
    const rows: Array<{ key: string; sectionId: string; label: string; message: string; reasonCode: string }> = [];
    for (const issue of source) {
      const key = `${issue.courseCode}::${issue.sectionCode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        key,
        sectionId: issue.sectionId,
        label: `${issue.courseCode} §${issue.sectionCode}`,
        message: issue.message,
        reasonCode: issue.reasonCode
      });
    }
    return rows;
  }, [submitIssues, precheckIssues]);

  const groupedPrecheckIssues = useMemo(() => {
    const map = new Map<string, SubmitIssue[]>();
    for (const issue of precheckIssues) {
      const key = `${issue.courseCode}::${issue.sectionCode}`;
      const list = map.get(key) ?? [];
      list.push(issue);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([key, issues]) => {
      const [courseCode, sectionCode] = key.split("::");
      return { key, courseCode, sectionCode, issues };
    });
  }, [precheckIssues]);

  useEffect(() => {
    if (summaryIssues.length === 0) return;
    if (!errorSummaryRef.current) return;
    errorSummaryRef.current.focus();
    errorSummaryRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [summaryIssues]);

  const groupedPreview = useMemo(() => {
    const map = new Map<string, PrecheckPreviewItem[]>();
    for (const item of precheckPreview) {
      const list = map.get(item.status) ?? [];
      list.push(item);
      map.set(item.status, list);
    }
    const orderedStatuses = [
      ...statusOrder.filter((status) => map.has(status)),
      ...Array.from(map.keys()).filter((status) => !statusOrder.includes(status))
    ];
    return orderedStatuses.map((status) => ({ status, items: map.get(status) ?? [] }));
  }, [precheckPreview]);

  const cartMetrics = useMemo(() => {
    const totalCredits = items.reduce((sum, item) => sum + item.section.credits, 0);
    const approvalCount = items.filter((item) => item.section.requireApproval).length;
    const maxCredits = activeTerm?.maxCredits ?? null;
    const overLimit = maxCredits !== null && totalCredits > maxCredits;
    return { totalCredits, approvalCount, maxCredits, overLimit };
  }, [items, activeTerm]);

  const activeIssues = useMemo(
    () => (submitIssues.length > 0 ? submitIssues : precheckIssues),
    [submitIssues, precheckIssues]
  );

  const issueMapBySectionId = useMemo(() => {
    const map = new Map<string, SubmitIssue[]>();
    for (const issue of activeIssues) {
      const list = map.get(issue.sectionId) ?? [];
      list.push(issue);
      map.set(issue.sectionId, list);
    }
    return map;
  }, [activeIssues]);

  const invalidCartItemIds = useMemo(
    () => items.filter((item) => issueMapBySectionId.has(item.section.id)).map((item) => item.id),
    [items, issueMapBySectionId]
  );

  const reasonCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const issue of activeIssues) {
      map.set(issue.reasonCode, (map.get(issue.reasonCode) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [activeIssues]);

  const hasBlockingIssues = precheckRan && (precheckIssues.length > 0 || Boolean(precheckError));
  const precheckDisabled = !termId || items.length === 0 || prechecking || submitting || !registrationWindow.isOpen;
  const precheckDisabledReason = useMemo(() => {
    if (!termId) return "Select a term first.";
    if (!registrationWindow.isOpen) return registrationWindow.message || "Registration window is currently closed.";
    if (items.length === 0) return "Add at least one section before running precheck.";
    if (submitting) return "Wait for the current submission to finish.";
    return "";
  }, [termId, registrationWindow.isOpen, registrationWindow.message, items.length, submitting]);
  const submitDisabled =
    !termId || items.length === 0 || submitting || !registrationWindow.isOpen || hasBlockingIssues;
  const submitDisabledReason = useMemo(() => {
    if (!termId) return "Select a term first.";
    if (!registrationWindow.isOpen) return registrationWindow.message || "Registration window is currently closed.";
    if (items.length === 0) return "Add at least one section before submitting.";
    if (!precheckRan) return "Run precheck before submitting.";
    if (hasBlockingIssues) return "Resolve precheck issues or remove invalid rows first.";
    return "";
  }, [termId, registrationWindow.isOpen, registrationWindow.message, items.length, precheckRan, hasBlockingIssues]);

  const readinessChecks = useMemo(
    () => [
      { label: "Term selected", ok: Boolean(termId) },
      { label: "Registration window open", ok: registrationWindow.isOpen },
      { label: "Cart has items", ok: items.length > 0 },
      {
        label: "Precheck has no blocking issues",
        ok: precheckRan ? !hasBlockingIssues : false,
        hint: precheckRan ? "" : "Run precheck"
      }
    ],
    [termId, registrationWindow.isOpen, items.length, precheckRan, hasBlockingIssues]
  );

  const updateUrlTerm = (nextTermId: string) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (nextTermId) url.searchParams.set("termId", nextTermId);
    else url.searchParams.delete("termId");
    window.history.replaceState({}, "", url.toString());
  };

  const resetPrecheck = () => {
    setPrecheckRan(false);
    setPrecheckError("");
    setPrecheckIssues([]);
    setPrecheckPreview([]);
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
    setSubmitIssues([]);
    resetPrecheck();
    updateUrlTerm(nextTermId);
    await loadCart(nextTermId);
  };

  const removeItem = async (cartItemId: string) => {
    try {
      setError("");
      setRemovingItemId(cartItemId);
      resetPrecheck();
      await apiFetch(`/registration/cart/${cartItemId}`, { method: "DELETE" });
      await loadCart(termId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove item");
    } finally {
      setRemovingItemId("");
    }
  };

  const removeInvalidItems = async () => {
    if (!termId || invalidCartItemIds.length === 0) return;

    try {
      setRemovingInvalid(true);
      setError("");
      setMessage("");
      for (const cartItemId of invalidCartItemIds) {
        await apiFetch(`/registration/cart/${cartItemId}`, { method: "DELETE" });
      }
      resetPrecheck();
      setSubmitIssues([]);
      setMessage(`Removed ${invalidCartItemIds.length} invalid item(s) from cart.`);
      toast(`Removed ${invalidCartItemIds.length} invalid item(s).`, "success");
      await loadCart(termId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove invalid items");
      toast("Failed to remove invalid items.", "error");
    } finally {
      setRemovingInvalid(false);
    }
  };

  const runPrecheck = async () => {
    if (!termId || items.length === 0) return;

    try {
      setPrechecking(true);
      setPrecheckError("");
      setError("");
      setPrecheckRan(false);
      const result = await apiFetch<PrecheckResponse>("/registration/precheck", {
        method: "POST",
        body: JSON.stringify({ termId })
      });
      setPrecheckPreview(result.preview);
      setPrecheckIssues(result.issues);
      setPrecheckRan(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === "SUBMIT_VALIDATION_FAILED" && Array.isArray(err.details)) {
        const issues = err.details as SubmitIssue[];
        setPrecheckIssues(issues);
        setPrecheckError("Precheck found blocking issues.");
        toast(buildIssueToastMessage(issues, activeTerm?.maxCredits ?? null), "error");
      } else {
        const message = err instanceof Error ? err.message : "Precheck failed";
        setPrecheckError(message);
        toast(message, "error");
        setPrecheckIssues([]);
      }
      setPrecheckPreview([]);
      setPrecheckRan(true);
    } finally {
      setPrechecking(false);
    }
  };

  const submit = async () => {
    if (!termId) return;

    try {
      setSubmitting(true);
      setError("");
      setMessage("");
      setSubmitIssues([]);
      setPrecheckError("");
      const result = await apiFetch<SubmitResult[]>("/registration/submit", {
        method: "POST",
        body: JSON.stringify({ termId })
      });

      setSubmitResults(result);
      setMessage(`Submitted ${result.length} item(s).`);
      toast(`Submitted ${result.length} item(s).`, "success");
      resetPrecheck();
      await loadCart(termId);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.code === "SUBMIT_VALIDATION_FAILED" &&
        Array.isArray(err.details)
      ) {
        const issues = err.details as SubmitIssue[];
        setSubmitIssues(issues);
        setError("Some sections could not be submitted. See reasons below.");
        toast(buildIssueToastMessage(issues, activeTerm?.maxCredits ?? null), "error");
      } else {
        const message = err instanceof Error ? err.message : "Submit failed";
        setError(message);
        toast(message, "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const catalogHref = `/student/catalog${termId ? `?termId=${termId}` : ""}`;
  const issueAnchorHref =
    summaryIssues.length > 0 ? "#cart-issue-summary" : groupedPrecheckIssues.length > 0 ? "#precheck-issues" : "";
  const nextAction: NextAction = (() => {
    if (terms.length === 0 || !termId) {
      return {
        title: "Select a term",
        detail: "Choose an active term first. Cart and submit actions unlock after term selection.",
        tone: "slate"
      };
    }
    if (items.length === 0) {
      return {
        title: "Add courses to cart",
        detail: "Your cart is empty. Start from catalog and add at least one section.",
        tone: "slate",
        buttonLabel: "Browse Catalog",
        buttonTone: "neutral",
        href: catalogHref
      };
    }
    if (!registrationWindow.isOpen) {
      return {
        title: "Registration window is closed",
        detail: registrationWindow.message || "Registration actions are currently unavailable.",
        tone: "amber"
      };
    }
    if (!precheckRan) {
      return {
        title: "Run precheck first",
        detail: "Precheck catches prerequisites, time conflicts, and credit limits before submit.",
        tone: "slate",
        buttonLabel: prechecking ? "Checking" : "Run Precheck",
        buttonTone: "primary",
        onClick: () => void runPrecheck(),
        disabled: precheckDisabled || prechecking
      };
    }
    if (hasBlockingIssues) {
      if (invalidCartItemIds.length > 0) {
        return {
          title: "Clean invalid rows",
          detail: `${invalidCartItemIds.length} item(s) currently fail precheck and can be removed in one click.`,
          tone: "red",
          buttonLabel: removingInvalid ? "Cleaning" : "Remove Invalid Rows",
          buttonTone: "danger",
          onClick: () => void removeInvalidItems(),
          disabled: removingInvalid || submitting
        };
      }
      return {
        title: "Resolve precheck issues",
        detail: "Review issue cards below, adjust sections, then rerun precheck.",
        tone: "red",
        ...(issueAnchorHref
          ? {
              buttonLabel: "Review Issues",
              buttonTone: "neutral" as const,
              href: issueAnchorHref
            }
          : {})
      };
    }
    return {
      title: "Ready to submit",
      detail: "Precheck passed. You can submit this cart now.",
      tone: "emerald",
      buttonLabel: submitting ? "Submitting" : "Submit",
      buttonTone: "primary",
      onClick: () => void submit(),
      disabled: submitDisabled || submitting
    };
  })();

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Registration Workflow</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-[2.65rem]">Registration Cart</h1>
            <p className="text-sm text-slate-600 md:text-base">
              Review selections for {activeTerm ? activeTerm.name : "the selected term"}, run precheck, and submit safely.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{items.length} item(s)</span>
              <span className={`campus-chip ${cartMetrics.overLimit ? "border-red-300 bg-red-50 text-red-700" : "border-slate-300 bg-slate-50 text-slate-700"}`}>
                {cartMetrics.totalCredits}{cartMetrics.maxCredits !== null ? ` / ${cartMetrics.maxCredits}` : ""} credits
                {cartMetrics.overLimit ? " ⚠" : ""}
              </span>
              {cartMetrics.approvalCount > 0 ? (
                <span className="campus-chip border-blue-200 bg-blue-50 text-blue-700">{cartMetrics.approvalCount} need approval</span>
              ) : null}
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <Link
              href={`/student/catalog${termId ? `?termId=${termId}` : ""}`}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 no-underline shadow-sm transition hover:bg-slate-50 sm:w-auto"
            >
              Back to catalog
            </Link>
            <button
              type="button"
              onClick={runPrecheck}
              disabled={precheckDisabled}
              title={precheckDisabledReason || undefined}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-28 sm:w-auto"
            >
              {prechecking ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                  Checking…
                </>
              ) : precheckRan && !hasBlockingIssues && precheckPreview.length > 0 ? (
                "✓ Precheck passed"
              ) : (
                "Run Precheck"
              )}
            </button>
            {invalidCartItemIds.length > 0 ? (
              <button
                type="button"
                onClick={removeInvalidItems}
                disabled={removingInvalid || submitting}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-red-200/80 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-32 sm:w-auto"
              >
                {removingInvalid ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-red-200 border-t-red-700" />
                    Cleaning…
                  </>
                ) : (
                  <>Remove invalid ({invalidCartItemIds.length})</>
                )}
              </button>
            ) : null}
            <button
              type="button"
              onClick={submit}
              disabled={submitDisabled}
              aria-disabled={submitDisabled}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-28 sm:w-auto"
            >
              {submitting ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-white" />
                  Submitting…
                </>
              ) : (
                "Submit"
              )}
            </button>
            {submitDisabledReason ? (
              <p className="w-full text-xs text-slate-600 sm:text-right">{submitDisabledReason}</p>
            ) : null}
            {!prechecking && precheckDisabledReason ? (
              <p className="w-full text-xs text-slate-600 sm:text-right">Precheck: {precheckDisabledReason}</p>
            ) : null}
          </div>
        </div>
      </section>

      <RegistrationStepper
        current={groupedResults.length > 0 ? "submit" : "cart"}
        termId={termId}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="campus-kpi border-slate-200 bg-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cart Items</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{items.length}</p>
        </div>
        <div className={`campus-kpi ${cartMetrics.overLimit ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${cartMetrics.overLimit ? "text-red-700" : "text-slate-500"}`}>
            Planned Credits
          </p>
          <p className={`mt-1 text-2xl font-semibold ${cartMetrics.overLimit ? "text-red-900" : "text-slate-900"}`}>
            {cartMetrics.totalCredits}{cartMetrics.maxCredits !== null ? ` / ${cartMetrics.maxCredits}` : ""}
          </p>
          {cartMetrics.overLimit ? (
            <p className="mt-0.5 text-xs font-medium text-red-700">Over credit limit</p>
          ) : cartMetrics.maxCredits !== null ? (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full transition-all ${creditBarClass(cartMetrics.totalCredits, cartMetrics.maxCredits)}`}
                style={{ width: `${Math.min(100, (cartMetrics.totalCredits / cartMetrics.maxCredits) * 100)}%` }}
              />
            </div>
          ) : null}
        </div>
        <div className="campus-kpi border-blue-200 bg-blue-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Approval Required</p>
          <p className="mt-1 text-2xl font-semibold text-blue-900">{cartMetrics.approvalCount}</p>
          {cartMetrics.approvalCount > 0 ? (
            <p className="mt-0.5 text-xs text-blue-600">Awaiting admin action</p>
          ) : (
            <p className="mt-0.5 text-xs text-blue-500">No approvals needed</p>
          )}
        </div>
        <div className={`campus-kpi ${invalidCartItemIds.length > 0 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${invalidCartItemIds.length > 0 ? "text-red-700" : "text-emerald-700"}`}>
            Issue Rows
          </p>
          <p className={`mt-1 text-2xl font-semibold ${invalidCartItemIds.length > 0 ? "text-red-900" : "text-emerald-900"}`}>
            {invalidCartItemIds.length}
          </p>
          {invalidCartItemIds.length > 0 ? (
            <p className="mt-0.5 text-xs font-medium text-red-600">Run precheck to review</p>
          ) : precheckRan ? (
            <p className="mt-0.5 text-xs font-medium text-emerald-600">All clear ✓</p>
          ) : null}
        </div>
      </section>

      <section className="campus-toolbar">
        <div className="grid gap-3 md:grid-cols-[260px_minmax(0,1fr)] md:items-end">
          <label className="block">
            <span className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-slate-100 text-[10px]">T</span>
              Term
            </span>
            <select
              className="campus-select"
              value={termId}
              onChange={(event) => void onTermChange(event.target.value)}
              disabled={terms.length === 0}
            >
              {terms.length === 0 ? <option value="">No active terms</option> : null}
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

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="campus-card p-4">
          <h2 className="text-sm font-semibold text-slate-900">Status Guide</h2>
          <div className="mt-2 grid gap-2">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <span className="font-semibold">{enrollmentStatusLabel("ENROLLED")}:</span> Seat confirmed after submit.
            </p>
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <span className="font-semibold">Pending Approval:</span> Awaiting department/admin action.
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="font-semibold">Waitlisted:</span> Added to queue when capacity is full.
            </p>
          </div>
        </section>

        <section className="campus-card p-4">
          <h2 className="text-sm font-semibold text-slate-900">Submit Readiness</h2>
          <div className="mt-2 grid gap-2">
            {readinessChecks.map((check) => (
              <div
                key={check.label}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                  check.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${check.ok ? "bg-emerald-500 text-white" : "border border-slate-300 bg-white text-slate-400"}`}>
                    {check.ok ? "✓" : "·"}
                  </span>
                  {check.label}
                </span>
                <span className={`text-xs font-semibold ${check.ok ? "text-emerald-700" : "text-slate-500"}`}>
                  {check.ok ? "Ready" : check.hint ?? "Pending"}
                </span>
              </div>
            ))}
          </div>
          {!precheckRan && items.length > 0 ? (
            <p className="mt-2 text-xs text-slate-600">
              Run precheck before submit to catch conflicts and prerequisites first.
            </p>
          ) : null}
          {hasBlockingIssues ? (
            <p className="mt-2 text-xs font-medium text-red-700">
              Precheck found blocking issues. Resolve or remove invalid rows before submitting.
            </p>
          ) : null}
        </section>

        <section className="campus-card p-4 lg:col-span-2" aria-live="polite">
          <h2 className="text-sm font-semibold text-slate-900">Next Step</h2>
          <div
            className={`mt-2 rounded-lg border px-3 py-3 text-sm ${
              nextAction.tone === "emerald"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : nextAction.tone === "amber"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : nextAction.tone === "red"
                    ? "border-red-200 bg-red-50 text-red-900"
                    : "border-slate-200 bg-slate-50 text-slate-800"
            }`}
          >
            <p className="font-semibold">{nextAction.title}</p>
            <p className="mt-1 text-xs">{nextAction.detail}</p>
            {nextAction.buttonLabel ? (
              nextAction.href ? (
                <Link
                  href={nextAction.href}
                  className="mt-3 inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 no-underline transition hover:bg-slate-50"
                >
                  {nextAction.buttonLabel}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={nextAction.onClick}
                  disabled={nextAction.disabled}
                  className={`mt-3 inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    nextAction.buttonTone === "danger"
                      ? "border border-red-200 bg-white text-red-700 hover:bg-red-50"
                      : nextAction.buttonTone === "neutral"
                        ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                  }`}
                >
                  {nextAction.buttonLabel}
                </button>
              )
            ) : null}
          </div>
        </section>
      </section>

      <div aria-live="polite" className="space-y-3">
        {message ? <Alert type="success" message={message} /> : null}
        {error ? <Alert type="error" message={error} /> : null}
        {precheckError ? <Alert type="error" message={precheckError} /> : null}
      </div>
      {terms.length === 0 ? (
        <Alert
          type="info"
          message="No active term is available yet. Registration cart is disabled until a term is published."
        />
      ) : null}
      {!registrationWindow.isOpen && registrationWindow.message ? <Alert type="info" message={registrationWindow.message} /> : null}
      {summaryIssues.length > 0 ? (
        <div
          id="cart-issue-summary"
          ref={errorSummaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-2xl border border-red-300 bg-red-50 p-4 shadow-sm outline-none"
        >
          <h2 className="text-sm font-semibold text-red-900">There are issues with your cart</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
            {summaryIssues.map((item) => (
              <li key={item.key}>
                <a
                  className="font-medium underline underline-offset-2"
                  href={
                    cartItemIdBySectionId.get(item.sectionId)
                      ? `#cart-item-${cartItemIdBySectionId.get(item.sectionId)}`
                      : undefined
                  }
                >
                  {item.label}
                </a>
                : {item.message}
                {issueHint(item.reasonCode) ? <span className="ml-1 text-red-700/90">({issueHint(item.reasonCode)})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {reasonCount.length > 0 ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-red-900">Issue Breakdown</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {reasonCount.map(([reason, count]) => (
              <span
                key={reason}
                className="inline-flex items-center rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-800"
                title={reason}
              >
                {reasonCodeLabel(reason)} · {count}
              </span>
            ))}
          </div>
        </section>
      ) : null}
      {precheckRan && !precheckError && precheckIssues.length === 0 && precheckPreview.length > 0 ? (
        <Alert type="success" message="Precheck passed. You can submit safely with the statuses below." />
      ) : null}
      {!loading && items.length === 0 ? <Alert type="info" message="Your cart is empty. Add sections from catalog." /> : null}

      <section className="campus-card overflow-hidden">
        <div className="space-y-3 p-3 md:hidden">
          {loading ? (
            [1, 2, 3].map((row) => (
              <div key={row} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 w-2/3 rounded bg-slate-200" />
                  <div className="h-4 w-1/3 rounded bg-slate-100" />
                </div>
              </div>
            ))
          ) : null}

          {!loading && items.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
              <div className="flex flex-col items-center gap-3">
                <span className="text-3xl">🛒</span>
                <p className="text-sm font-medium text-slate-700">Your cart is empty</p>
                <p className="text-xs text-slate-500">Browse the catalog to add sections.</p>
                <a
                  href={catalogHref}
                  className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 no-underline transition hover:bg-slate-50"
                >
                  Browse Catalog →
                </a>
              </div>
            </div>
          ) : null}

          {!loading &&
            items.map((item) => {
              const rowIssues = issueMapBySectionId.get(item.section.id) ?? [];
              return (
                <article
                  id={`cart-item-${item.id}`}
                  key={item.id}
                  className={`rounded-xl border p-3 transition-opacity ${
                    rowIssues.length > 0 ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-white"
                  } ${removingItemId === item.id ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.section.course.code}</p>
                      <p className="text-xs text-slate-500">{item.section.course.title}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {item.section.credits} cr
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Section {item.section.sectionCode}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
                        item.section.requireApproval
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {item.section.requireApproval ? "Approval required" : "No approval needed"}
                    </span>
                  </div>
                  {rowIssues.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {rowIssues.map((issue, idx) => (
                        <span
                          key={`${item.id}-${issue.reasonCode}-${idx}`}
                          className="inline-flex rounded-full border border-red-200 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700"
                          title={`${issue.reasonCode}: ${issue.message}`}
                        >
                          {reasonCodeLabel(issue.reasonCode)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void removeItem(item.id)}
                    disabled={removingItemId === item.id || submitting}
                    className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {removingItemId === item.id ? (
                      <>
                        <span className="size-4 animate-spin rounded-full border-2 border-red-200 border-t-red-700" />
                        Removing…
                      </>
                    ) : (
                      "Remove"
                    )}
                  </button>
                </article>
              );
            })}
        </div>

        <div className="hidden max-h-[460px] overflow-auto rounded-2xl md:block">
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
                  <td colSpan={5} className="px-4 py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <span className="text-4xl">🛒</span>
                      <p className="text-sm font-medium text-slate-700">Your cart is empty</p>
                      <p className="text-xs text-slate-500">Add sections from the course catalog to get started.</p>
                      <a
                        href={catalogHref}
                        className="mt-1 inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 no-underline transition hover:bg-slate-50"
                      >
                        Browse Catalog →
                      </a>
                    </div>
                  </td>
                </tr>
              ) : null}

              {!loading &&
                items.map((item) => {
                  const rowIssues = issueMapBySectionId.get(item.section.id) ?? [];
                  return (
                    <tr
                      id={`cart-item-${item.id}`}
                      key={item.id}
                      className={`border-b border-slate-100 transition-colors hover:bg-slate-100/60 target:bg-amber-50 ${
                        rowIssues.length > 0 ? "bg-red-50/60" : "odd:bg-white even:bg-slate-50/40"
                      } ${removingItemId === item.id ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3 text-slate-800">
                        <p className="font-medium text-slate-900">{item.section.course.code}</p>
                        <p className="text-xs text-slate-500">{item.section.course.title}</p>
                        {rowIssues.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {rowIssues.map((issue, idx) => (
                              <span
                                key={`${item.id}-${issue.reasonCode}-${idx}`}
                                className="inline-flex rounded-full border border-red-200 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700"
                                title={`${issue.reasonCode}: ${issue.message}`}
                              >
                                {reasonCodeLabel(issue.reasonCode)}
                              </span>
                            ))}
                          </div>
                        ) : null}
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
                          disabled={removingItemId === item.id || submitting}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {removingItemId === item.id ? (
                            <>
                              <span className="size-3 animate-spin rounded-full border border-red-200 border-t-red-700" />
                              Removing…
                            </>
                          ) : (
                            "Remove"
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {precheckRan && groupedPrecheckIssues.length > 0 ? (
        <section id="precheck-issues" className="campus-card border-amber-200 bg-amber-50 p-4 md:p-5">
          <h2 className="text-base font-semibold text-amber-900">Precheck Issues</h2>
          <p className="mt-1 text-sm text-amber-800">Submit is likely to fail until these are resolved.</p>
          <div className="mt-3 space-y-3">
            {groupedPrecheckIssues.map((group) => (
              <div key={group.key} className="rounded-xl border border-amber-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-800">
                  {group.courseCode} §{group.sectionCode}
                </p>
                {group.issues[0] ? (
                  <a
                    className="mt-1 inline-flex text-xs font-medium text-amber-800 underline underline-offset-2"
                    href={
                      cartItemIdBySectionId.get(group.issues[0].sectionId)
                        ? `#cart-item-${cartItemIdBySectionId.get(group.issues[0].sectionId)}`
                        : undefined
                    }
                  >
                    Jump to cart row
                  </a>
                ) : null}
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                  {group.issues.map((issue, idx) => (
                    <li key={`${issue.sectionId}-${issue.reasonCode}-${idx}`}>
                      <div>{issue.message}</div>
                      {issueHint(issue.reasonCode) ? (
                        <div className="mt-0.5 text-xs text-amber-700/90">{issueHint(issue.reasonCode)}</div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {precheckRan && groupedPreview.length > 0 ? (
        <section className="campus-card p-4 md:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Precheck Status Preview</h2>
            <span className="text-xs text-slate-500">{precheckPreview.length} section(s)</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Predicted outcome if you submit now.</p>
          <div className="mt-3 space-y-2">
            {groupedPreview.map((group) => (
              <div key={group.status} className={`rounded-xl border p-3 ${statusBadgeClass(group.status).replace("text-", "border-").split(" ")[0]} bg-white`}>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(group.status)}`}>
                    {enrollmentStatusLabel(group.status)}
                  </span>
                  <span className="text-xs text-slate-500">{group.items.length} section(s)</span>
                </div>
                <div className="mt-2 grid gap-1">
                  {group.items.map((item) => (
                    <div key={`${item.sectionId}-${item.status}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                      <span className="font-medium text-slate-800">{item.courseCode} §{item.sectionCode}</span>
                      {item.status === "WAITLISTED" && item.waitlistPosition ? (
                        <span className="text-amber-600">Queue position {item.waitlistPosition}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {groupedResults.length > 0 ? (
        <section className="campus-card border-emerald-200 bg-emerald-50/40 p-4 md:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Submission Results</h2>
            <span className="text-xs text-slate-500">{submitResults.length} enrolled</span>
          </div>
          <p className="mt-1 text-xs text-emerald-700">
            Registration submitted successfully.{" "}
            <Link href="/student/grades" className="underline underline-offset-2">View grades</Link>{" "}
            or{" "}
            <Link href="/student/schedule" className="underline underline-offset-2">view schedule</Link>.
          </p>
          <div className="mt-3 space-y-2">
            {groupedResults.map((group) => (
              <div key={group.status} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(group.status)}`}>
                    {enrollmentStatusLabel(group.status)}
                  </span>
                  <span className="text-xs text-slate-500">{group.items.length} section(s)</span>
                </div>
                <div className="mt-2 grid gap-1">
                  {group.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                      <span className="font-medium text-slate-800">
                        {item.section.course?.code ? `${item.section.course.code} §` : "§"}{item.section.sectionCode}
                      </span>
                      {item.section.course?.title ? (
                        <span className="text-slate-500 truncate ml-2">{item.section.course.title}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {groupedIssues.length > 0 ? (
        <section className="campus-card border-red-200 bg-red-50 p-4 md:p-5">
          <h2 className="text-base font-semibold text-red-800">Submission Failures</h2>
          <p className="mt-1 text-sm text-red-700">No enrollment was created. Please fix the following issues and resubmit.</p>
          <div className="mt-3 space-y-3">
            {groupedIssues.map((group) => (
              <div key={group.key} className="rounded-xl border border-red-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-800">
                  {group.courseCode} §{group.sectionCode}
                </p>
                {group.issues[0] ? (
                  <a
                    className="mt-1 inline-flex text-xs font-medium text-red-700 underline underline-offset-2"
                    href={
                      cartItemIdBySectionId.get(group.issues[0].sectionId)
                        ? `#cart-item-${cartItemIdBySectionId.get(group.issues[0].sectionId)}`
                        : undefined
                    }
                  >
                    Jump to cart row
                  </a>
                ) : null}
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
                  {group.issues.map((issue, idx) => (
                    <li key={`${issue.sectionId}-${issue.reasonCode}-${idx}`}>
                      <div>{issue.message}</div>
                      {issueHint(issue.reasonCode) ? (
                        <div className="mt-0.5 text-xs text-red-700/90">{issueHint(issue.reasonCode)}</div>
                      ) : null}
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
