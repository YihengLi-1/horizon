# 地平线 SIS — 进化路线图
> 参考 Stanford Carta / Harvard my.harvard / Cornell Scheduler / GT Course Critique /
> UC Berkeley CalCentral / CMU Stellic / Workday Student / Georgia State GPS / Coursicle / CourseOff
> 调研日期：2026-03-06

---

## 背景：我们在哪里

| 维度 | 当前状态 |
|---|---|
| Readiness gate | 170 pass, 0 warn, 0 fail |
| 单元测试 | 44 个，全绿 |
| 功能覆盖 | 选课/退课/等待列表/成绩/课表/管理员全套 |
| 核心缺口 | 原子换班、先修课服务端校验、学位审查、选课组合生成器 |

---

## 第一批：上线前必须做（5 项）

> 不做有真实业务风险，优先级最高

### S1. 先修课服务端强制校验
**参考：** UC Berkeley CalCentral Shopping Cart Validation
**问题：** 现在只在前端显示 "缺先修课" 警告，学生直接调 API 可绕过。
**实现：**
```
文件：apps/api/src/registration/registration.service.ts
在 enroll() 事务内，查询 course.prerequisiteLinks，
检查学生 COMPLETED 状态的 enrollment 是否覆盖每个先修课。
缺失时抛 BadRequestException("PREREQ_NOT_MET: CS101, CS102")
```
**新增测试：** `registration.service.spec.ts` — mock 先修课 + 无完成记录 → 期望 BadRequestException

---

### S2. 原子换班（Atomic Swap）
**参考：** PeopleSoft / Wolverine Access / CalCentral
**问题：** 学生想从 §001 换到 §002，必须先退再加——退掉瞬间失去席位，可能抢不回来。
**业界标准：** 所有主流商业 SIS 均支持，是注册 UX 中影响最大的单一功能。
**实现：**
```
新接口：POST /registration/swap
Body：{ dropSectionId: string, addSectionId: string }
逻辑：prisma.$transaction([ enroll(add), drop(drop) ])
      若 enroll 失败（满员/先修/冲突），整个事务回滚，原选课保留
Web：在 /student/cart 每个已选课程旁加「换班」按钮，
     弹窗选择同课程其他 section，一键提交
```

---

### S3. Reports 页按学期过滤
**参考：** 所有大学报表系统均以学期为基础单位
**问题：** 多学期运行后，Reports 页把所有学期数据混在一起，无法单独查看某学期。
**实现：**
```
文件：apps/web/app/admin/reports/page.tsx
加 searchParams: Promise<{ termId?: string }> 入参
顶部 hero 区加学期 <select>（从 GET /academics/terms 拉取）
fetchAllEnrollments() 传入 ?termId=xxx
所有 stats 端点（dept-breakdown/top-sections/gpa-distribution）也传 termId
```

---

### S4. 维护模式前端页面
**问题：** 维护期间学生看到裸 API 503 JSON，体验差。
**实现：**
```
新建：apps/web/app/maintenance/page.tsx（友好维护提示页）
新建/编辑：apps/web/middleware.ts
  检测 API 响应 X-Maintenance: true 头，重定向到 /maintenance
  admin 路由豁免（管理员仍可访问）
```

---

### S5. 生产 .env 配置指引文档
**问题：** .env.example 存在但没有生产值填写指引。
**实现：**
```
在 DEPLOY.md 中新增"生产环境变量清单"章节：
- JWT_SECRET：openssl rand -base64 64 生成，≥64 字符
- DATABASE_URL：指向生产 PostgreSQL
- SMTP_*：真实 SMTP 服务（推荐 SendGrid/Mailgun）
- CORS_ORIGINS：生产域名，不允许 *
- THROTTLE_TTL/LIMIT：建议 60/100
```

---

## 第二批：高价值功能（按影响力排序）

> 这些是顶尖大学 SIS 的核心竞争力，集百家之所长

---

