"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Printer, Share2, ShoppingCart } from "lucide-react";
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

type CurrentEnrollment = {
  id: string;
  status: string;
  section: {
    id: string;
    sectionCode: string;
    instructorName: string;
    location: string | null;
    meetingTimes: Array<{ weekday: number; startMinutes: number; endMinutes: number }>;
    course: {
      code: string;
      title: string;
    };
    enrollments?: Array<{ status: string }>;
    capacity?: number;
  };
};

type SectionOption = {
  id: string;
  sectionCode: string;
  instructorName: string;
  location: string | null;
  capacity: number;
  meetingTimes: Array<{ weekday: number; startMinutes: number; endMinutes: number }>;
  enrollments: Array<{ status: string }>;
  course: {
    code: string;
    title: string;
  };
};

type SubmitResult = {
  id: string;
  sectionId: string;
  status: string;
  waitlistPosition?: number | null;
  pendingReason?: "CREDIT_OVERLOAD" | "SECTION_APPROVAL" | null;
  section: {
    id?: string;
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
  pendingReason?: "CREDIT_OVERLOAD" | "SECTION_APPROVAL" | null;
};

type PrecheckResponse = {
  termId: string;
  cartCount: number;
  ok: boolean;
  preview: PrecheckPreviewItem[];
  issues: SubmitIssue[];
};

type StudentHold = {
  id: string;
  type: "REGISTRATION" | "ACADEMIC" | "FINANCIAL";
  reason: string;
  note?: string | null;
  expiresAt?: string | null;
};

type AcademicRequestStep = {
  id: string;
  stepOrder: number;
  stepKey: string;
  label: string;
  requiredApproverRole: "ADVISOR" | "FACULTY" | "ADMIN";
  status: "WAITING" | "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
  decisionNote?: string | null;
  decidedAt?: string | null;
};

type AcademicRequest = {
  id: string;
  type: "CREDIT_OVERLOAD" | "PREREQ_OVERRIDE";
  status: "SUBMITTED" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  requestedCredits?: number | null;
  reason: string;
  submittedAt: string;
  currentStepOrder?: number | null;
  decisionAt?: string | null;
  decisionNote?: string | null;
  section?: {
    id: string;
    sectionCode: string;
    course: {
      code: string;
      title: string;
    };
  } | null;
  owner?: {
    id: string;
    email: string;
    advisorProfile?: { displayName?: string | null } | null;
    facultyProfile?: { displayName?: string | null } | null;
  } | null;
  term?: {
    id: string;
    name: string;
    maxCredits: number;
  } | null;
  steps: AcademicRequestStep[];
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
  if (reasonCode === "SECTION_ALREADY_STARTED") return "教学班已开课，请联系教务处获取帮助。";
  if (reasonCode === "PREREQUISITE_NOT_MET") return "请先修完先修课程，或向教务处申请先修课豁免。";
  if (reasonCode === "TIME_CONFLICT") return "请移除或更换时间冲突的教学班。";
  if (reasonCode === "CREDIT_LIMIT_EXCEEDED") return "请减少计划学分，或申请超载豁免。";
  if (reasonCode === "ALREADY_REGISTERED") return "该教学班已在您的在读课程中。";
  return null;
}

function issueSeverity(reasonCode: string): "high" | "medium" | "low" {
  if (reasonCode === "TIME_CONFLICT" || reasonCode === "PREREQUISITE_NOT_MET") return "high";
  if (reasonCode === "CREDIT_LIMIT_EXCEEDED" || reasonCode === "SECTION_ALREADY_STARTED") return "medium";
  return "low";
}

function issueSeverityStyles(reasonCode: string): string {
  const severity = issueSeverity(reasonCode);
  if (severity === "high") return "border-l-red-500 bg-red-50";
  if (severity === "medium") return "border-l-amber-500 bg-amber-50";
  return "border-l-emerald-500 bg-emerald-50";
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

function getCurrentWorkflowStep(request: AcademicRequest) {
  if (!request.currentStepOrder) return null;
  return request.steps.find((step) => step.stepOrder === request.currentStepOrder) ?? null;
}

function getRequestWorkflowLabel(request: AcademicRequest): string {
  if (request.status === "APPROVED") return "已批准";
  if (request.status === "REJECTED") return "已拒绝";
  if (request.status === "WITHDRAWN") return "已撤回";
  const step = getCurrentWorkflowStep(request);
  return step ? `待${step.label}` : "已提交";
}

function getRequestWorkflowTone(request: AcademicRequest): string {
  if (request.status === "APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (request.status === "REJECTED") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function getPreviousApprovedStep(request: AcademicRequest) {
  return request.steps.filter((step) => step.status === "APPROVED").sort((a, b) => b.stepOrder - a.stepOrder)[0] ?? null;
}

function getWorkflowProgressNote(request: AcademicRequest) {
  const currentStep = getCurrentWorkflowStep(request);
  const previousApprovedStep = getPreviousApprovedStep(request);

  if (request.status === "APPROVED" || request.status === "REJECTED") {
    return null;
  }

  if (previousApprovedStep && currentStep) {
    return `${previousApprovedStep.label} complete. Now awaiting ${currentStep.label.toLowerCase()}.`;
  }

  if (currentStep) {
    return `${currentStep.label} is pending.`;
  }

  return null;
}

function fmt(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mins = String(minutes % 60).padStart(2, "0");
  return `${hours}:${mins}`;
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
  return "部分教学班提交失败。";
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
  const [activeHolds, setActiveHolds] = useState<StudentHold[]>([]);
  const [academicRequests, setAcademicRequests] = useState<AcademicRequest[]>([]);
  const [holdsLoading, setHoldsLoading] = useState(false);
  const [holdsLoaded, setHoldsLoaded] = useState(false);
  const [holdsError, setHoldsError] = useState("");
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [requestsError, setRequestsError] = useState("");
  const [overloadReason, setOverloadReason] = useState("");
  const [submittingOverloadRequest, setSubmittingOverloadRequest] = useState(false);
  const [prereqOverrideReason, setPrereqOverrideReason] = useState("");
  const [openPrereqRequestSectionId, setOpenPrereqRequestSectionId] = useState("");
  const [submittingPrereqOverride, setSubmittingPrereqOverride] = useState(false);
  const [removingInvalid, setRemovingInvalid] = useState(false);
  const [removingItemId, setRemovingItemId] = useState("");
  const [waitlistPositions, setWaitlistPositions] = useState<Record<string, number>>({});
  const [currentEnrollments, setCurrentEnrollments] = useState<CurrentEnrollment[]>([]);
  const [allSections, setAllSections] = useState<SectionOption[]>([]);
  const [swapSource, setSwapSource] = useState<CurrentEnrollment | null>(null);
  const [swapCandidates, setSwapCandidates] = useState<SectionOption[]>([]);
  const [swapTargetId, setSwapTargetId] = useState("");
  const [loadingSwapOptions, setLoadingSwapOptions] = useState(false);
  const [swapping, setSwapping] = useState(false);
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
  const submitOutcomeSummary = useMemo(() => {
    if (submitResults.length === 0) {
      return {
        title: "提交完成",
        detail: "",
        followup: ""
      };
    }

    const allPendingApproval = submitResults.every((item) => item.status === "PENDING_APPROVAL");
    const allWaitlisted = submitResults.every((item) => item.status === "WAITLISTED");
    const hasPendingApproval = submitResults.some((item) => item.status === "PENDING_APPROVAL");
    const hasWaitlisted = submitResults.some((item) => item.status === "WAITLISTED");

    if (allPendingApproval) {
      return {
        title: "提交完成，等待审批",
        detail: `本次共提交 ${submitResults.length} 条申请，当前都处于待审批状态。`,
        followup: "超学分申请已进入审批队列，审批结果会在通知中心同步。"
      };
    }

    if (allWaitlisted) {
      return {
        title: "已加入候补队列",
        detail: `本次共处理 ${submitResults.length} 条注册结果，当前全部进入候补。`,
        followup: "你仍保留候补资格，座位释放后系统会自动尝试晋升。"
      };
    }

    if (hasPendingApproval || hasWaitlisted) {
      return {
        title: "提交完成",
        detail: `本次共处理 ${submitResults.length} 条注册结果，已包含候补或待审批项目。`,
        followup: "请继续关注下方状态卡片，系统会在审批或候补晋升后更新你的结果。"
      };
    }

    return {
      title: "选课成功",
      detail: `本次共处理 ${submitResults.length} 条注册结果。`,
      followup: "课程已进入你的当前课表，可以继续查看课表或打印确认单。"
    };
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

  useEffect(() => {
    const waitlistedSectionIds = submitResults
      .filter((item) => item.status === "WAITLISTED")
      .map((item) => item.sectionId || item.section.id)
      .filter((value): value is string => Boolean(value));

    if (waitlistedSectionIds.length === 0) {
      setWaitlistPositions({});
      return;
    }

    let alive = true;
    void Promise.all(
      waitlistedSectionIds.map(async (sectionId) => {
        const result = await apiFetch<{ position: number; ahead: number }>(`/registration/waitlist-position/${sectionId}`).catch(
          () => null
        );
        return [sectionId, result?.position ?? null] as const;
      })
    ).then((entries) => {
      if (!alive) return;
      setWaitlistPositions(
        Object.fromEntries(entries.filter((entry): entry is readonly [string, number] => entry[1] !== null))
      );
    });

    return () => {
      alive = false;
    };
  }, [submitResults]);

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
  const pendingOverloadRequest = useMemo(
    () => academicRequests.find((request) => request.type === "CREDIT_OVERLOAD" && request.status === "SUBMITTED") ?? null,
    [academicRequests]
  );
  const approvedOverloadRequest = useMemo(
    () => academicRequests.find((request) => request.type === "CREDIT_OVERLOAD" && request.status === "APPROVED") ?? null,
    [academicRequests]
  );
  const prereqOverrideRequests = useMemo(
    () => academicRequests.filter((request) => request.type === "PREREQ_OVERRIDE"),
    [academicRequests]
  );
  const prereqOverrideRequestBySectionId = useMemo(
    () =>
      new Map(
        prereqOverrideRequests
          .filter((request) => request.section?.id)
          .map((request) => [request.section!.id, request] as const)
      ),
    [prereqOverrideRequests]
  );
  const governanceLoading = holdsLoading || requestsLoading;
  const governanceError = [holdsError, requestsError].filter(Boolean).join(" ");
  const governanceReady = holdsLoaded && requestsLoaded && !governanceError;
  const overloadRequestNeeded = useMemo(
    () =>
      cartMetrics.maxCredits !== null &&
      (cartMetrics.totalCredits > cartMetrics.maxCredits ||
        activeIssues.some((issue) => issue.reasonCode === "CREDIT_LIMIT_EXCEEDED")),
    [activeIssues, cartMetrics.maxCredits, cartMetrics.totalCredits]
  );
  const canSubmitOverloadRequest = useMemo(() => {
    if (!termId || cartMetrics.maxCredits === null) return false;
    if (cartMetrics.totalCredits <= cartMetrics.maxCredits) return false;
    if (pendingOverloadRequest) return false;
    if (approvedOverloadRequest && (approvedOverloadRequest.requestedCredits ?? 0) >= cartMetrics.totalCredits) return false;
    return true;
  }, [approvedOverloadRequest, cartMetrics.maxCredits, cartMetrics.totalCredits, pendingOverloadRequest, termId]);

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
    if (!termId) return "请先选择学期。";
    if (!registrationWindow.isOpen) return registrationWindow.message || "选课窗口当前已关闭。";
    if (items.length === 0) return "请先将至少一个教学班加入购物车后再预检。";
    if (submitting) return "请等待当前提交完成。";
    return "";
  }, [termId, registrationWindow.isOpen, registrationWindow.message, items.length, submitting]);
  const submitDisabled =
    !termId || items.length === 0 || submitting || !registrationWindow.isOpen || hasBlockingIssues;
  const submitDisabledReason = useMemo(() => {
    if (!termId) return "请先选择学期。";
    if (!registrationWindow.isOpen) return registrationWindow.message || "选课窗口当前已关闭。";
    if (items.length === 0) return "请先将至少一个教学班加入购物车后再提交。";
    if (!precheckRan) return "提交前请先运行预检。";
    if (hasBlockingIssues) return "请先解决预检问题或移除无效课程。";
    return "";
  }, [termId, registrationWindow.isOpen, registrationWindow.message, items.length, precheckRan, hasBlockingIssues]);

  const readinessChecks = useMemo(
    () => [
      { label: "已选择学期", ok: Boolean(termId) },
      {
        label: "治理状态可用",
        ok: governanceReady,
        hint: governanceLoading ? "加载中" : governanceError ? "请重试" : ""
      },
      {
        label: "无有效学籍限制",
        ok: governanceReady ? activeHolds.length === 0 : false,
        hint: governanceReady ? "" : "不可用"
      },
      { label: "选课窗口已开放", ok: registrationWindow.isOpen },
      { label: "购物车不为空", ok: items.length > 0 },
      {
        label: "预检无阻止性问题",
        ok: precheckRan ? !hasBlockingIssues : false,
        hint: precheckRan ? "" : "请运行预检"
      }
    ],
    [termId, governanceReady, governanceLoading, governanceError, activeHolds.length, registrationWindow.isOpen, items.length, precheckRan, hasBlockingIssues]
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
      setError(err instanceof Error ? err.message : "购物车加载失败");
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentEnrollments = async (selectedTermId: string) => {
    if (!selectedTermId) {
      setCurrentEnrollments([]);
      return;
    }

    try {
      const data = await apiFetch<CurrentEnrollment[]>(`/registration/enrollments?termId=${selectedTermId}`);
      setCurrentEnrollments(data.filter((item) => item.status === "ENROLLED"));
    } catch {
      setCurrentEnrollments([]);
    }
  };

  const loadSections = async (selectedTermId: string) => {
    if (!selectedTermId) {
      setAllSections([]);
      return;
    }

    try {
      const data = await apiFetch<SectionOption[]>(`/academics/sections?termId=${selectedTermId}`);
      setAllSections(data);
    } catch {
      setAllSections([]);
    }
  };

  const loadActiveHolds = async () => {
    setHoldsLoading(true);
    setHoldsError("");
    try {
      const data = await apiFetch<StudentHold[]>("/governance/my-holds");
      setActiveHolds(data);
      setHoldsLoaded(true);
    } catch (err) {
      setActiveHolds([]);
      setHoldsLoaded(false);
      setHoldsError(err instanceof Error ? err.message : "无法加载学籍限制");
    } finally {
      setHoldsLoading(false);
    }
  };

  const loadAcademicRequests = async (selectedTermId: string) => {
    if (!selectedTermId) {
      setAcademicRequests([]);
      setRequestsLoaded(true);
      setRequestsError("");
      return;
    }

    setRequestsLoading(true);
    setRequestsError("");
    try {
      const data = await apiFetch<AcademicRequest[]>(`/governance/my-requests?termId=${selectedTermId}`);
      setAcademicRequests(data);
      setRequestsLoaded(true);
    } catch (err) {
      setAcademicRequests([]);
      setRequestsLoaded(false);
      setRequestsError(err instanceof Error ? err.message : "无法加载学术申请");
    } finally {
      setRequestsLoading(false);
    }
  };

  const reloadGovernanceState = async (selectedTermId: string) => {
    await Promise.all([loadActiveHolds(), loadAcademicRequests(selectedTermId)]);
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
          await Promise.all([
            loadCart(initialTermId),
            loadCurrentEnrollments(initialTermId),
            loadSections(initialTermId),
            reloadGovernanceState(initialTermId)
          ]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "学期加载失败");
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
    await Promise.all([
      loadCart(nextTermId),
      loadCurrentEnrollments(nextTermId),
      loadSections(nextTermId),
      reloadGovernanceState(nextTermId)
    ]);
  };

  const removeItem = async (cartItemId: string) => {
    try {
      setError("");
      setRemovingItemId(cartItemId);
      resetPrecheck();
      await apiFetch(`/registration/cart/${cartItemId}`, { method: "DELETE" });
      await loadCart(termId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "移除失败");
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
      setError(err instanceof Error ? err.message : "移除无效课程失败");
      toast("移除无效课程失败。", "error");
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
        setPrecheckError("预检发现阻止性问题。");
        toast(buildIssueToastMessage(issues, activeTerm?.maxCredits ?? null), "error");
      } else if (err instanceof ApiError && err.code === "ACTIVE_REGISTRATION_HOLD" && Array.isArray(err.details)) {
        setActiveHolds(err.details as StudentHold[]);
        setHoldsLoaded(true);
        setHoldsError("");
        const message = err.message || "学籍限制已阻止选课操作。";
        setPrecheckError(message);
        toast(message, "error");
        setPrecheckIssues([]);
      } else {
        const message = err instanceof Error ? err.message : "预检失败";
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
      if (result.some((item) => item.status === "PENDING_APPROVAL" && item.pendingReason === "CREDIT_OVERLOAD")) {
        toast("学分已超上限，已提交超学分申请，等待审批", "info");
      } else {
        toast(`Submitted ${result.length} item(s).`, "success");
      }
      resetPrecheck();
      await Promise.all([loadCart(termId), loadCurrentEnrollments(termId), loadSections(termId)]);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.code === "SUBMIT_VALIDATION_FAILED" &&
        Array.isArray(err.details)
      ) {
        const issues = err.details as SubmitIssue[];
        setSubmitIssues(issues);
        setError("部分教学班提交失败，请查看下方原因。");
        toast(buildIssueToastMessage(issues, activeTerm?.maxCredits ?? null), "error");
      } else if (err instanceof ApiError && err.code === "ACTIVE_REGISTRATION_HOLD" && Array.isArray(err.details)) {
        setActiveHolds(err.details as StudentHold[]);
        setHoldsLoaded(true);
        setHoldsError("");
        const message = err.message || "学籍限制已阻止选课操作。";
        setError(message);
        toast(message, "error");
      } else {
        const message = err instanceof Error ? err.message : "提交失败";
        setError(message);
        toast(message, "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const catalogHref = `/student/catalog${termId ? `?termId=${termId}` : ""}`;
  const enrolledItems = useMemo(
    () => currentEnrollments.filter((item) => item.status === "ENROLLED"),
    [currentEnrollments]
  );

  const openSwapModal = async (enrollment: CurrentEnrollment) => {
    setSwapSource(enrollment);
    setSwapTargetId("");
    setLoadingSwapOptions(true);
    try {
      const sourceSections =
        allSections.length > 0 ? allSections : await apiFetch<SectionOption[]>(`/academics/sections?termId=${termId}`);
      if (allSections.length === 0) {
        setAllSections(sourceSections);
      }
      const candidates = sourceSections.filter(
        (section) => section.course.code === enrollment.section.course.code && section.id !== enrollment.section.id
      );
      setSwapCandidates(candidates);
    } catch (err) {
      toast(err instanceof Error ? err.message : "加载换班选项失败", "error");
      setSwapSource(null);
    } finally {
      setLoadingSwapOptions(false);
    }
  };

  const confirmSwap = async () => {
    if (!swapSource || !swapTargetId) return;
    try {
      setSwapping(true);
      await apiFetch("/registration/swap", {
        method: "POST",
        body: JSON.stringify({
          dropSectionId: swapSource.section.id,
          addSectionId: swapTargetId
        })
      });
      toast("换班成功", "success");
      setSwapSource(null);
      setSwapCandidates([]);
      setSwapTargetId("");
      await Promise.all([loadCart(termId), loadCurrentEnrollments(termId), loadSections(termId)]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "换班失败", "error");
    } finally {
      setSwapping(false);
    }
  };

  const submitOverloadRequest = async () => {
    if (!termId || !canSubmitOverloadRequest || !overloadReason.trim()) return;

    try {
      setSubmittingOverloadRequest(true);
      const requestedCredits = Math.max(cartMetrics.totalCredits, cartMetrics.maxCredits ?? cartMetrics.totalCredits);
      await apiFetch("/governance/requests/credit-overload", {
        method: "POST",
        body: JSON.stringify({
          termId,
          requestedCredits,
          reason: overloadReason.trim()
        })
      });
      setOverloadReason("");
      await loadAcademicRequests(termId);
      toast("超学分申请已提交，等待 advisor 审核", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "提交超学分申请失败", "error");
    } finally {
      setSubmittingOverloadRequest(false);
    }
  };

  const submitPrereqOverrideRequest = async (sectionId: string) => {
    if (!sectionId || prereqOverrideReason.trim().length < 8) return;

    try {
      setSubmittingPrereqOverride(true);
      await apiFetch("/governance/requests/prereq-override", {
        method: "POST",
        body: JSON.stringify({
          sectionId,
          reason: prereqOverrideReason.trim()
        })
      });
      setPrereqOverrideReason("");
      setOpenPrereqRequestSectionId("");
      await loadAcademicRequests(termId);
      toast("先修课豁免申请已提交，先等待任课教师审核，再进入 registrar 终审", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "提交先修课豁免申请失败", "error");
    } finally {
      setSubmittingPrereqOverride(false);
    }
  };
  const issueAnchorHref =
    summaryIssues.length > 0 ? "#cart-issue-summary" : groupedPrecheckIssues.length > 0 ? "#precheck-issues" : "";
  const nextAction: NextAction = (() => {
    if (terms.length === 0 || !termId) {
      return {
        title: "选择学期",
        detail: "请先选择一个活跃学期，选择后购物车和提交操作将解锁。",
        tone: "slate"
      };
    }
    if (items.length === 0) {
      return {
        title: "向购物车添加课程",
        detail: "购物车为空，请前往课程目录添加教学班。",
        tone: "slate",
        buttonLabel: "浏览课程目录",
        buttonTone: "neutral",
        href: catalogHref
      };
    }
    if (governanceLoading) {
      return {
        title: "加载治理状态",
        detail: "正在检查学籍限制与超载申请状态，请稍候。",
        tone: "slate"
      };
    }
    if (governanceError) {
      return {
        title: "重试状态检查",
        detail: "限制或申请数据加载失败，请重试以确保页面状态准确。",
        tone: "amber",
        buttonLabel: "重新加载状态",
        buttonTone: "neutral",
        onClick: () => void reloadGovernanceState(termId)
      };
    }
    if (activeHolds.length > 0) {
      return {
        title: "解除学籍限制",
        detail: "注册已被锁定，请联系教务处或财务部门解除限制。",
        tone: "red"
      };
    }
    if (!registrationWindow.isOpen) {
      return {
        title: "选课窗口已关闭",
        detail: registrationWindow.message || "选课功能当前不可用。",
        tone: "amber"
      };
    }
    if (!precheckRan) {
      return {
        title: "请先运行预检",
        detail: "预检可在提交前检测先修课、时间冲突和学分限制。",
        tone: "slate",
        buttonLabel: prechecking ? "检查中" : "运行预检",
        buttonTone: "primary",
        onClick: () => void runPrecheck(),
        disabled: precheckDisabled || prechecking
      };
    }
    if (pendingOverloadRequest) {
      return {
        title: "等待导师审批",
        detail: "A credit overload request is pending. Registration will remain blocked until it is approved or rejected.",
        tone: "amber"
      };
    }
    if (hasBlockingIssues) {
      if (canSubmitOverloadRequest && overloadRequestNeeded) {
        return {
          title: "申请超载豁免",
          detail: "购物车学分超出标准上限，请提交超载申请以供导师审核。",
          tone: "amber"
        };
      }
      if (invalidCartItemIds.length > 0) {
        return {
          title: "清除无效课程",
          detail: `${invalidCartItemIds.length} item(s) currently fail precheck and can be removed in one click.`,
          tone: "red",
          buttonLabel: removingInvalid ? "清除中" : "移除无效课程",
          buttonTone: "danger",
          onClick: () => void removeInvalidItems(),
          disabled: removingInvalid || submitting
        };
      }
      return {
        title: "解决预检问题",
        detail: "请查看下方问题卡，调整教学班后重新运行预检。",
        tone: "red",
        ...(issueAnchorHref
          ? {
              buttonLabel: "查看问题",
              buttonTone: "neutral" as const,
              href: issueAnchorHref
            }
          : {})
      };
    }
    return {
      title: "可以提交",
      detail: "预检通过，可以提交购物车了。",
      tone: "emerald",
      buttonLabel: submitting ? "提交中" : "提交",
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
            <p className="campus-eyebrow">选课流程</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-[2.65rem]">选课购物车</h1>
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
              返回课程目录
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
                "运行预检"
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
                    清理中…
                  </>
                ) : (
                  <>移除无效项（{invalidCartItemIds.length}）</>
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
                "提交"
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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">购物车课程</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{items.length}</p>
        </div>
        <div className={`campus-kpi ${cartMetrics.overLimit ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${cartMetrics.overLimit ? "text-red-700" : "text-slate-500"}`}>
            计划学分
          </p>
          <p className={`mt-1 text-2xl font-semibold ${cartMetrics.overLimit ? "text-red-900" : "text-slate-900"}`}>
            {cartMetrics.totalCredits}{cartMetrics.maxCredits !== null ? ` / ${cartMetrics.maxCredits}` : ""}
          </p>
          {cartMetrics.overLimit ? (
            <p className="mt-0.5 text-xs font-medium text-red-700">超出学分上限</p>
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
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">需审批</p>
          <p className="mt-1 text-2xl font-semibold text-blue-900">{cartMetrics.approvalCount}</p>
          {cartMetrics.approvalCount > 0 ? (
            <p className="mt-0.5 text-xs text-blue-600">等待管理员操作</p>
          ) : (
            <p className="mt-0.5 text-xs text-blue-500">无需审批</p>
          )}
        </div>
        <div className={`campus-kpi ${invalidCartItemIds.length > 0 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${invalidCartItemIds.length > 0 ? "text-red-700" : "text-emerald-700"}`}>
            问题条目
          </p>
          <p className={`mt-1 text-2xl font-semibold ${invalidCartItemIds.length > 0 ? "text-red-900" : "text-emerald-900"}`}>
            {invalidCartItemIds.length}
          </p>
          {invalidCartItemIds.length > 0 ? (
            <p className="mt-0.5 text-xs font-medium text-red-600">运行预检以查看详情</p>
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
              学期
            </span>
            <select
              className="campus-select"
              value={termId}
              onChange={(event) => void onTermChange(event.target.value)}
              disabled={terms.length === 0}
            >
              {terms.length === 0 ? <option value="">暂无活跃学期</option> : null}
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            购物车共 {items.length} 门课程
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="campus-card p-4">
          <h2 className="text-sm font-semibold text-slate-900">状态说明</h2>
          <div className="mt-2 grid gap-2">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <span className="font-semibold">{enrollmentStatusLabel("ENROLLED")}：</span>提交后席位已确认。
            </p>
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <span className="font-semibold">待审批：</span>等待院系/管理员操作。
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="font-semibold">候补中：</span>名额已满时加入候补队列。
            </p>
          </div>
        </section>

        <section className="campus-card p-4">
          <h2 className="text-sm font-semibold text-slate-900">提交就绪状态</h2>
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
                  {check.ok ? "已就绪" : check.hint ?? "待确认"}
                </span>
              </div>
            ))}
          </div>
          {!precheckRan && items.length > 0 ? (
            <p className="mt-2 text-xs text-slate-600">
              建议在提交前运行预检，提前发现冲突和先修课问题。
            </p>
          ) : null}
          {hasBlockingIssues ? (
            <p className="mt-2 text-xs font-medium text-red-700">
              预检发现阻塞性问题，请解决或移除问题条目后再提交。
            </p>
          ) : null}
        </section>

        <section className="campus-card p-4 lg:col-span-2" aria-live="polite">
          <h2 className="text-sm font-semibold text-slate-900">下一步操作</h2>
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
      {(governanceLoading || governanceError) ? (
        <section className={`campus-card p-4 md:p-5 ${governanceError ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">学籍管控状态</h2>
              <p className="mt-1 text-sm text-slate-600">
                冻结记录和超学分申请数据加载成功后，此页面才能准确显示您的学籍限制。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void reloadGovernanceState(termId)}
              disabled={governanceLoading}
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {governanceLoading ? "加载中…" : "重试"}
            </button>
          </div>
          {holdsError ? <p className="mt-3 text-sm text-amber-800">冻结记录不可用：{holdsError}</p> : null}
          {requestsError ? <p className="mt-1 text-sm text-amber-800">申请记录不可用：{requestsError}</p> : null}
        </section>
      ) : null}
      {activeHolds.length > 0 ? (
        <section className="campus-card border-red-200 bg-red-50 p-4 md:p-5">
          <h2 className="text-base font-semibold text-red-900">注册冻结记录</h2>
          <p className="mt-1 text-sm text-red-800">以下冻结解除前，自助注册功能将被禁止。</p>
          <div className="mt-3 space-y-2">
            {activeHolds.map((hold) => (
              <div key={hold.id} className="rounded-xl border border-red-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="campus-chip border-red-200 bg-red-50 text-red-700 text-xs">{hold.type}</span>
                  {hold.expiresAt ? (
                    <span className="text-xs text-slate-500">到期 {formatDateTime(hold.expiresAt)}</span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm font-medium text-slate-900">{hold.reason}</p>
                {hold.note ? <p className="mt-1 text-sm text-slate-600">{hold.note}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {(overloadRequestNeeded || pendingOverloadRequest || approvedOverloadRequest) ? (
        <section className="campus-card p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">超学分申请</h2>
              <p className="mt-1 text-sm text-slate-600">
                当前购物车：{cartMetrics.totalCredits} 学分
                {cartMetrics.maxCredits !== null ? ` · 标准上限 ${cartMetrics.maxCredits}` : ""}。
              </p>
            </div>
            {pendingOverloadRequest ? (
              <span className={`campus-chip ${getRequestWorkflowTone(pendingOverloadRequest)}`}>{getRequestWorkflowLabel(pendingOverloadRequest)}</span>
            ) : approvedOverloadRequest ? (
              <span className="campus-chip border-emerald-200 bg-emerald-50 text-emerald-700">
                已批准至 {approvedOverloadRequest.requestedCredits ?? "—"} 学分
              </span>
            ) : null}
          </div>
          {pendingOverloadRequest || approvedOverloadRequest ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p>
                提交于 {formatDateTime((pendingOverloadRequest ?? approvedOverloadRequest)!.submittedAt)}
              </p>
              <p className="mt-1">{(pendingOverloadRequest ?? approvedOverloadRequest)!.reason}</p>
              {getWorkflowProgressNote((pendingOverloadRequest ?? approvedOverloadRequest)!) ? (
                <p className="mt-2 text-xs text-slate-500">
                  {getWorkflowProgressNote((pendingOverloadRequest ?? approvedOverloadRequest)!)}
                </p>
              ) : null}
              {(pendingOverloadRequest ?? approvedOverloadRequest)!.decisionNote ? (
                <p className="mt-2 text-xs text-slate-500">
                  审批备注：{(pendingOverloadRequest ?? approvedOverloadRequest)!.decisionNote}
                </p>
              ) : null}
            </div>
          ) : null}
          {canSubmitOverloadRequest ? (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  申请超学分的原因
                </span>
                <textarea
                  className="campus-input min-h-28"
                  value={overloadReason}
                  onChange={(event) => setOverloadReason(event.target.value)}
                  placeholder="请填写超出标准学分上限的学术原因"
                />
              </label>
              <button
                type="button"
                onClick={() => void submitOverloadRequest()}
                disabled={submittingOverloadRequest || overloadReason.trim().length < 8}
                className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submittingOverloadRequest ? "提交中…" : `申请 ${cartMetrics.totalCredits} 学分超载豁免`}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {prereqOverrideRequests.length > 0 ? (
        <section className="campus-card p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">先修课豁免申请</h2>
              <p className="mt-1 text-sm text-slate-600">
                先修课豁免申请需经教师审核，再由注册办公室审批后方可生效。
              </p>
            </div>
            <span className="campus-chip text-xs">共 {prereqOverrideRequests.length} 条</span>
          </div>
          <div className="mt-3 space-y-2">
            {prereqOverrideRequests.map((request) => (
              <div key={request.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">
                    {request.section?.course.code ?? "课程"} §{request.section?.sectionCode ?? "—"}
                  </span>
                  <span className={`campus-chip text-xs ${getRequestWorkflowTone(request)}`}>{getRequestWorkflowLabel(request)}</span>
                </div>
                <p className="mt-1">{request.reason}</p>
                <p className="mt-2 text-xs text-slate-500">
                  提交于 {formatDateTime(request.submittedAt)}
                  {request.owner?.facultyProfile?.displayName ? ` · 审核人 ${request.owner.facultyProfile.displayName}` : ""}
                </p>
                {getWorkflowProgressNote(request) ? <p className="mt-2 text-xs text-slate-500">{getWorkflowProgressNote(request)}</p> : null}
                {request.decisionNote ? <p className="mt-2 text-xs text-slate-500">Decision note: {request.decisionNote}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {terms.length === 0 ? (
        <Alert
          type="info"
          message="暂无活跃学期，学期发布后选课购物车将自动启用。"
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
          <h2 className="text-sm font-semibold text-red-900">购物车存在以下问题</h2>
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
          <h2 className="text-sm font-semibold text-red-900">问题分类统计</h2>
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
        <Alert type="success" message="预检通过，可根据下方状态安全提交。" />
      ) : null}
      {!loading && items.length === 0 ? (
        <section className="campus-card">
          <div className="campus-empty">
            <ShoppingCart className="campus-empty-icon" />
            <p className="campus-empty-title">购物车为空</p>
            <p className="campus-empty-desc">前往课程目录添加感兴趣的课程，再回来做检查与提交。</p>
            <Link
              href={catalogHref}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-[hsl(221_83%_43%)] px-4 text-sm font-semibold text-white no-underline transition hover:bg-[hsl(221_83%_38%)]"
            >
              浏览课程
            </Link>
          </div>
        </section>
      ) : null}

      {enrolledItems.length > 0 ? (
        <section className="campus-card p-4 md:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">当前已选教学班</h2>
            <span className="text-xs text-slate-500">{enrolledItems.length} enrolled</span>
          </div>
          <div className="mt-3 space-y-2">
            {enrolledItems.map((enrollment) => (
              <div key={enrollment.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {enrollment.section.course.code} §{enrollment.section.sectionCode}
                  </p>
                  <p className="text-xs text-slate-500">{enrollment.section.course.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {enrollment.section.instructorName} · {enrollment.section.meetingTimes.map((meeting) => `${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][meeting.weekday]} ${fmt(Math.floor(meeting.startMinutes / 60) * 60).slice(0, 5)}-${fmt(Math.floor(meeting.endMinutes / 60) * 60).slice(0, 5)}`).join(" / ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void openSwapModal(enrollment)}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  换班
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
            <div className="campus-empty rounded-xl border border-slate-200 bg-white">
              <ShoppingCart className="campus-empty-icon" />
              <p className="campus-empty-title">购物车为空</p>
              <p className="campus-empty-desc">前往课程目录添加感兴趣的课程。</p>
              <Link
                href={catalogHref}
                className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 no-underline transition hover:bg-slate-50"
              >
                浏览课程
              </Link>
            </div>
          ) : null}

          {!loading &&
            items.map((item) => {
              const rowIssues = issueMapBySectionId.get(item.section.id) ?? [];
              const prereqIssue = rowIssues.find((issue) => issue.reasonCode === "PREREQUISITE_NOT_MET");
              const prereqRequest = prereqOverrideRequestBySectionId.get(item.section.id) ?? null;
              const prereqRequestBlocksNewSubmit =
                prereqRequest?.status === "SUBMITTED" || prereqRequest?.status === "APPROVED";
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
                      {item.section.requireApproval ? "需审批" : "无需审批"}
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
                  {prereqIssue ? (
                    <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">先修课豁免</p>
                      <p className="mt-1 text-xs text-blue-900">{prereqIssue.message}</p>
                      {prereqRequest && prereqRequestBlocksNewSubmit ? (
                        <div className="mt-2 space-y-1 text-xs text-blue-700">
                          <p>
                            当前申请状态：<span className="font-semibold">{getRequestWorkflowLabel(prereqRequest)}</span>
                          </p>
                          {getWorkflowProgressNote(prereqRequest) ? <p>{getWorkflowProgressNote(prereqRequest)}</p> : null}
                          {prereqRequest.decisionNote ? <p>{prereqRequest.decisionNote}</p> : null}
                        </div>
                      ) : openPrereqRequestSectionId === item.section.id ? (
                        <div className="mt-3 space-y-2">
                          <textarea
                            className="campus-input min-h-24"
                            value={prereqOverrideReason}
                            onChange={(event) => setPrereqOverrideReason(event.target.value)}
                            placeholder="请说明申请先修课豁免的原因"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void submitPrereqOverrideRequest(item.section.id)}
                              disabled={submittingPrereqOverride || prereqOverrideReason.trim().length < 8}
                              className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {submittingPrereqOverride ? "提交中…" : "提交豁免申请"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenPrereqRequestSectionId("");
                                setPrereqOverrideReason("");
                              }}
                              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenPrereqRequestSectionId(item.section.id);
                            setPrereqOverrideReason("");
                          }}
                          className="mt-3 inline-flex h-9 items-center rounded-lg border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                        >
                          申请先修课豁免
                        </button>
                      )}
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
                      "移除"
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
                <th className="px-4 py-3 font-semibold text-slate-700">课程</th>
                <th className="px-4 py-3 font-semibold text-slate-700">教学班</th>
                <th className="px-4 py-3 font-semibold text-slate-700">学分</th>
                <th className="px-4 py-3 font-semibold text-slate-700">审批</th>
                <th className="px-4 py-3 font-semibold text-slate-700">操作</th>
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
                    <div className="campus-empty py-2">
                      <ShoppingCart className="campus-empty-icon" />
                      <p className="campus-empty-title">购物车为空</p>
                      <p className="campus-empty-desc">前往课程目录添加感兴趣的课程。</p>
                      <Link
                        href={catalogHref}
                        className="mt-1 inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 no-underline transition hover:bg-slate-50"
                      >
                        浏览课程
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : null}

              {!loading &&
                items.map((item) => {
                  const rowIssues = issueMapBySectionId.get(item.section.id) ?? [];
                  const prereqIssue = rowIssues.find((issue) => issue.reasonCode === "PREREQUISITE_NOT_MET");
                  const prereqRequest = prereqOverrideRequestBySectionId.get(item.section.id) ?? null;
                  const prereqRequestBlocksNewSubmit =
                    prereqRequest?.status === "SUBMITTED" || prereqRequest?.status === "APPROVED";
                  return (
                    <Fragment key={item.id}>
                    <tr
                      id={`cart-item-${item.id}`}
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
                          {item.section.requireApproval ? "需审批" : "无需"}
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
                            "移除"
                          )}
                        </button>
                      </td>
                    </tr>
                    {prereqIssue ? (
                      <tr key={`${item.id}-prereq`} className="border-b border-slate-100 bg-blue-50/70">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="rounded-xl border border-blue-200 bg-white p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">先修课豁免</p>
                                <p className="mt-1 text-sm text-slate-800">{prereqIssue.message}</p>
                              </div>
                              {prereqRequest ? (
                                <span className={`campus-chip text-xs ${getRequestWorkflowTone(prereqRequest)}`}>
                                  {getRequestWorkflowLabel(prereqRequest)}
                                </span>
                              ) : null}
                            </div>
                            {prereqRequest && prereqRequestBlocksNewSubmit ? (
                              <div className="mt-2 text-xs text-slate-500">
                                提交于 {formatDateTime(prereqRequest.submittedAt)}
                                {prereqRequest.owner?.facultyProfile?.displayName ? ` · 审核人 ${prereqRequest.owner.facultyProfile.displayName}` : ""}
                                {getWorkflowProgressNote(prereqRequest)
                                  ? ` · ${getWorkflowProgressNote(prereqRequest)}`
                                  : prereqRequest.decisionNote
                                    ? ` · ${prereqRequest.decisionNote}`
                                    : ""}
                              </div>
                            ) : openPrereqRequestSectionId === item.section.id ? (
                              <div className="mt-3 space-y-2">
                                <textarea
                                  className="campus-input min-h-24"
                                  value={prereqOverrideReason}
                                  onChange={(event) => setPrereqOverrideReason(event.target.value)}
                                  placeholder="请说明申请先修课豁免的原因"
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void submitPrereqOverrideRequest(item.section.id)}
                                    disabled={submittingPrereqOverride || prereqOverrideReason.trim().length < 8}
                                    className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {submittingPrereqOverride ? "提交中…" : "提交豁免申请"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenPrereqRequestSectionId("");
                                      setPrereqOverrideReason("");
                                    }}
                                    className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenPrereqRequestSectionId(item.section.id);
                                  setPrereqOverrideReason("");
                                }}
                                className="mt-3 inline-flex h-9 items-center rounded-lg border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
                              >
                                申请先修课豁免
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {precheckRan && groupedPrecheckIssues.length > 0 ? (
        <section id="precheck-issues" className="campus-card border-amber-200 bg-amber-50 p-4 md:p-5">
          <h2 className="text-base font-semibold text-amber-900">预检问题</h2>
          <p className="mt-1 text-sm text-amber-800">解决以下问题前，提交可能会失败。</p>
          <div className="mt-3 space-y-3">
            {groupedPrecheckIssues.map((group) => (
              <div key={group.key} className={`rounded-xl border border-amber-200 border-l-4 bg-white p-3 ${group.issues[0] ? issueSeverityStyles(group.issues[0].reasonCode) : ""}`}>
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
                    跳转到该行
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
            <h2 className="text-base font-semibold text-slate-900">预检状态预览</h2>
            <span className="text-xs text-slate-500">{precheckPreview.length} 个教学班</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">当前提交后的预计结果。</p>
          <div className="mt-3 space-y-2">
            {groupedPreview.map((group) => (
              <div key={group.status} className={`rounded-xl border p-3 ${statusBadgeClass(group.status).replace("text-", "border-").split(" ")[0]} bg-white`}>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(group.status)}`}>
                    {enrollmentStatusLabel(group.status)}
                  </span>
                  <span className="text-xs text-slate-500">{group.items.length} 个教学班</span>
                </div>
                <div className="mt-2 grid gap-1">
                  {group.items.map((item) => (
                    <div key={`${item.sectionId}-${item.status}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                      <span className="font-medium text-slate-800">{item.courseCode} §{item.sectionCode}</span>
                      {item.status === "WAITLISTED" && item.waitlistPosition ? (
                        <span className="text-amber-600">候补第 {item.waitlistPosition} 位</span>
                      ) : null}
                      {item.status === "PENDING_APPROVAL" && item.pendingReason === "CREDIT_OVERLOAD" ? (
                        <span className="text-blue-600">超学分审批中</span>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="size-7" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-slate-900">{submitOutcomeSummary.title}</h2>
                <p className="mt-1 text-sm text-emerald-700">{submitOutcomeSummary.detail}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                <Printer className="size-4" />
                打印
              </button>
              <Link
                href={termId ? `/student/schedule?termId=${termId}` : "/student/schedule"}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-700 no-underline transition hover:bg-emerald-50"
              >
                <Share2 className="size-4" />
                查看课表
              </Link>
            </div>
          </div>
          <p className="mt-3 text-xs text-emerald-700">
            {submitOutcomeSummary.followup}{" "}
            <Link href="/student/grades" className="underline underline-offset-2">查看成绩</Link>{" "}
            或{" "}
            <Link href="/student/schedule" className="underline underline-offset-2">查看课表</Link>。
          </p>
          <div className="mt-3 space-y-2">
            {groupedResults.map((group) => (
              <div key={group.status} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(group.status)}`}>
                    {enrollmentStatusLabel(group.status)}
                  </span>
                  <span className="text-xs text-slate-500">{group.items.length} 个教学班</span>
                </div>
                <div className="mt-2 grid gap-1">
                  {group.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-800">
                          {item.section.course?.code ? `${item.section.course.code} §` : "§"}
                          {item.section.sectionCode}
                        </span>
                        {item.status === "WAITLISTED" ? (
                          <span className="ml-2 text-amber-600">
                            候补第 {waitlistPositions[item.sectionId] ?? item.waitlistPosition ?? "—"} 位
                          </span>
                        ) : null}
                      </div>
                      {item.section.course?.title ? <span className="ml-2 truncate text-slate-500">{item.section.course.title}</span> : null}
                      {item.status === "PENDING_APPROVAL" && item.pendingReason === "CREDIT_OVERLOAD" ? (
                        <span className="ml-2 shrink-0 text-blue-600">超学分审批中</span>
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
          <h2 className="text-base font-semibold text-red-800">提交失败详情</h2>
          <p className="mt-1 text-sm text-red-700">未能完成注册，请修正以下问题后重新提交。</p>
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
                    跳转到该行
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

      {swapSource ? (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setSwapSource(null)}>
          <div className="campus-card max-w-md mx-auto mt-20 p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">换班</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {swapSource.section.course.code} 当前为 §{swapSource.section.sectionCode}
                </p>
              </div>
              <button type="button" onClick={() => setSwapSource(null)} className="text-slate-400 hover:text-slate-600">
                ×
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {loadingSwapOptions ? (
                <p className="text-sm text-slate-500">加载中…</p>
              ) : swapCandidates.length === 0 ? (
                <p className="text-sm text-slate-500">没有可换的其他班级。</p>
              ) : (
                swapCandidates.map((section) => {
                  const enrolled = (section.enrollments ?? []).filter((item) => item.status === "ENROLLED").length;
                  const remaining = section.capacity > 0 ? section.capacity - enrolled : Number.POSITIVE_INFINITY;
                  const disabled = section.capacity > 0 && remaining <= 0;
                  return (
                    <label
                      key={section.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 ${
                        swapTargetId === section.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"
                      } ${disabled ? "opacity-50" : ""}`}
                    >
                      <input
                        type="radio"
                        name="swap-section"
                        value={section.id}
                        checked={swapTargetId === section.id}
                        disabled={disabled}
                        onChange={() => setSwapTargetId(section.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">§{section.sectionCode}</p>
                        <p className="text-xs text-slate-500">{section.instructorName}</p>
                        <p className="text-xs text-slate-500">
                          {section.meetingTimes.map((meeting) => `${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][meeting.weekday]} ${fmt(meeting.startMinutes)}-${fmt(meeting.endMinutes)}`).join(" / ")}
                        </p>
                        <p className="text-xs text-slate-400">
                          {section.capacity === 0 ? "剩余名额：不限" : `剩余名额：${Math.max(0, remaining)}`}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSwapSource(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmSwap()}
                disabled={!swapTargetId || swapping}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
              >
                {swapping ? "换班中…" : "确认换班"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
