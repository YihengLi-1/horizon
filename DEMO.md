# 地平线 Demo 指南

## 启动（3 条命令）

```bash
cp .env.example .env
```

```bash
pnpm install
```

```bash
docker compose up -d && DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/sis_db?schema=public" pnpm --filter @sis/api db:seed
```

说明：
- 默认 `docker compose up -d` 只会启动 `postgres`、`api`、`web`
- 访问地址：
  - Web: `http://localhost:3000`
  - API: `http://localhost:4000`

## 测试账号

### Admin
- `admin@sis.edu / Admin123!`

### Students
- `student1@sis.edu / Student123!`
- `student2@sis.edu / Student123!`
- `student3@sis.edu / Student123!`
- `student4@sis.edu / Student123!`
- `student5@sis.edu / Student123!`

## 最值得演示的 5 个页面

### 1. `/admin/dashboard`
- 截图描述：后台总览大屏，显示 KPI 卡片、关键告警、注册与运营汇总，适合开场展示系统整体完成度。

### 2. `/admin/holds`
- 截图描述：管理员可搜索学生、创建/解除 hold 的治理页面，能直观看到真实治理约束不是前端假动作。

### 3. `/admin/requests`
- 截图描述：审批请求列表，展示学术请求工作流、当前处理状态和治理引擎能力，适合讲“不是普通 CRUD”。

### 4. `/admin/faculty-schedule`
- 截图描述：按教师展开课表与教学负载，顶部有教学量 KPI，适合演示教务运营视角的数据组织能力。

### 5. `/student/cart`
- 截图描述：学生购物车页面，能看到真实选课状态、治理反馈、候补/限制/审批影响，是最能说明系统闭环的一页。
