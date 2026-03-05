# SIS 生产化自动化报告（2026-03-05 02:39:08, America/Phoenix）

## 变更
- 后端硬化（P1 安全，1 项）
- 在 `apps/api/src/main.ts` 增加 CSRF token 双提交校验：非安全方法需同时满足 `csrf_token` cookie 与 `x-csrf-token` 请求头一致；并保留原有 Origin 白名单校验。
- 增加可配置项：`CSRF_COOKIE_NAME`、`CSRF_HEADER_NAME`、`CSRF_EXEMPT_PATHS`。
- 在 `apps/api/src/auth/auth.service.ts` 登录后签发 CSRF token cookie，登出时清理；新增 `issueCsrfToken`。
- 在 `apps/api/src/auth/auth.controller.ts` 新增 `GET /auth/csrf-token`（需登录）用于轮换/刷新 token。
- 更新 `.env.example` 与 `apps/api/.env.example`，补充上述 CSRF 配置示例。

- 前端修复（1 项）
- 在 `apps/web/lib/api.ts`：对非 `GET/HEAD/OPTIONS/TRACE` 请求自动从浏览器 cookie 读取 `csrf_token` 并附加 `x-csrf-token`。
- 在 `apps/web/lib/server-api.ts`：服务端调用 API 的非安全方法同样自动附带 `x-csrf-token`，避免 SSR/Server-side 回归。

## 验证结果
- 已按固定顺序执行：
- `pnpm readiness:check`：通过（22 pass, 0 warn, 0 fail）。
- `pnpm --filter @sis/api build`：通过。
- `pnpm --filter web exec tsc --noEmit`：通过。

- 服务可用性与关键接口验证：受阻
- 运行环境无法访问 Docker daemon（`/Users/yihengli/.docker/run/docker.sock` 被沙箱拒绝），无法拉起 PostgreSQL。
- API 启动时 Prisma 报错 `P1001 Can't reach database server at localhost:5432`，因此 `health` 与关键接口 e2e/smoke 无法在本轮完成。
- 额外发现：`pnpm --filter @sis/api dev` 在当前环境触发 `EMFILE: too many open files, watch`（watch 模式句柄上限风险）。

## 遗留风险
- 运行风险：未完成在线接口复测（阻塞于 DB 依赖不可启动）。
- 运维风险：开发/巡检场景使用 watch 模式可能频繁触发 `EMFILE`，影响应急排障速度。
- 安全风险：CSRF 目前为双提交 token + Origin 校验，但尚未增加 token 生命周期审计指标（轮换频率、失败率告警阈值）。

## CTO 视角问题与改进
- 问题：生产化准入链路对本地基础依赖（DB/Docker）缺少“硬前置检查 + 明确失败分层”。
- 改进：在自动化入口增加 `infra preflight`（Docker socket、5432 连通、迁移状态），失败即短路并输出机器可读阻塞码。
- 问题：安全改造已落地但缺 observability 闭环。
- 改进：下一轮在 `/ops/metrics` 增加 CSRF 拒绝计数（按路由/原因）并配告警阈值。

## 用户视角问题与改进
- 问题：若客户端未携带 CSRF header，用户只看到 403，定位成本高。
- 改进：前端对 `CSRF_TOKEN_INVALID` 做统一提示（如“会话安全令牌过期，请刷新后重试”）并自动调用 `/auth/csrf-token` 重试一次。
- 问题：关键流程回归状态对业务方不可见。
- 改进：将 e2e 关键接口结果汇总到固定看板（成功率/最近失败原因）。

## 下一步
- 需要输入/解除阻塞：
- 允许本环境访问 Docker daemon 或提供可用 PostgreSQL（`localhost:5432`）以完成服务级复测。

- 解阻后立即执行：
- `pnpm test:e2e:api`
- `pnpm smoke:web`
- 关键接口抽样：`/health`、`/ops/metrics`、`/auth/login`、`/registration/precheck`、`/admin/waitlist/promote`

- 下一轮优先项（保持“1 后端 + 1 前端”）：
- 后端：监控告警落地（CSRF 失败率、登录失败率、备份 sidecar 健康阈值）。
- 前端：CSRF 失败自动恢复与用户提示完善。
