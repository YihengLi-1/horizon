export default function ImportLoading() {
  return (
    <div className="campus-page animate-pulse">
      <section className="campus-hero">
        <div className="space-y-3">
          <div className="h-3 w-28 rounded-full bg-slate-200" />
          <div className="h-10 w-36 rounded-xl bg-slate-200" />
          <div className="h-4 w-80 rounded-lg bg-slate-200" />
        </div>
      </section>

      {/* Step selector */}
      <div className="campus-card p-5 space-y-3">
        <div className="h-4 w-28 rounded-lg bg-slate-200" />
        <div className="grid gap-2 md:grid-cols-3">
          {["Students", "Courses", "Sections"].map((t) => (
            <div key={t} className="h-10 rounded-xl bg-slate-200" />
          ))}
        </div>
      </div>

      {/* Upload area */}
      <div className="campus-card p-8 flex flex-col items-center gap-4">
        <div className="h-12 w-12 rounded-full bg-slate-200" />
        <div className="h-4 w-48 rounded-lg bg-slate-200" />
        <div className="h-3 w-64 rounded-full bg-slate-200" />
        <div className="h-10 w-36 rounded-xl bg-slate-200" />
      </div>
    </div>
  );
}
