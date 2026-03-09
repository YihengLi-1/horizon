# 地平线 SIS 部署手册

## 快速开始（开发环境）
- 前置要求：Node.js 20+、pnpm、PostgreSQL 或 Docker
- 步骤：
  1. `git clone <repo-url>`
  2. `cd 地平线`
  3. `cp .env.example .env`
  4. 填写 `.env` 中的必填项
  5. `pnpm install`
  6. `pnpm dev`

## 生产部署（Docker Compose）
- 前置要求：Docker 24+、Docker Compose v2
- 推荐启动方式：`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`
- 步骤：
  1. `cp .env.example .env` 并填写所有生产值
  2. `docker compose build`
  3. `docker compose up -d postgres`
  4. `pnpm db:migrate` 或 `docker compose exec api npx prisma migrate deploy`
  5. `pnpm db:seed`（首次初始化演示数据）
  6. `docker compose up -d`
  7. `pnpm readiness:check`
- 访问地址：
  - Web: `http://host:80`（通过 nginx）
  - API 直连: `http://host:4000`
  - Grafana: `http://host:3001`
  - Prometheus: `http://host:9090`
  - Alertmanager: `http://host:9093`
- 生产建议：
  - 浏览器流量统一走 nginx 时，将 `NEXT_PUBLIC_API_URL` 设置为 `https://your-domain/api`
  - `WEB_URL` 和 `CSRF_ALLOWED_ORIGINS` 填为外部访问域名
  - 首次启动后立即修改默认密码与 Grafana 管理员密码

## 必填环境变量说明
- `DATABASE_URL`：PostgreSQL 连接串
- `JWT_SECRET`：JWT 签名密钥，生产必须使用强随机值
- `SMTP_*`：邮件通知与告警邮件配置
- `CORS_ORIGIN`：如果你的部署流程使用单独的 CORS 变量，请与 `WEB_URL` / `CSRF_ALLOWED_ORIGINS` 保持一致
- `GRAFANA_ADMIN_PASSWORD`：Grafana 管理员密码
- `ALERT_EMAIL`：接收 Alertmanager 告警的邮箱
- `SIS_TIMEZONE`：学校时区，例如 `America/Los_Angeles`；用于 iCal 导出与机构级时间显示
- `ENABLE_PUBLIC_SCHEDULE_SHARING`：默认 `false`；除非你已补齐过期/撤销控制，否则不要启用
- `NEXT_PUBLIC_ENABLE_PUBLIC_SCHEDULE_SHARING`：前端分享按钮开关，必须与后端开关保持一致

## 监控告警
- Grafana 默认账号：`admin / sis-grafana-2026`（生产必须修改）
- Prometheus 采集间隔：10 秒，数据保留 15 天
- Alertmanager 告警邮件：填写 `ALERT_EMAIL` 与 `SMTP_*` 后自动生效
- API Prometheus 指标：`/ops/metrics/prometheus`

## 备份恢复
- 自动备份：`postgres-backup` 服务每天 02:30 执行
- 恢复演练：`pnpm backup:restore:drill`
- 备份文件位置：Docker volume `pgbackups`

## CI/CD (GitHub Actions)

The workflow at `.github/workflows/ci.yml` runs on every push/PR:
- TypeScript typecheck (web)
- NestJS build (api)
- Prisma client generation
- Static readiness checks

### Required GitHub Secrets
Set these in repo Settings → Secrets → Actions:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — JWT signing secret (min 32 chars)
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` — SMTP credentials

## Smoke Test
```bash
# After docker compose up:
node scripts/e2e-api-p0.mjs

# Full docker smoke:
bash scripts/smoke-docker.sh
```

## 常用运维命令
- `pnpm readiness:check`：系统健康检查（目标：0 warn / 0 fail）
- `docker compose logs -f api`：查看 API 日志
- `docker compose restart api`：重启 API 服务
- `docker compose exec postgres psql -U postgres -d sis_db`：进入数据库
- `docker compose exec api npx prisma studio --hostname 0.0.0.0 --port 5555`：临时打开 Prisma Studio

## 默认账号（seed 数据，生产前必须修改密码）
- Admin: `admin@sis.edu / Admin@2026!`
- Student: `student1@sis.edu / Student@2026!`

## 交付范围说明
- 当前系统定位为“学生自助 + registrar/admin 学术运营门户”。
- 当前交付不包含 faculty/advisor actor accounts、学费/账单、financial aid、degree audit。
- 如果客户要求完整 SIS，请先扩展域模型和权限边界，再进入生产交付。