### A1. 课程成绩分布图（最高优先）
**参考：** Stanford Carta（最受欢迎功能）、Georgia Tech Course Critique
**价值：** Carta 历史上 90% 斯坦福本科生使用，核心就是这个功能。
**数据来源：** 已有 `Enrollment.finalGrade`，无需新数据。
**实现：**
```
后端：GET /academics/sections/:id/grade-distribution
  返回：{ A: 12, B: 8, C: 4, D: 1, F: 0, W: 2 }
  从 Enrollment 按 finalGrade group by 统计

前端：在 catalog/page.tsx 每张课程卡片底部加小型横向条形图
  组件：GradeDistBar.tsx（纯 SVG，宽度按比例）
  颜色：A→emerald, B→blue, C→amber, D→orange, F→red, W→slate

管理端：admin/sections/page.tsx 加「成绩分布」列
```

---

### A2. 空位监听 / 开放席位推送
**参考：** Coursicle（1100+ 所大学的学生用它替代官方 SIS 的核心原因）
**价值：** 满员课程是学生最大痛点，Coursicle 靠这一个功能获得千万用户。
**实现：**
```
新表：SectionWatch { id, studentId, sectionId, createdAt, notifiedAt? }
新接口：
  POST /registration/watch/:sectionId   — 订阅
  DELETE /registration/watch/:sectionId — 取消
  GET  /registration/watches            — 我的订阅列表

后台任务：@Cron('*/5 * * * *')（每5分钟）
  查所有 SectionWatch，fetch 对应 section 的 enrolled 数
  若 enrolled < capacity，发 NotificationLog + 邮件，删除该 watch

前端：
  catalog 每张满员课程卡片加「🔔 有空位通知我」按钮
  /student/notifications 列表展示已订阅的监听
```

---

### A3. 选课组合生成器（Schedule Builder）
**参考：** CourseOff（专为此功能建的第三方工具）、Cornell Scheduler、CMU Stellic
**价值：** 学生选了 4 门课，每门有 3-5 个时间段，手动找无冲突组合极其繁琐。
这是 Coursicle / CourseOff 存在的全部理由。
**实现（纯前端算法，不需要后端改动）：**
```
新页面：apps/web/app/student/planner/page.tsx
UI：
  左侧：课程搜索 + 选课篮（最多5门）
  右侧：生成的无冲突时间表列表（最多显示20个组合）
  过滤器：避开早8点 / 最少上课天数 / 最大连续课时

算法（TypeScript，纯前端）：
function generateCombinations(courses: Course[]): Section[][] {
  // 回溯算法：从每门课的 sections[] 中各选一个，检查两两无时间冲突
  // 剪枝：已选 sections 与候选 section 有冲突则跳过这个分支
  // 时间复杂度：O(∏ sections_per_course)，5门×5个section = 3125次，前端完全可行
}

每个生成的组合可一键「加入购物车」
```

---

### A4. iCal 导出（已修学课程）
**参考：** Cornell Scheduler（最常用的 scheduler 功能）
**实现：**
```
新接口：GET /students/schedule/ical?termId=xxx
  生成 RFC 5545 格式 .ics 文件
  每个 section 的每个 meetingTime 生成一个 VEVENT
  RRULE: BYDAY=MO,WE（按 weekday 生成重复规则）
  DTSTART / DTEND 从 term.startDate + startMinutes 计算

前端：/student/schedule 页面「导出到日历」按钮
  下载文件名：schedule-{termName}.ics
  支持 Google Calendar / Apple Calendar / Outlook
```

---

### A5. 可分享课表链接
**参考：** Cornell Scheduler Shareable URL
**实现：**
```
新表：ScheduleSnapshot { id(ulid), studentId, termId, sectionsJson, createdAt }
新接口：
  POST /students/schedule/share → 返回 { token: "01ARZ3NDEK..." }
  GET  /schedule/share/:token  → 公开只读，返回 sections JSON

前端：
  /student/schedule 「分享课表」按钮 → 生成链接 → 复制到剪贴板
  /schedule/share/[token]/page.tsx → 只读课表展示（Server Component）
  支持 navigator.share() API（手机原生分享菜单）
```

---

