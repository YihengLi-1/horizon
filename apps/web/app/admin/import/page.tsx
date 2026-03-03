"use client";

import { FormEvent, useMemo, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

type ImportTarget = "students" | "courses" | "sections";

type ImportResult = {
  created: number;
  dryRun?: boolean;
  wouldCreate?: number;
  skipped?: number;
  idempotencyReused?: boolean;
};

type CsvRowError = {
  rowNumber: number;
  field: string;
  message: string;
};

type ImportPayload = {
  csv: string;
  dryRun: boolean;
  idempotencyKey?: string;
};

const TARGET_META: Record<ImportTarget, { label: string; title: string; hint: string; required: string[] }> = {
  students: {
    label: "Students",
    title: "Import Student Accounts",
    hint: "Strict mode: if any row is invalid, entire import fails.",
    required: ["email", "studentId", "legalName"]
  },
  courses: {
    label: "Courses",
    title: "Import Course Catalog",
    hint: "Use stable course code and numeric credits.",
    required: ["code", "title", "credits"]
  },
  sections: {
    label: "Sections",
    title: "Import Section Offerings",
    hint: "Course code and term name must match existing records.",
    required: ["courseCode", "termName", "sectionCode", "modality", "capacity", "credits", "instructorName"]
  }
};

const EXAMPLES: Record<ImportTarget, string> = {
  students: `email,studentId,legalName,password
carol@student.edu,S1003,Carol Davis,Student123!
dave@student.edu,S1004,Dave Evans,Student123!`,
  courses: `code,title,credits,description
CS301,Algorithms,3,Algorithm design and analysis
CS302,Operating Systems,3,OS concepts and design`,
  sections: `courseCode,termName,sectionCode,modality,capacity,credits,instructorName,location
CS101,Spring 2026,A,ON_CAMPUS,30,3,Dr. Smith,Room 101
CS101,Spring 2026,B,ONLINE,25,3,Dr. Jones,`
};

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `import-${crypto.randomUUID()}`;
  }
  return `import-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function ResultAlert({ result }: { result: ImportResult }) {
  const isDryRun = Boolean(result.dryRun);
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${isDryRun ? "border-blue-200 bg-blue-50 text-blue-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
      <p className="font-semibold">{isDryRun ? "Dry run complete" : "Import complete"}</p>
      {isDryRun ? (
        <p>Would create: {result.wouldCreate ?? 0}</p>
      ) : (
        <p>Created: {result.created}</p>
      )}
      {result.skipped !== undefined ? <p>Skipped: {result.skipped}</p> : null}
      {result.idempotencyReused ? <p>Idempotency replay: returning cached result.</p> : null}
    </div>
  );
}

function RowErrors({ errors }: { errors: CsvRowError[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-white">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-red-100 bg-red-50 text-left">
            <th className="px-2 py-1 font-semibold text-red-700">Row</th>
            <th className="px-2 py-1 font-semibold text-red-700">Field</th>
            <th className="px-2 py-1 font-semibold text-red-700">Message</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((row, index) => (
            <tr key={`${row.rowNumber}-${row.field}-${index}`} className="border-b border-red-100/70 last:border-b-0">
              <td className="px-2 py-1 text-red-800">{row.rowNumber}</td>
              <td className="px-2 py-1 text-red-800">{row.field}</td>
              <td className="px-2 py-1 text-red-700">{row.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ImportPage() {
  const [target, setTarget] = useState<ImportTarget>("students");
  const [csv, setCsv] = useState("");
  const [showExample, setShowExample] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<CsvRowError[]>([]);
  const [loading, setLoading] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey());
  const [lastPayload, setLastPayload] = useState<ImportPayload | null>(null);

  const meta = TARGET_META[target];
  const example = EXAMPLES[target];

  const rowCount = useMemo(() => {
    if (!csv.trim()) return 0;
    const lines = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean).length;
    return Math.max(0, lines - 1);
  }, [csv]);

  const executeImport = async (payload: ImportPayload) => {
    setError("");
    setResult(null);
    setRowErrors([]);
    setLoading(true);

    try {
      const response = await apiFetch<ImportResult>(`/admin/import/${target}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setResult(response);
      setLastPayload(payload);
      if (!payload.dryRun) {
        setCsv("");
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "CSV_ROW_INVALID" && Array.isArray(err.details)) {
        setError(err.message || "CSV validation failed");
        setRowErrors(err.details as CsvRowError[]);
      } else {
        setError(err instanceof Error ? err.message : "Import failed");
      }
      setLastPayload(payload);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedKey = idempotencyKey.trim();
    await executeImport({
      csv,
      dryRun,
      idempotencyKey: normalizedKey ? normalizedKey : undefined
    });
  };

  const retryLast = async () => {
    if (!lastPayload || loading) return;
    await executeImport(lastPayload);
  };

  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <p className="campus-eyebrow">Bulk Data Operations</p>
            <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">CSV Import</h1>
            <p className="text-sm text-slate-600 md:text-base">
              Load students, courses, and sections with strict validation, dry-run, and idempotent retries.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">Target: {meta.label}</span>
              <span className="campus-chip border-slate-300 bg-slate-50 text-slate-700">{Math.max(rowCount, 0)} data row(s)</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 1</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Choose import target</p>
        </div>
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 2</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Dry-run and validate all rows</p>
        </div>
        <div className="campus-kpi border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step 3</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">Commit with same idempotency key</p>
        </div>
      </section>

      <section className="campus-toolbar">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Import target</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TARGET_META) as ImportTarget[]).map((item) => {
            const active = item === target;
            return (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setTarget(item);
                  setCsv("");
                  setResult(null);
                  setError("");
                  setRowErrors([]);
                  setLastPayload(null);
                }}
                className={`inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold transition ${
                  active
                    ? "border-slate-700 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {TARGET_META[item].label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="campus-card p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{meta.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{meta.hint}</p>
            </div>
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              Fail-fast validation
            </span>
          </div>

          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <textarea
              required
              rows={14}
              placeholder={`Paste ${meta.label.toLowerCase()} CSV here...`}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-slate-50/70 px-3 py-3 font-mono text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />

            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="size-4 accent-slate-900"
                  checked={dryRun}
                  onChange={(event) => setDryRun(event.target.checked)}
                />
                Dry run only (no writes)
              </label>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Idempotency Key</p>
                <div className="flex gap-2">
                  <input
                    className="campus-input font-mono text-xs"
                    value={idempotencyKey}
                    onChange={(event) => setIdempotencyKey(event.target.value)}
                    placeholder="import-xxxx"
                  />
                  <button
                    type="button"
                    onClick={() => setIdempotencyKey(generateIdempotencyKey())}
                    className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Regenerate
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Use the same key when retrying to avoid duplicate writes.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <button
                type="button"
                onClick={() => setShowExample((prev) => !prev)}
                className="font-semibold text-slate-700 underline underline-offset-2"
              >
                {showExample ? "Hide example CSV" : "Show example CSV"}
              </button>
              <span>{Math.max(rowCount, 0)} rows detected (excluding header)</span>
            </div>

            {showExample ? (
              <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                {example}
              </pre>
            ) : null}

            {error ? (
              <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <p>{error}</p>
                <RowErrors errors={rowErrors} />
              </div>
            ) : null}

            {result ? <ResultAlert result={result} /> : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Running...
                  </>
                ) : dryRun ? (
                  `Dry Run ${meta.label}`
                ) : (
                  `Import ${meta.label}`
                )}
              </button>
              <button
                type="button"
                disabled={!lastPayload || loading}
                onClick={() => void retryLast()}
                className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Retry last request
              </button>
            </div>
          </form>
        </section>

        <aside className="space-y-4">
          <section className="campus-card p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-700">Required Headers</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-600">
              {meta.required.map((item) => (
                <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs">
                  {item}
                </li>
              ))}
            </ul>
          </section>
          <section className="campus-card p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-700">Reliability Policy</h3>
            <ul className="mt-2 space-y-2 text-sm text-slate-600">
              <li>Dry-run first for schema and duplicate validation.</li>
              <li>Any invalid row fails the entire import.</li>
              <li>Use idempotency key + retry to prevent duplicate writes.</li>
              <li>Commit import only after dry-run report is clean.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
