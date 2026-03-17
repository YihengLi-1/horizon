import { SkeletonKpiRow } from "@/components/skeleton-kpi-row";
import { SkeletonTable } from "@/components/skeleton-table";

export default function StudentDashboardLoading() {
  return (
    <div className="campus-page">
      <section className="campus-hero">
        <div className="skeleton skeleton-text w-32" />
        <div className="skeleton skeleton-title mt-4 w-56" />
        <div className="skeleton skeleton-text mt-3 w-80 max-w-full" />
      </section>

      <SkeletonKpiRow count={4} />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SkeletonTable rows={6} cols={4} />
        <div className="campus-card p-5">
          <div className="skeleton skeleton-title w-32" />
          <div className="mt-4 space-y-3">
            <div className="skeleton skeleton-card h-20" />
            <div className="skeleton skeleton-card h-20" />
            <div className="skeleton skeleton-card h-20" />
          </div>
        </div>
      </div>
    </div>
  );
}
