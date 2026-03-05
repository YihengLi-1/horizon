"use client";

export default function CoursesError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="campus-page">
      <section className="campus-hero">
        <p className="campus-eyebrow">Course Management</p>
        <h1 className="font-heading text-4xl font-bold text-slate-900 md:text-5xl">
          Something went wrong
        </h1>
      </section>
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        <p className="font-semibold">Failed to load courses.</p>
        <p className="mt-1 text-red-600">{error.message}</p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-10 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}