### A6. 多维度课程评价
**参考：** Harvard Q Score（完成评价→提前看成绩，哈佛的完成率因此极高）
**扩展现有 CourseRating 模型：**
```
Prisma schema 新增字段：
  lectureQuality   Int?  // 1-5
  workloadAccuracy Int?  // 1-5（实际工作量 vs 预期）
  examDifficulty   Int?  // 1-5
  wouldTakeAgain   Boolean?
  comment          String? @db.Text

API：PATCH /registration/sections/:id/rate（扩展现有接口）

激励机制（参考哈佛）：
  Term 结束后，完成所有课程评价的学生可提前 48h 查看成绩
  Enrollment 加 evaluationCompleted Boolean @default(false) 字段
  GET /registration/grades 检查：若 term 未到 gradeReleaseAt 且 earlyAccess=false，
  返回 403；若 earlyAccess=true 则返回

前端：catalog 课程卡片展示 4 维度小图标评分 + "会再选" 百分比
```

---

### A7. 购物车预验证（Validate Before Enroll）
**参考：** UC Berkeley CalCentral（最佳注册 UX 设计之一）
**价值：** 注册窗口开放时学生在时间压力下操作，报错体验极差。提前验证允许学生提前几天发现并修复问题。
**实现：**
```
新接口：POST /registration/cart/validate
  对购物车中每个 section 运行所有检查（先修课/冲突/学分上限/名额）
  不写任何 enrollment 记录，只返回验证结果
  返回：{ results: [{ sectionId, ok: bool, errors: string[] }] }

前端：/student/cart 页加「预检查」按钮
  展示每门课的检查结果（绿色✓ / 红色✗ + 具体错误信息）
  错误高亮对应课程行
```

---

### A8. 学位审查（APR / Degree Audit）
**参考：** Workday Student APR、Harvard AAR、CMU Stellic
**价值：** 这是区分「选课系统」和「学术规划系统」的核心功能。
**分两期实现：**

**期一（数据模型，2天）：**
```
新表：
  DegreeRequirement { id, programName, requirementName, minCredits, minGrade, type }
  DegreeRequirementCourse { requirementId, courseId }
  StudentDegreeProgram { studentId, programName, enrolledAt }

种子数据：为 CS / Math / Economics 各建一套毕业要求模板
```

**期二（审查引擎 + UI，3天）：**
```
新接口：GET /students/degree-audit
  对照学生已 COMPLETED 的 enrollment，逐条匹配 DegreeRequirement
  返回每项要求的状态：NOT_STARTED / IN_PROGRESS / COMPLETED
  包含进度百分比、剩余学分

前端：新页面 /student/degree-audit
  分组展示：核心课程 / 专业必修 / 选修 / 通识教育
  每项显示进度条 + 已修课程列表
  「What-If」模拟：切换专业，实时看课程如何重新映射
```

---

### A9. 风险学生预警仪表盘（Admin）
**参考：** Georgia State GPS Advising（带动毕业率提升 7 个百分点）
**实现：**
```
新接口：GET /admin/students/at-risk
  风险条件（可配置）：
  - GPA < 2.0（或管理员设定的阈值）
  - 当前学期有课程但下学期无任何选课记录（距注册截止 < 14天）
  - 当前学期有 ENROLLED 课程但 2 周无 grade 活动（疑似放弃）
  - 连续 2 学期 GPA 下降

前端：admin/dashboard 新增「需关注学生」卡片
  列表展示风险学生 + 具体触发的风险原因标签
  一键「发通知」按钮（调用现有 bulk notify）
  一键跳转到该学生详情 drawer
```

---

### A10. 课程同修分析（Course Pairing）
**参考：** Stanford Carta 最具数据价值的功能
**实现：**
```
新表（预计算，每学期跑一次）：
  CoursePairing { courseAId, courseBId, beforePct, concurrentPct, afterPct, coEnrollCount }

预计算逻辑（后台任务）：
  对所有 studentId，按 termId 排序其 COMPLETED 课程
  统计课程 A 和课程 B 的时序关系（A 先 / 同期 / B 先）
  过滤：共选人数 < 10 的配对不展示（保护隐私）

前端：catalog 课程详情展开区加「修过这门课的同学还修了」
  展示 Top 5 相关课程 + 前/中/后百分比小标签
```

