# 地平线 — 大学学生信息系统

地平线是一套面向高校教务与学生自助服务的学生信息系统，覆盖选课、候补、成绩、学期管理与基础运营流程。

## 技术栈
- NestJS
- Next.js 15
- PostgreSQL
- Prisma
- pnpm monorepo

## 快速启动（本地开发）

### 前置要求
- Node.js 20+
- pnpm 9+
- PostgreSQL 15+（或使用 Docker）

### 1. 克隆并安装依赖
```bash
pnpm install
```

### 2. 配置环境变量
```bash
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local
```

编辑 `apps/api/.env`，至少填写：
- `DATABASE_URL`
- `JWT_SECRET`

如果你使用本地 PostgreSQL，请确认数据库已创建且连接串可用；如果你使用 Docker，可直接使用文末的 Docker 方式启动。

### 3. 初始化数据库
```bash
pnpm --filter @sis/api exec prisma migrate deploy
pnpm --filter @sis/api exec prisma db seed
```

### 4. 启动服务
```bash
# 终端1：API（端口4000）
pnpm --filter @sis/api run dev

# 终端2：前端（端口3000）
pnpm --filter web run dev
```

打开 [http://localhost:3000](http://localhost:3000)

## Docker 一键启动
```bash
docker compose up -d
# 等待健康检查通过后：
docker compose exec api pnpm --filter @sis/api exec prisma db seed
```

## 演示账号
| 角色 | 邮箱 | 密码 |
|------|------|------|
| 管理员 | admin@univ.edu | Admin1234! |
| 学生 | student1@univ.edu | Student1234! |
| 学生2–5 | student2@univ.edu … student5@univ.edu | Student1234! |
| 教师 | faculty1@univ.edu | Faculty1234! |
| 顾问 | advisor1@univ.edu | Advisor1234! |

> 演示邀请码：`OPEN-2026`（可在 `/register` 页面注册新学生账号，限 1000 次使用，有效期至 2027 年底）

## 核心功能
- 学生选课：课程目录 → 购物车 → 预检 → 提交
- 候补队列：满班自动排队，有人退课后自动晋升并通知
- 先修课验证：选课时自动检查，可提交豁免申请
- 成绩管理：教师录入，历史成绩锁定（学期结束30天后）
- 学期状态机：UPCOMING → 注册开放 → 进行中 → 成绩录入期 → 已关闭
- 并发安全：`SELECT FOR UPDATE` 防止超卖
- 管理员批量操作：批量选课 / 退课 / 状态变更
- 管理端学期与教学班管理：课程、教学班、学期均支持创建与编辑
- 学生自助服务：课表、成绩单、GPA、学业进度与申诉追踪
- 通知中心：候补晋升、成绩发布、关键状态变化统一汇总

## API 文档
启动 API 后访问：[http://localhost:4000/api/docs](http://localhost:4000/api/docs)

## 运行测试
```bash
bash scripts/readiness-check.sh
```

预期输出：`457 pass, 0 warn, 0 fail`

## 项目结构
```text
.
├── apps
│   ├── api        # NestJS API + Prisma
│   └── web        # Next.js 15 App Router 前端
├── packages
│   └── shared     # 共享 schema / constants
├── docker-compose.yml
├── .env.example
└── scripts
```

## 常用命令
```bash
pnpm --filter @sis/api exec prisma generate
pnpm --filter @sis/api exec prisma migrate deploy
pnpm --filter @sis/api exec prisma db seed
pnpm --filter web exec tsc --noEmit
pnpm --filter @sis/api exec tsc --noEmit
bash scripts/readiness-check.sh
```

---

如需交付演示，推荐优先走这条路径：
1. 用 `student1@univ.edu` 演示学生选课完整流程
2. 用 `admin@univ.edu` 演示学期 / 教学班 / 成绩录入
3. 用 `/api/docs` 展示后端接口文档与可扩展性
