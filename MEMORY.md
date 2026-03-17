# MEMORY

## Gate

- 2026-03-14: 557 pass, 0 warn, 0 fail
- 2026-03-16: 557 pass, 0 warn, 0 fail
- 2026-03-16: 568 pass, 0 warn, 0 fail
- 2026-03-16: 593 pass, 0 warn, 0 fail
- 2026-03-16: 615 pass, 0 warn, 0 fail
- 2026-03-16: 627 pass, 0 warn, 0 fail
- 2026-03-17: 641 pass, 0 warn, 0 fail

## Entries

- 272. Implemented `/admin/course-pairings` with raw SQL co-enrollment analysis, expandable term breakdown, admin nav wiring, and readiness coverage.
- 273. Implemented `/student/deadlines` as a client-side localStorage deadline tracker with add/delete/complete states, overdue highlighting, and nav wiring.
- 274. Implemented `/admin/retention` with raw SQL cohort retention analysis, offset-based retention matrix UI, admin nav wiring, and readiness coverage.
- 275. Implemented `/student/term-compare` with raw SQL term-by-term GPA/credits/course count analysis, SVG dual-axis trend chart, comparison table, CSV export, and student nav wiring.
- 276. Implemented `/admin/reg-windows` with admin GET/POST/PATCH registration-window management over term open/close timestamps, inline datetime editing, and tool-nav wiring.
- 277. Implemented `/student/honors` with raw SQL honor determination for dean's list / honors dean's list / academic excellence / full-attendance scholar and a badge-wall student UI.
- 278. Added a notification center with `/notifications`, `/notifications/unread-count`, and `/notifications/:id/read`, plus a global bell dropdown with 30s polling.
- 279. Added student profile completeness with `/students/profile-completeness`, `/students/profile`, a reusable circular completeness card, and upgraded dashboard/profile UX.
- 280. Added `/admin/announcements-mgmt`, `/student/saved-courses`, and audit-log-backed student tags with admin drawer editing and dedicated `/admin/student-tags` route.

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

## Session 22

- A：新增全局 `CommandPalette` 组件，接入 `app-shell`，支持 `Cmd/Ctrl+K`、导航/学生/课程三组搜索与键盘上下选择。
- B：完成移动端壳层改造，支持汉堡菜单 + 滑入侧边栏 + 遮罩关闭；并为 4 个关键表格页面补上 `overflow-x-auto`，KPI 行改为 `campus-kpi-grid` 响应式布局。
- C：新增 admin 批量操作能力，落地 `bulk-enroll / bulk-drop / bulk-update-status` API 与 `/admin/bulk-ops` 三标签页执行中心。
- D：新增功能 275/276/277：`/student/term-compare`、`/admin/reg-windows`、`/student/honors`，并补齐对应 service/controller/page/nav。
- 本轮 gate 实跑结果为 `593 pass, 0 warn, 0 fail`；本次保持 Inter 字体系统与升级后的 campus-* 设计系统不回退。

## Session 23

- A：新增通知中心，落地 `/notifications`、`/notifications/unread-count`、`/notifications/:id/read`，并把铃铛组件接入 app shell 顶栏，支持 30 秒轮询与全部标记已读。
- B：新增双层 `ErrorBoundary` 与集中式 `ToastProvider + useToast`，`quick-add` 已接入新的 toast API，错误与提示不再分散在页面里各自实现。
- C：落地学生档案完整度：新增 `profile-completeness` API、`/students/profile` 保存接口、圆形进度卡片，并升级 `/student/profile` 与 `/student/dashboard` 的完整度展示与编辑体验。
- D：交付功能 278/279/280：`/admin/announcements-mgmt`、`/student/saved-courses`、`/admin/student-tags`，其中学生标签采用审计日志快照方案，避免引入本轮 schema 迁移风险。
- 本轮 gate 实跑结果为 `615 pass, 0 warn, 0 fail`；字体系统保持为 Inter，升级后的 campus-* 设计系统继续沿用且未回退。

## Session 24

- A：补齐演示级 seed 数据，统一为 3 个学期、15 门课程、20 个当前教学班、6 个主演示账号、历史选课记录与 3 条公告，并同步更新登录与 smoke 默认账号密码到 `@univ.edu / *1234!`。
- B：对齐交付级本地部署基线，更新根目录 `docker-compose.yml`、保留现有可用 Dockerfile，并把 `.env.example` 调整到 `horizon_sis / sis_dev_pass / change_me_in_production` 的演示默认值。
- C：完成四项核心流程安全修补核查：明确购物车窗口语义、确认后端 drop deadline 校验生效、确认学生档案接口仅本人可改、确认 `/admin/*` 端点继续受 `ADMIN` 守卫约束；同时补上学生端友好的 `DROP_DEADLINE_PASSED` 提示。
- D：交付功能 281/282/283：`/admin/grade-entry` 成绩批量录入、基于 `/admin/holds` 的 Hold 管理升级、以及带状态徽章/详情展开/新建表单的学生申诉追踪器。
- 本轮 gate 实跑结果为 `627 pass, 0 warn, 0 fail`；readiness 中旧的 future-term seed 断言已替换为当前演示数据检查。

## Session 25

- 修复1：在 `registration.service.ts` 的注册与退课链路里统一使用事务重试 + `SELECT ... FOR UPDATE` 锁住 `Section` 行，并在事务内重算容量与写入/退课，消除并发抢座导致的超卖风险。
- 修复2：waitlist 自动晋升与管理员手动晋升现在都会写入学生可见的 `WAITLIST_PROMOTED` 审计通知，通知铃铛轮询可以直接拾取这类晋升消息。
- 修复3：补齐先修课豁免完整流程，新增学生申请页 `/student/prereq-waivers`、管理员审批页 `/admin/prereq-waivers` 以及对应 endpoints，并复用既有 governance `PREREQ_OVERRIDE` 审批与生效逻辑。
- 修复4/5：课程目录补上实时剩余座位与 `myStatus` 回显（已选/等待中/已在购物车），超学分注册改为 `PENDING_APPROVAL` 队列而非直接拒绝，并新增 `/admin/pending-overloads` 供管理员审批。
- 修复6/7：按入学年份推算注册优先窗口并在 catalog / reg-windows 中展示分年级开放时间；学生课表页新增“显示退课记录”开关，`DROPPED` 课程可带退课时间回看但默认不干扰主课表。
- 本轮 gate 实跑结果为 `641 pass, 0 warn, 0 fail`。