---

## 第三批：长期战略功能

| 编号 | 功能 | 参考 | 优先级 |
|---|---|---|---|
| L1 | 四年课程规划网格（拖拽） | CMU Stellic | ⭐⭐⭐⭐⭐ |
| L2 | 课程工作量调查 + 柱状图 | Stanford Carta | ⭐⭐⭐⭐ |
| L3 | Syllabus 全文检索 | Harvard my.harvard | ⭐⭐⭐⭐ |
| L4 | Web Push 通知（PWA） | 现代 PWA 标准 | ⭐⭐⭐⭐ |
| L5 | 课程需求预测（管理端） | CMU Stellic 需求规划 | ⭐⭐⭐⭐ |
| L6 | 顾问预约系统 | 多所大学 | ⭐⭐⭐ |
| L7 | 绑定课程组件（讲课+实验同选） | Georgia Tech OSCAR | ⭐⭐⭐ |
| L8 | 学生持卡 / 数字学生证 | 现代 SIS 趋势 | ⭐⭐ |
| L9 | Google Calendar OAuth 同步 | 现代 SIS 趋势 | ⭐⭐⭐ |
| L10 | 跨班好友课表对比 | Cornell / Coursicle | ⭐⭐⭐ |

---

## 第四批：无障碍 & 体验打磨

### UX 细节（参考 WCAG 2.1 AA + 各大高校标准）

| 项目 | 现状 | 目标 |
|---|---|---|
| 对比弹窗 Focus Trap | 无 | Tab 键在弹窗内循环，Esc 关闭 |
| 可排序表格 aria-sort | 无 | `aria-sort="ascending/descending"` |
| 移动端底栏当前路由高亮 | 无 | `usePathname()` 匹配激活 tab |
| 成绩趋势箭头 | 无 | 每学期 vs 上学期 ↑↓→ |
| prefers-reduced-motion | 无 | 所有 CSS 动画包裹此媒体查询 |
| 颜色对比度 4.5:1 | 未验证 | axe-core 扫描 + 修复 |
| 表单错误关联 aria-describedby | 部分 | 全面覆盖 |
| 图表替代文字 | 无 | SVG `<title>` + `<desc>` |

---

## 完成路径总结

```
现在 → 完成第一批(S1-S5) → 可正式上线交付大学
       ↓
       完成第二批 A1-A5   → 超过 90% 中国高校 SIS 水平
       ↓
       完成第二批 A6-A10  → 对标 Cornell / Berkeley 水平
       ↓
       完成第三批 L1-L10  → 对标 Stanford Carta + CMU Stellic 水平
       ↓
       完成第四批无障碍   → WCAG 2.1 AA 合规，满足欧美高校采购要求
```

---

## 参考来源

| 大学/产品 | 核心亮点 | 链接 |
|---|---|---|
| Stanford Carta | 成绩分布、工作量图、课程配对 | carta-beta.stanford.edu |
| Harvard my.harvard | 顾问可见购物车、AAR学位审查、评价激励 | my.harvard.edu |
| Cornell Scheduler | iCal 导出、可分享链接、个人事件阻断 | classes.cornell.edu |
| GT Course Critique | 按教授维度的历史成绩分布 | critique.gatech.edu |
| UC Berkeley CalCentral | 购物车预验证、专业要求过滤 | calcentral.berkeley.edu |
| CMU Stellic | 四年规划网格、What-If 审查、需求预测 | stellic.com |
| Wolverine Access | 统一学生事务入口 | wolverineaccess.umich.edu |
| Workday Student | 实时 APR、主动风险预警 | workday.com/student |
| Georgia State GPS | 预测分析、毕业率提升 7% | success.gsu.edu |
| Coursicle | 空位通知（1100所大学使用） | coursicle.com |
| CourseOff | 无冲突选课组合生成器 | courseoff.com |
