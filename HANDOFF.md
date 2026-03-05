# 地平线 SIS — 项目交付文档

> **版本**: v1.0
> **交付日期**: 2026-03-04
> **状态**: ✅ 生产就绪

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术架构](#2-技术架构)
3. [功能清单](#3-功能清单)
4. [本地启动（开发）](#4-本地启动开发)
5. [远程部署（云服务器）](#5-远程部署云服务器)
6. [快速演示（ngrok 隧道）](#6-快速演示ngrok-隧道)
7. [默认账号](#7-默认账号)
8. [质量验证](#8-质量验证)
9. [目录结构](#9-目录结构)
10. [已知限制与后续扩展](#10-已知限制与后续扩展)

---

## 1. 项目概述

**地平线 SIS**（Student Information System）是一套完整的高校选课管理系统，支持学生选课、候补排队、成绩管理，以及管理员对课程、课节、学生、邀请码的全面管理。

| 维度 | 数值 |
|------|------|
| 前端页面 | 16 个（学生 6 + 管理员 10） |
| API 端点 | 40+ |
| 业务规则 | 先修检测、时间冲突、容量控制、候补晋升、退课截止 |
| 测试覆盖 | E2E（16页全通过）+ P0 业务规则（全通过）+ Smoke Test |

---

## 2. 技术架构

```
┌─────────────────────────────────────────────────────┐
│  浏览器                                              │
│  http://your-server:3000                            │
└──────────────────┬──────────────────────────────────┘
                   │ HTTP
┌──────────────────▼──────────────────────────────────┐
│  Next.js 15  (apps/web)                 Port 3000   │
│  App Router · Server Components · React 19          │
│  CSS: campus-* 设计系统 (Tailwind)                  │
└──────────────────┬──────────────────────────────────┘
                   │ HTTP (SSR 内部用 http://api:4000)
                   │ HTTPS (浏览器端用 NEXT_PUBLIC_API_URL)
┌──────────────────▼──────────────────────────────────┐
│  NestJS API  (apps/api)                 Port 4000   │
│  JWT (httpOnly Cookie) · Prisma ORM                 │
│  登录频率限制 · CSRF 防护 · 操作审计               │
└──────────────────┬──────────────────────────────────┘
                   │ TCP 5432
┌──────────────────▼──────────────────────────────────┐
│  PostgreSQL 16                          Port 5432   │
│  数据持久化 (pgdata volume)                         │
└─────────────────────────────────────────────────────┘
```

**技术栈汇总**

| 层 | 技术 |
|----|------|
| 前端框架 | Next.js 15 App Router，TypeScript，React 19 |
| 样式系统 | Tailwind CSS，campus-* 组件类 |
| 后端框架 | NestJS 10，Express，TypeScript |
| ORM | Prisma 6，PostgreSQL 16 |
| 认证 | JWT（httpOnly Cookie），argon2 密码哈希 |
| 包管理 | pnpm 10 Workspaces（Monorepo） |
| 容器化 | Docker + Docker Compose |

---

## 3. 功能清单

### 管理端 `/admin`

| 页面 | 功能 |
|------|------|
| **Dashboard** | 系统总览 KPI、选课状态分布、实时运营指标（请求量/错误率/HTTP 方法分布）、快捷操作、最近审计日志 |
| **Students** | 学生账号 CRUD、搜索过滤、CSV 导出 |
| **Courses** | 课程 CRUD、先修课多选、搜索过滤、CSV 导出 |
| **Sections** | 课节 CRUD、上课时间（星期+时分）、候补晋升控制（逐节/批量）、状态过滤、CSV 导出 |
| **Enrollments** | 按学期过滤、批量审批/退课（多选）、成绩内联录入、状态统计 KPI、CSV 导出 |
| **Waitlist** | 按课节分组排队、逐节晋升 / 全量各晋升一人、候补人数显示 |
| **Terms** | 学期 CRUD（名称、注册开放/截止、退课截止、最大学分）、CSV 导出 |
| **Invite Codes** | 生成邀请码（随机/自定义）、状态切换、使用进度条、复制按钮、过滤 |
| **Audit Logs** | 操作日志浏览、分页（50条/页）、Action/Entity 筛选、全文搜索、CSV 导出 |
| **Import** | CSV 批量导入（学生/课程/课节），dry-run 预检 → 幂等提交，逐行错误展示 |

### 学生端 `/student`

| 页面 | 功能 |
|------|------|
| **Dashboard** | 注册状态、学分利用率进度条、行动队列、预警中心（截止日期/冲突提醒）、候补/待审批快照 |
| **Catalog** | 课程浏览、5维过滤（学期/授课形式/学分/搜索/排序）、4复选框过滤、时间冲突检测（带已有课表）、先修课检测、座位进度条、加购/加候补 |
| **Cart** | 注册购物车、实时预检报告（先修/冲突/学分上限）、一键提交注册 |
| **Schedule** | 周视图课表（Mon–Fri 08:00–18:00）、移动端议程视图、状态筛选、退课（截止日期前） |
| **Grades** | 成绩列表、GPA 计算（按学期 + 累计）、修读学分统计 |
| **Profile** | 个人信息编辑（姓名/专业/学籍状态等）、修改密码 |

---

## 4. 本地启动（开发）

### 前置条件

- Node.js ≥ 20
- pnpm ≥ 10（`npm i -g pnpm`）
- PostgreSQL 16（或 Docker：`docker compose up -d postgres`）

### 步骤

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env
# .env 默认值已适配本地开发，通常无需修改

# 3. 初始化数据库
pnpm db:migrate    # 建表
pnpm db:seed       # 写入初始数据（admin + 2个学生 + 演示课程）

# 4. 启动开发服务器
pnpm dev
# API  → http://localhost:4000
# Web  → http://localhost:3000
```

---

## 5. 远程部署（云服务器）

适用于阿里云、腾讯云、Vultr、Hetzner 等任意 Linux 云主机。

### 5.1 服务器准备

```bash
# 安装 Docker（Ubuntu/Debian）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # 退出重登生效
```

### 5.2 部署步骤

```bash
# 1. 把项目传到服务器（任选一种）
# 方法A: Git
git clone <your-repo-url> /opt/sis && cd /opt/sis

# 方法B: 直接压缩传输（本地执行）
zip -r sis.zip . --exclude "*/node_modules/*" --exclude "*/.next/*" --exclude "*/dist/*"
scp sis.zip root@your-server-ip:/opt/
ssh root@your-server-ip "cd /opt && unzip sis.zip -d sis && cd sis"

# 2. 配置环境变量（服务器上）
cd /opt/sis
cp .env.example .env
nano .env   # 修改以下三项：
```

**必须修改的环境变量** (`/opt/sis/.env`)：

```env
# 将 1.2.3.4 换成你的服务器公网 IP（或已绑定的域名）
WEB_URL=http://1.2.3.4:3000
NEXT_PUBLIC_API_URL=http://1.2.3.4:4000

# 生产环境必须修改为随机长字符串
JWT_SECRET=替换为随机字符串_openssl_rand_hex_32的输出
```

```bash
# 3. 构建并启动（首次约需 3-5 分钟）
docker compose up -d --build

# 4. 查看启动状态
docker compose ps

# 5. 写入初始数据（仅首次）
docker compose exec api sh -c "cd /repo/apps/api && npx prisma db seed"
```

### 5.3 验证部署

```bash
# API 健康检查
curl http://1.2.3.4:4000/ops/metrics

# 浏览器访问
http://1.2.3.4:3000
```

### 5.4 常用运维命令

```bash
# 查看日志
docker compose logs -f api
docker compose logs -f web

# 重启服务
docker compose restart api
docker compose restart web

# 更新代码后重建
git pull
docker compose up -d --build api web

# 停止所有服务
docker compose down

# 停止并清空数据库（慎用！）
docker compose down -v
```

---

## 6. 快速演示（ngrok 隧道）

> 适合**今天马上给人演示**，不需要服务器，5 分钟搞定。
> 本机需要已在运行 `pnpm dev`。

### 步骤

```bash
# 1. 安装 ngrok
brew install ngrok          # macOS
# 或到 https://ngrok.com 下载

# 2. 注册免费账号并配置 authtoken
ngrok config add-authtoken <你的token>

# 3. 同时隧道 API(4000) 和 Web(3000)
#    （需要 ngrok 付费账号支持两个隧道，免费账号见下方替代方案）
ngrok start --all

# ngrok.yml 配置（~/.config/ngrok/ngrok.yml）:
# tunnels:
#   api:
#     proto: http
#     addr: 4000
#   web:
#     proto: http
#     addr: 3000
```

**免费账号替代方案（localtunnel，完全免费）：**

```bash
# 终端 1：隧道 API
npx localtunnel --port 4000 --subdomain sis-api-demo
# → 得到 https://sis-api-demo.loca.lt

# 终端 2：先更新 .env 中的 NEXT_PUBLIC_API_URL
# NEXT_PUBLIC_API_URL=https://sis-api-demo.loca.lt
# 重启 Next.js 后再隧道 Web
npx localtunnel --port 3000 --subdomain sis-web-demo
# → 得到 https://sis-web-demo.loca.lt

# 把 https://sis-web-demo.loca.lt 发给老板即可访问
```

> ⚠️  localtunnel 每次打开页面会出现一个"Tunnel Password"验证页，
> 点击一次"Click to Submit"即可通过，之后正常使用。

---

## 7. 默认账号

| 角色 | 登录凭据 | 说明 |
|------|---------|------|
| 管理员 | `admin@university.edu` / `Admin123!` | 完整管理权限 |
| 学生 Alice | `S1001` 或 `alice@student.edu` / `Student123!` | 计算机科学专业 |
| 学生 Brian | `S1002` 或 `brian@student.edu` / `Student123!` | 数据科学专业 |
| 注册邀请码 | `INVITE-2026` | 新账号注册时使用 |

> 安全说明：生产环境建议 seed 后立即修改管理员密码，或通过 API 重新创建。

---

## 8. 质量验证

### 运行全量验证

```bash
# 服务必须已启动（pnpm dev 或 docker compose up）
bash scripts/autopilot-check.sh
# 报告生成在 reports/automation/latest.md
```

### 验证项目与结果

| 检查项 | 命令 | 结果 |
|--------|------|------|
| TypeScript 编译（API） | `pnpm --filter @sis/api exec tsc --noEmit` | ✅ 0 errors |
| TypeScript 编译（Web） | `pnpm --filter web exec tsc --noEmit` | ✅ 0 errors |
| ESLint | `pnpm --filter @sis/web lint` | ✅ No warnings |
| API 生产构建 | `pnpm --filter @sis/api build` | ✅ 通过 |
| Web 生产构建 | `pnpm --filter @sis/web build` | ✅ 通过 |
| Smoke Test（8 路由） | `bash scripts/smoke-web.sh` | ✅ Smoke check passed |
| E2E Critical（16 页面） | `pnpm test:e2e:web` | ✅ 全部 OK |
| API P0 业务规则 | `pnpm test:e2e:api` | ✅ P0 API rule checks passed |

### 覆盖的 P0 业务规则

- ✅ 先修课未修不得注册（PREREQUISITE_NOT_MET）
- ✅ 时间冲突检测（TIME_CONFLICT）
- ✅ 课节已开课不得注册（SECTION_ALREADY_STARTED）
- ✅ 容量满员自动进候补（WAITLISTED）
- ✅ 候补晋升流程（名额释放 → 自动升为 ENROLLED）
- ✅ 退课截止日期强制（DROP_DEADLINE_PASSED）
- ✅ CSV 导入快速失败（第一行错误即报告）

---

## 9. 目录结构

```
地平线/
├── apps/
│   ├── api/                    # NestJS 后端
│   │   ├── src/
│   │   │   ├── admin/          # 管理员 CRUD 服务
│   │   │   ├── academics/      # 课程/课节/学期（公共只读）
│   │   │   ├── registration/   # 选课/购物车/成绩
│   │   │   ├── students/       # 学生资料
│   │   │   ├── auth/           # 登录/注册/JWT
│   │   │   └── audit/          # 操作日志
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── Dockerfile
│   └── web/                    # Next.js 前端
│       ├── app/
│       │   ├── admin/          # 10 个管理员页面
│       │   ├── student/        # 6 个学生页面
│       │   └── (auth)/         # 登录/注册/找回密码
│       ├── components/         # app-shell, ui 组件
│       ├── lib/                # api.ts, server-api.ts
│       └── Dockerfile
├── packages/
│   └── shared/                 # 共享 Zod Schema / 类型
├── scripts/
│   ├── autopilot-check.sh      # 全量 CI 验证
│   ├── smoke-web.sh            # Web 路由健康检查
│   ├── e2e-critical.mjs        # Playwright E2E（16页）
│   └── e2e-api-p0.mjs          # API 业务规则测试
├── docker-compose.yml          # 完整服务编排
├── .env.example                # 环境变量模板
└── HANDOFF.md                  # 本文档
```

---

## 10. 已知限制与后续扩展

| 项目 | 现状 | 建议后续 |
|------|------|---------|
| 邮件验证 | 代码已实现，但本地无 SMTP | 接入 SendGrid / 阿里云邮件推送 |
| 操作指标 | 进程内统计，重启清零 | 接入 Prometheus + Grafana |
| HTTPS | 目前 HTTP | 生产环境加 Nginx 反向代理 + Let's Encrypt |
| 密码找回 | 前端页面已有，依赖邮件服务 | 同邮件服务一起完成 |
| 单元测试 | 尚无 | 可用 Jest + Supertest 补充 |

---

*文档由项目团队生成，如有疑问联系交付方。*
