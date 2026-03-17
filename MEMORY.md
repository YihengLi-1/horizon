# MEMORY

## Gate

- 2026-03-14: 557 pass, 0 warn, 0 fail
- 2026-03-16: 557 pass, 0 warn, 0 fail
- 2026-03-16: 568 pass, 0 warn, 0 fail

## Entries

- 272. Implemented `/admin/course-pairings` with raw SQL co-enrollment analysis, expandable term breakdown, admin nav wiring, and readiness coverage.
- 273. Implemented `/student/deadlines` as a client-side localStorage deadline tracker with add/delete/complete states, overdue highlighting, and nav wiring.
- 274. Implemented `/admin/retention` with raw SQL cohort retention analysis, offset-based retention matrix UI, admin nav wiring, and readiness coverage.

## Session 21

- Swapped the app typography to Inter in `/apps/web/app/layout.tsx` and rebuilt the design tokens in `/apps/web/app/globals.css` for a cleaner university-portal visual system.
- Refined the core student-facing pages: login, dashboard, catalog, cart, and schedule now use the upgraded hero/card/KPI/table styles with less template-like UI and stronger visual hierarchy.
- Polished `/apps/web/components/app-shell.tsx` into a more credible production shell with a fixed white sidebar, simplified active states, avatar-driven user chrome, and animated main-content entry.
- Verified the registration flow fixes: `hasMeetingConflict()` already honors back-to-back sections, enrolled drops already auto-promote from the waitlist, `quick-add` now shows loading/success/error button states, and cart empty states use the shared `campus-empty` pattern.
- Updated readiness coverage for the new card design-system check and reran the gate cleanly at `557 pass, 0 warn, 0 fail`.
- A：补齐骨架屏系统，新增 `SkeletonTable` / `SkeletonKpiRow`，并接入 student catalog、student schedule、student dashboard、admin dashboard 的加载态。
- B：补齐打印样式，重写 `@media print`，并把 `/student/transcript` 与 `/student/receipt` 收成正式可打印文档。
- C：对 `admin/students`、`admin/courses`、`admin/sections`、`admin/dashboard`、`admin/alerts`、`admin/enrollment-audit` 做了 campus-* 视觉收口，统一 hero/card/table/chip 结构。
- D：新增 `/student/enrollment-log`、`/admin/system-health`、`/student/schedule-image`，并补齐 API、导航与 readiness 检查。
- 本轮 gate 提升到 `568 pass, 0 warn, 0 fail`，字体系统保持为 Inter。
