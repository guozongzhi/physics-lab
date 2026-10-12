# 物理实验室（Physics Mission Control）设计文档

> 本文档是项目的**唯一权威设计文档**，供后续 Agent / 开发者快速理解全貌并继续开发。
> 最后局部更新：2026-10-09。布局与路由入口已迁入 `src/app/App.tsx`、`src/app/layouts/AppShell.tsx`，`src/App.tsx` 只保留兼容转发；其余模块仍在分批重构，状态见 [重构进展](refactoring/PROGRESS.md)。如代码与本文档冲突，以代码为准并请同步更新本文档。

---

## 1. 项目概述

**定位**：面向高中/特色班物理教学的**游戏化沉浸式学习平台**。学生以"科研小组"为单位，在"物理任务指挥中心（Mission Control）"氛围中完成学习、实验、挑战、协作；教师/管理员在控制台进行分组、题库、项目、安全认证与班级管理。

**设计基调**：Apple + Notion + Duolingo + NASA Mission Control 融合风格。
**严禁**：传统 ERP / OA / Admin Dashboard 风格（密集表格、堆叠菜单、灰色后台）。

**三类角色**：

| 角色 | role 值 | 入口 | 核心功能 |
|---|---|---|---|
| 学生 | `student` | `/dashboard` | 学习路径、答题挑战、项目实验、招募市场、组间转账、成就 |
| 教师 | `teacher` | `/teacher/overview` | 总览数据台、分组管理、学生名册、题库审核、安全题库维护 |
| 管理员 | `admin` | `/admin` | 班级/教师/学生账户管理 |

**硬规则**：每班最多 30 名学生；学生不能自行建组（教师建组或直接分配）；小组名/班级名可由教师修改。

---

## 2. 技术栈

### 前端（`/`，Vite 工程）
- React 18 + TypeScript 5.8（严格模式）
- Vite 6 + `vite-tsconfig-paths`（路径别名 `@/` → `src/`）
- 状态管理：Zustand 5
- 路由：react-router-dom 7
- 样式：TailwindCSS 3.4 + PostCSS（自定义设计 token 见 §10）
- 动效：framer-motion 11
- 图表：recharts 2（已拆入 vendor chunk）
- Markdown：react-markdown 9（内容渲染必须包 `.prose-safety`）
- 图标：lucide-react

### 后端（`/backend`，FastAPI 工程）
- FastAPI + Uvicorn（Python 3.13，依赖装在 `backend/.venv`）
- SQLAlchemy ORM + SQLite（`backend/physics_lab.db`）
- 鉴权：python-jose（JWT，HS256，有效期 12h）+ bcrypt 密码哈希
- 配置：pydantic-settings（`backend/.env` 或环境变量覆盖）
- 测试：pytest（`backend/tests/`，134 个用例，9 个文件）

---

## 3. 目录结构

```
Physics_lab/
├── src/
│   ├── App.tsx                  # 指向 app/App.tsx 的兼容转发
│   ├── app/App.tsx              # 路由表 + 角色守卫 + 数据初始化
│   ├── app/layouts/AppShell.tsx # 父布局 Outlet，统一包裹 MissionShell
│   ├── main.tsx                 # 入口（bootstrapFromApi() 恢复状态）
│   ├── index.css                # Tailwind + 设计 token + 动画/玻璃卡片等组件类
│   ├── data/
│   │   └── mockData.ts          # 离线演示种子（不再定义业务类型/存储）
│   ├── types/domain.ts         # 唯一领域类型；types/index.ts 为公共入口
│   ├── store/                   # Zustand stores（见 §7）
│   │   ├── authStore.ts         # 登录态/token/当前用户
│   │   ├── groupStore.ts        # 班级/小组/用户/排名（核心数据源）
│   │   ├── projectStore.ts      # 项目/招募/展示墙
│   │   ├── coinStore.ts         # 能量币流水/转账/结算动作
│   │   ├── theoryStore.ts       # 知识主题/题目/测验/挑战
│   │   ├── safetyStore.ts       # 安全认证题库（后端权威，内置 35 题）
│   │   ├── questionBankStore.ts # 题库审核（学生提交 + 教师上传，localStorage）
│   │   └── uiStore.ts           # toast 通知等 UI 状态
│   ├── lib/
│   │   ├── apiClient.ts         # fetch 封装：自动附 Bearer token、401 处理
│   │   ├── apiService.ts        # 业务 API 公共导出；实现位于 lib/api/
│   │   ├── api/                # identity/theory/projects/safety/coins 资源客户端
│   │   ├── storage.ts           # LS_KEYS、浏览器读写与在线会话缓存清理
│   │   ├── bootstrap.ts         # 启动/刷新时并发拉取后端数据填充各 store
│   │   ├── reviveDates.ts       # 显式字段日期转换；复用 dateReviver.ts UTC/时区规则
│   │   ├── syncQueue.ts         # 在线写操作队列（乐观更新 + 服务端快照校正）
│   │   └── utils.ts             # cn() 等工具
│   ├── components/
│   │   ├── layout/MissionShell.tsx  # 全局唯一布局（学生/教师/管理员共用；含侧边栏+顶栏+通知铃铛）
│   │   ├── ui/                  # Checkbox/CoinBadge/Dialog/ProgressRing/StatCard…
│   │   └── project/             # KanbanColumn/Timeline 等项目页组件
│   └── pages/                   # 见 §6 页面清单
├── backend/
│   ├── .venv/                   # Python 虚拟环境（必须用它跑后端/测试）
│   ├── app/
│   │   ├── main.py              # FastAPI 应用、CORS、启动时种子数据
│   │   ├── config.py            # Settings（jwt_secret、默认密码、cors_origins…）
│   │   ├── database.py          # SQLAlchemy engine/SessionLocal/Base
│   │   ├── deps.py              # get_db / get_current_user / 角色依赖
│   │   ├── models.py            # 14 张表的 ORM 模型
│   │   ├── schemas.py           # Pydantic 请求/响应模型（camelCase 序列化）
│   │   ├── access.py           # 班级/小组对象级权限策略
│   │   ├── services/           # common/activity/grading/coins；不提交事务
│   │   ├── question_views.py / user_views.py # 安全响应投影，路由不互相导入
│   │   └── routers/             # auth/admin/groups/theory/quiz/safety/projects/recruitments/showcase/coins/review_questions
│   ├── tests/                   # pytest（auth/groups/coins/projects/showcase/quiz/challenge_pricing/password_recovery/safety_assignments）
│   ├── requirements.txt / requirements-dev.txt
│   └── physics_lab.db           # SQLite 数据文件
├── docs/DESIGN.md               # 本文档
└── package.json / vite.config.ts / tailwind.config.js
```

---

## 4. 快速开始

```bash
# 前端
npm install
npm run dev        # http://localhost:5173
npm run check      # tsc 类型检查（提交前必跑）
npm run build      # 生产构建（已配置 vendor 分包）

# 后端（必须使用项目自带 venv）
cd backend
.venv/bin/uvicorn app.main:app --port 8000          # 启动
.venv/bin/python -m pytest tests/ -q                # 跑测试

# 联调
# 前端配置 VITE_API_BASE_URL=http://localhost:8000 后进入在线模式；
# 未配置时自动降级为离线模式（localStorage 种子数据，见 §8）。
```

**默认账号**（生产环境请改密）：登录名 教师 `teacher`、管理员 `admin`、学生 `u-01` 起。
密码按加载来源决定：本地跑读 `backend/.env`，Docker 部署读仓库根 `.env`，都没有则回退 `backend/app/config.py` 默认值（`TEACHER_PASSWORD` / `ADMIN_PASSWORD` / `STUDENT_DEFAULT_PASSWORD`）。改密后重启后端生效。

---

## 5. 系统架构与数据流

```
┌─────────────────────────── 浏览器 ───────────────────────────┐
│  页面组件 (pages/*)                                            │
│      │  读状态（useStore selector） / 调 action                │
│      ▼                                                         │
│  Zustand Stores（单一数据源）                                   │
│   groupStore / projectStore / coinStore / theoryStore / …     │
│      │ 在线模式写操作：先乐观更新 UI + localStorage 持久化       │
│      │            再经 syncQueue 后台同步（失败可重试）          │
│      ▼                                                         │
│  lib/apiService（业务 API） → apiClient（fetch + Bearer）      │
│      │ bootstrap.ts：登录/刷新时并发拉取全量数据 → reviveDates  │
│      ▼  填回各 store（coinTxs 归一化为时间正序）                 │
└──────┼────────────────────────────────────────────────────────┘
       │ HTTP / JSON（camelCase）
┌──────▼──────────────────── 后端 ──────────────────────────────┐
│  FastAPI routers → deps（JWT 鉴权/角色校验） → Pydantic schemas │
│       → SQLAlchemy models → SQLite                             │
│  能量币结算只允许后端业务端点完成（防双花/重复记账）              │
└───────────────────────────────────────────────────────────────┘
```

**关键数据流约定**：
1. **JWT**：登录成功后 token 存 localStorage；`apiClient` 每次请求附 `Authorization: Bearer <token>`；401 时清登录态并跳转登录页。
2. **状态恢复**：仅 `initAuth()` 不够；页面刷新/再次进入时必须调用 `bootstrapFromApi()`（教师总览等用 `bootstrapFromApi(true)` 强制拉最新）拉取后端数据填充 `groupStore` 等，否则分组/学生数据为空。
3. **乐观更新**：写操作先改 store（UI 即时响应）+ 写 localStorage，再异步同步后端；同步任务进 `syncQueue`。
4. **金币结算归属后端**：项目完成、挑战结算、招募结算、转账均由后端业务端点记账，前端不直接拼装金币流水。
5. **对赌/委托一律先押后结，不凭空发币**：凡是"一组付钱给另一组"的业务，都在**发起时**把金额从出钱方扣下作押金，结算时再按结果分配、剩余退回。已成对实现的是**挑战**（`theory.py` 创建时预扣 → `services.settle_challenge` 按正确率分账，仅 ≥95% 的 20% 加成是增发）和**招募**（`recruitments.py` 创建时预扣 `escrow_paid` → `services.settle_recruitment` 按 success/partial/fail 分账）。
   **不变式：`escrowed = 付给承接方的 + 退回发包方的`**——任何一支只增不减都会变成印钞机。招募原先漏了"预扣"这一半，导致三个分支都在增发，其中 `fail` 会让发包组白得一笔自己从未付过的钱（`reward` 还由客户端随意填，实测 450 → 100450）。2026-09-30 已按上述模型修好：发布时余额不足直接 400、`reward` 必须 > 0、存量招募（`escrow_paid=0`）在结算时补扣。
6. **日期反序列化**：后端返回 ISO 字符串，前端统一经 `reviveDates(txs, ['createdAt'])` 按字段名转 `Date`。
7. **流水顺序**：后端交易记录最新在前，bootstrap 时归一化为**时间正序**；展示"最近 N 条"时先 reverse 再 slice。
8. **教师可控的开放窗口（2026-09-30 新增）**：`class_meta` 存 `*_window_open` / `*_window_minutes` / `*_window_closes_at`，教师端「分组管理」页有一张「开放窗口」卡，开关与时长**改完立刻生效（无草稿、无保存按钮）**。
   - **只挡"新开局"**：`POST /challenges`、`POST /recruitments`、`POST /recruitments/{id}/bid`、`POST /coins/transfer` 四道闸（`deps.window_guard`）；**作答与结算一律不挡**——挡了押金会卡在中间谁也拿不回。教师/管理员不受限。
   - **组间转账不单设开关**：任一窗口开着即视为"课上有监督"，两个都关才封。
   - **到点自动关闭是惰性判定**（`services.window_state` 每次请求现算），没有定时任务；教师端页面 30 秒 tick 一次跟着刷新。
   - **存量库迁移回填成"开着、不限时"**：上线不能把现有功能突然锁上，老师应当是主动去关。
   - ⚠️ **时区坑（务必遵守）**：datetime 列存的是**无时区的 UTC 字面值**，`isoformat()` 出来的串不带 `Z`，而 JS 的 `new Date('2026-09-30T05:50:32')` 会按**本地时间**解析——东八区整体早 8 小时。这条踩过两次：窗口的"开/关"判错（16:50 到期的窗口在 16:21 就显示"已关闭"）、安全指派的截止时间显示错且学生待办**提前 8 小时消失**。
     **规则：前端拿到后端的 datetime 串，必须先过 `reviveDates`（无时区后缀补 `Z`）再用。** 已有覆盖面：
     - `bootstrapFromApi` 统一 revive：coinTxs.createdAt、quizSessions.createdAt、projects.startDate/dueDate、recruitments.deadline、showcaseItems.createdAt、challenges.deadline、**classMeta 的两个 windowClosesAt**
     - `groupStore.updateActivityWindow` 合并后端回包时也要 revive（那里绕过了 bootstrap）
     - **安全模块**（`safetyApi.myRecords` / `safetyAssignmentApi.list|get`）不走 bootstrap，是在 `apiService` 里就地 revive 的（2026-09-30 补）
     - `lib/activityWindow.ts` 的 `parseUtc` 是兜底，负责还没 revive 的来路（旧 localStorage 等）
     - 已经带时区偏移的串**不用**处理，直接 `new Date()` 就是对的——后端用 aware datetime `.isoformat()` 写进 JSON 列的字段（如 `challenge.submissions[].submittedAt`、`recruitment.bids[].bidAt`）属于这类

---

## 6. 路由与页面清单（src/app/App.tsx）

学生端（默认登录后进入）：

| 路径 | 页面文件 | 说明 |
|---|---|---|
| `/dashboard` | Dashboard.tsx | 主控台（教师/管理员访问自动重定向到各自入口） |
| `/theory/topics` | LearningHub.tsx | 知识星系/学习路径（阶段进度按 completedTasks 动态计算） |
| `/theory/quiz/:sessionId` | QuizPage.tsx（`mode="quiz"`） | 章节测验 |
| `/theory/challenge` | KnowledgeGalaxy.tsx | 知识星系挑战入口 |
| `/theory/challenge/:id/accept` | QuizPage.tsx（`mode="challenge"`） | 接受挑战 |
| `/theory/challenges` | TheoryChallenge.tsx | 挑战大厅 + "我的题目"（学生提交题 + 查看审核反馈） |
| `/projects` | ProjectCenter.tsx | 项目中心（看板） |
| `/projects/:id/safety` | SafetyExam.tsx | 项目安全考核入口 |
| `/safety-lab` | SafetyLab.tsx | 安全实验室（含「今日安全考核」真实指派面板） |
| `/safety-exam/:category` | SafetyExam.tsx | 安全认证考试；可带 `?assignment=<id>` 按教师指派的题数/限时/及格线作答 |
| `/projects/:id/recruit/:rid` | ResearchMarketplace.tsx | 招募投标详情 |
| `/recruit/market` | ResearchMarketplace.tsx | 招募市场 |
| `/coins` | ResearchLeague.tsx | 能量币/排行榜与流水 |
| `/showcase` | AchievementHall.tsx | 成就殿堂（分类 tab 动态过滤） |
| `/communicator` | GroupCommunicator.tsx | 小组通讯（挑战系统、专家招募、能量币转账） |
| `/profile` | ResearchProfile.tsx | 个人资料 |
| `/login` | Login.tsx | 登录/注册 |

重定向路由：`/` → `/dashboard`；`/theory/topics/:id` → `/theory/topics`；`/projects/:id` → `/projects`；`/group` → `/communicator`；未匹配 → NotFound。

> `/theory/challenge`（无 `s`）与 `/theory/challenges`（带 `s`）是**两个不同页面**，都在使用，不是新旧拼写关系。

教师端（`MissionShell`，侧边栏 6 项）：

| 路径 | 页面文件 | 说明 |
|---|---|---|
| `/teacher/overview` | TeacherOverview.tsx | 指挥总控台（见 §6.1） |
| `/teacher/groups` | TeacherGroups.tsx | 分组管理（按班级分区，组内按能量币降序；建组/分配/改名） |
| `/teacher/projects` | TeacherProjects.tsx | 项目管理（审批/冻结/编辑项目） |
| `/teacher/roster` | StudentRoster.tsx | 学生名册（按班级分区展示、按班级批量选择） |
| `/teacher/question-bank` | TeacherQuestionBank.tsx | 题库审核中心（学生提交审核 + 教师上传/导入/导出） |
| `/teacher/safety` | TeacherSafety.tsx | 安全题库维护（增删改、JSON 批量导入/导出、恢复内置 35 题）+ **考核任务指派** |

管理员端：`/admin` → AdminConsole.tsx（班级、教师账户、学生账户管理；`ClassComposition.tsx` 由它以 tab 形式内嵌，不单独占路由）。

### 6.1 教师总览页数据来源（TeacherOverview.tsx，已全部真实化）

| 区块 | 数据源 | 备注 |
|---|---|---|
| 6 个统计卡片 | groupStore.users/groups、projectStore.projects | 全部可点击：人数→`/teacher/roster`，小组→`/teacher/groups`，项目类→`/projects` |
| 小组能量币对比柱状图 | groups + users | 仅含有组员（≥1）的小组，按 totalCoins 降序；tooltip 含组员数 |
| 项目状态分布饼图 | projects | 6 状态计数，只显示 >0 的状态；空态提示 |
| Top 20 能量币流水 | coinStore.coinTxs | 最近 20 条，时间智能格式化（今天/昨天/MM-DD） |
| 冻结项目预警 | projects(status=frozen) | 显示项目名+所属组；空态绿色提示；提醒按钮有 toast |
| 待审核题库 | questionBankStore.questions | 仅 pending（学生提交）；通过即 approve；详情弹窗可跳审核中心做驳回/修改 |
| 招募异常超时 | projectStore.recruitments | status=open 且 deadline 已过；逾期天数实时计算 |

---

## 7. 前端状态管理（Zustand Stores）

| Store | 持久化 | 核心状态 | 核心 actions |
|---|---|---|---|
| authStore | localStorage | token、role、currentUserId | login/register/logout、initAuth |
| groupStore | localStorage + 后端 | classes、groups、users、rankings | joinGroup、updateGroupCoins、建组/分配/改名（经 API） |
| projectStore | localStorage + 后端 | projects、recruitments、showcaseItems | createProject、**updateProject（PUT /api/projects/{id}）**、updateStatus、markProjectDone、createRecruitment、bidRecruitment、resolveRecruitment |
| coinStore | localStorage + 后端 | coinTxs | addTx、transferCoins、settleChallenge/Recruit/Project（调后端端点） |
| theoryStore | localStorage + 后端 | topics、questions、quizSessions、challenges | 测验/挑战作答与提交。**测验会话按学生归属**：在线由 `POST /quiz/start` 建、bootstrap 按 `user_id` 拉回（**正序存**，因为「最近测验成绩」做的是 `reverse().slice(0,4)`），且在线时**不写 localStorage**（退出登录会清，避免共享电脑串号）；离线退回本地抽题。`startQuiz` 是 **async**（会话 id 由服务端下发） |
| safetyStore | localStorage + 后端 | 安全题库 | 增删改、导入/导出/重置（经 `/api/safety/questions*` 落库，服务端权威；内置 35 题由 `backend/app/safety_builtin.py` 提供） |
| questionBankStore | localStorage 键 `plab_review_questions` | ReviewableQuestion[] | submitQuestion（学生→pending）、uploadQuestion（教师→approved）、approveQuestion、rejectQuestion（须填理由）、editQuestion（标记 edited）、setFeedback、deleteQuestion、importTeacherQuestions |
| uiStore | 不持久化 | toasts | pushToast/removeToast（5 秒自动消失，铃铛显示未读数） |

**Store 编码约定**：
- 写 action 命名用动词（`updateProject`、`approveQuestion`）；只读派生数据放组件内 `useMemo`，不进 store。
- 每个 action 内部：先算 next state → `persist()` 写 localStorage → `set()` → `syncToApi()` 后台同步。
- 组件订阅 store 用 selector：`const projects = useProjectStore((s) => s.projects);`

### 核心 TS 类型（src/types/domain.ts）

- `ProjectStatus = 'planning' | 'progress' | 'review' | 'done' | 'failed' | 'frozen'`
- `SafetyCategory = 'electric' | 'thermal' | 'optical' | 'mechanical' | 'radiation' | 'chemical' | 'combined'`
- `CoinSource = 'challenge' | 'project' | 'recruit' | 'teacher_set' | 'penalty' | 'transfer'`
- `ReviewStatus = 'pending' | 'approved' | 'rejected'`
- `Project`：id/title/topic/techPoints/difficulties/equipmentList(EquipmentItem[])/safetyCategory/status/ownerGroupId/rewardCoins/depositCoins/startDate/dueDate/progress{total,done}/results/photos
- `CoinTransaction`：id/groupId/userId?/source/refId/delta/balanceAfter/createdAt(Date)/note
- `Recruitment`：id/projectId/title/description/skills/reward/deadline/status('open'|'assigned'|'done'|'failed')/bids/assigneeUserId?/result?/actualPay?/**escrowPaid**（发布时从发包组预扣的押金；改动前发布的存量为 0，结算时补扣——见 §5 第 5 条）
- `ReviewableQuestion extends Question`：submittedBy(string|null，null=教师上传)、submittedByName、submittedAt(ISO)、reviewStatus、teacherFeedback?、edited?

---

## 8. API 层设计

### 8.1 apiClient（src/lib/apiClient.ts）
- 导出 `api.get/post/put/patch/delete`；baseURL 取 `VITE_API_BASE_URL`。
- 未配置 baseURL → **离线模式**：直接抛错或走本地种子数据（stores 以 localStorage 为源）。
- 请求自动附 `Authorization: Bearer <token>`；401 → 清 authStore 并跳 `/login`。

### 8.2 apiService 业务集合（src/lib/apiService.ts）
`classesApi、teachersApi、groupsApi、adminGroupsApi、usersApi、theoryApi、projectsApi、recruitmentsApi、showcaseApi、coinsApi`。
命名即资源；返回值均为 Promise<camelCase 模型>。

### 8.3 后端端点全表（前缀 `/api`）

**鉴权**：`POST /auth/login`（响应含 `isDefaultPassword`——用刚收到的明文密码与 `student_default_password` 比对得出，供前端提示改密）、`POST /auth/register`、`POST /auth/change-password`（校验原密码）、`GET /auth/me`

**班级/用户/教师（管理）**：
- `GET/POST /classes`、`PATCH/DELETE /classes/{id}`、`GET /classes/{id}/students`、`POST /classes/{id}/students/batch`
- `GET /users`、`GET /users/{id}`、`PUT /users/{id}/group`、`PUT /users/{id}/avatar`、`DELETE /students/{id}`
- `POST /students/{id}/password/reset`（`require_teacher`）——把学生密码重置为 `settings.student_default_password`；**新密码由服务端取、不下发前端拼**，返回值带上重置后的密码供老师转告（学生忘记密码时的唯一出路）
- `GET/POST /teachers`、`DELETE /teachers/{id}`、`PATCH /teachers/{id}/password`

**小组**：
- `GET/POST /groups`、`PATCH/DELETE /groups/{id}`、`PATCH /groups/{id}/class`
- `POST /groups/{id}/join`、`PUT /groups/{id}/leader/{user_id}`
- `POST /groups/{id}/coins`（教师调币，`note` 为发放/扣除理由，**写进流水且学生可见**）、`PUT /groups/{id}/contribution`（贡献分配）

**项目/招募**：
- `GET/POST /projects`、`GET /projects/{id}`、**`PUT /projects/{id}`（项目信息更新：techPoints/difficulties/标题/课题/器材/成果/照片/rewardCoins；教师可改任意项目，学生仅本组；改器材自动重判 safetyCategory）**
- `PUT /projects/{id}/status`、`PUT /projects/{id}/progress`
- `POST /projects/{id}/done`（结题结算金币）、`POST /projects/{id}/safety-pass`
- `GET/POST /recruitments`、`POST /recruitments/{id}/bid`、`PUT /recruitments/{id}/assign`、`PUT /recruitments/{id}/resolve`

**金币**：
- `GET /coin-transactions`（最新在前）、`POST /coins/transfer`（组间转账，原子记账，收支共享 refId）
- `GET /rankings`、`GET /class-meta`、`PUT /class-meta`（`require_teacher`）——挑战奖励单价（简单/中等/困难，各 0~100）
- `PUT /activity-window`（`require_teacher`）——教师开关挑战/招募窗口，见 §5 第 5 条

**理论/挑战/展示**：
- `GET /topics`、`GET /questions`、`POST /quiz/start`、`POST /quiz/{id}/answer`、`POST /quiz/{id}/grade`、**`GET /quiz/sessions`（只返回当前用户自己的会话，按创建时间倒序；前端 bootstrap 拉取后转正序存）**
- 测验会话的 `answer`/`grade` **校验归属**（`user_id != current.id` → 403）；`grade` 会置 `graded=true`（区分「开始过」与「已交卷」，学习路径前几步用它判定）
- `GET/POST /challenges`、`GET /challenges/{id}/questions`、`POST /challenges/{id}/submit`
- ⚠️ `POST /challenges` **不收 reward**：奖励由服务端按 `questionIds` 各自难度 × `class_meta` 三档单价算出（`services.challenge_reward_for`）。前端不可自定价——否则改个请求体就能把奖励改成任意值
- `GET/POST /showcase`、`POST /showcase/{id}/love`
- `POST /showcase` 带 `category`（`photo`/`video`/`paper`/`model`/`award`）——展览馆顶部 tab 据此筛选。上传表单一直让学生选分类，但从前端到模型都没有这个字段，选了等于白选、tab 也永远筛不出东西（2026-09-26 补上）
- `PUT /showcase/{id}`（学生改本组作品置回待审批；**教师/管理员改保留原状态**）、`DELETE /showcase/{id}`（教师/管理员下架，**已奖励的能量币不回滚**）、`POST /showcase/{id}/review`（教师审批，通过可带 coins 奖励）

**安全**：
- `GET/POST /safety/questions`、`PATCH/DELETE /safety/questions/{id}`、`POST /safety/questions/import`、`POST /safety/questions/reset`（题库，教师维护，登录可读）
- `POST /safety/records`、`GET /safety/records`（考核记录；**带 `assignmentId` 时后端按指派及格线推导 `passed`，忽略客户端传值**）
- `POST /safety/assignments`（教师建指派，`classId`/`groupId` 二选一）、`GET /safety/assignments`（教师看全部，学生只看指派给自己班级或小组的）、`GET/DELETE /safety/assignments/{id}`

**其他**：`GET /health`

### 8.4 后端分层

- `routers/` 按 HTTP 资源领域拆分；`main.py` 显式组装，URL 不随模块移动而改变。
- `access.py` 在角色守卫之后检查资源所属班级和小组；管理员/未绑定班级的全校教师保留全局管理权。
- `services/` 负责领域计算/余额/流水，调用方统一提交事务。余额写锁、严格扣款、项目和招募原子结算保证并发写入不覆盖旧余额。
- `question_views.py` / `user_views.py` 负责隐藏答案、密码等响应投影，禁止路由之间互相导入。
- 项目奖励由教师定价；已结算项目不能重开，普通更新不可直接设成 `done`，使用 `/projects/{id}/done` 结算。前端项目 API 适配器把表单的完成动作转到此接口。
- 未结算招募含押金时禁止删除项目；先以失败结算退还押金。
- `deps.py`：`get_db`（请求级 Session）、`get_current_user`（解 JWT）、角色依赖（teacher/admin）。
- `schemas.py`：Pydantic 模型，配置 `alias_generator`/`populate_by_name` 实现 camelCase 出入参。
- `models.py`：14 张表 —— classes、groups、users、coin_transactions、topics、questions、quiz_sessions、challenges、projects、recruitments、showcase_items、class_meta、safety_records、safety_assignments。
- `main.py`：CORS（默认允许 5173/5174）、启动时建表并灌入种子数据（教师/管理员账户、班级、示例小组与题目）。

---

## 9. 后端测试

```bash
cd backend && .venv/bin/python -m pytest tests/ -q     # 使用独立测试数据库
```
- `tests/test_auth.py`：注册/登录/鉴权
- `tests/test_groups.py`：建组/加入/改名/分配
- `tests/test_coins.py`：转账原子性、流水、余额、调币理由落账（含扣罚标 `penalty`、空白理由回退中性文案）
- `tests/test_projects.py`：创建、`PUT` 更新（部分字段保留、器材改类、跨组 403、教师可改、404/401）
- `tests/test_safety_assignments.py`：指派可见性分流（含**无小组学生不得误匹配 `group_id IS NULL`** 的回归）、权限、及格由服务端推导防伪造
- `tests/test_showcase.py`：教师编辑保留审批状态、学生编辑置回待审批、下架权限与「不回滚已奖励能量币」
- `tests/test_quiz.py`：测验会话按学生隔离（他人查不到/改不了）、判分与「已交卷」标记
- `tests/test_password_recovery.py`：登录响应里的「还在用初始密码」标记、教师重置学生密码（含权限与未配置初始密码的兜底）
- `tests/test_challenge_pricing.py`：奖励按题目难度累加、**客户端伪造 reward 被忽略**、单价权限与越界、越界难度向最近档收拢

**注意**：系统 Python 环境缺少 jose 等依赖，必须使用 `backend/.venv/bin/python`。

---

## 10. 设计系统（视觉规范）

### 色彩 token（tailwind.config.js + index.css）

| 名称 | 主色 | 语义 |
|---|---|---|
| mission（蓝） | `#4F7CFF` | 主色/任务/导航 |
| energy（橙） | `#FF8A34` | 能量/活力/警示渐变端 |
| growth（绿） | `#22C55E` | 成功/成长/完成 |
| nova（紫） | `#8B5CF6` | 挑战/新意 |
| alert（琥珀） | `#F59E0B` | 警告/超时 |
| danger（红） | `#F04438` | 危险/扣罚/冻结 |
| ink（灰蓝） | `#1E293B` 系 | 文本 |

文字颜色必须用语义变量（`text-mission-700`、`text-growth-700`、`text-danger-700` 等），**禁止**自造未定义变量名（如 physics/lab/risk）。

### 字体
HarmonyOS Sans、Inter、PingFang SC（font-family 栈见 index.css）。

### 核心组件类（index.css）
- 卡片：`glass-card`、`glass-card-hover`、`planet-card`、`shield-card`
- 徽章：`chip-mission`、`chip-nova`、`chip-growth`、`chip-energy`、`chip-alert`、`chip-danger`、`chip-pill`、`mission-label`
- 按钮：`btn-mission`、`btn-growth`、`btn-energy`、`btn-ghost`、`btn-ghost-mission`
- 名次：`podium-gold/silver/bronze`、`node-badge`
- Markdown：`.prose-safety`（正文 `#1E293B`、标题 `#0F172A`、链接 `#4F7CFF`）
- 动画：`animate-orbit`、`animate-pulseRing`、`animate-floatY`、`animate-shimmer`、`animate-countUp`、`animate-flowDash`、`orbit-ring`

### 布局硬约束
- 12 栅格（`grid grid-cols-12`），页面最大宽度 1440px
- 所有按钮/卡片等可交互元素**必须**显式绑定 `onClick`（无功能时给 toast 反馈或跳转）
- 数字滚动用 `NumTicker`/`ticker` 类；列表空态必须有明确提示，不留空白

---

## 11. 开发约定与禁忌（Checklist）

开发新功能前逐条核对：

1. 禁止硬编码业务数据：小组名、能量币、项目状态、流水、题目一律来自 store/后端。
2. 任务完成状态完全由 `completedTasks` 驱动；勾选/取消同时联动总进度与阶段进度条；阶段文案/图标按真实完成度（✅已完成 / 🛰️进行中）。
3. 学习路径进度按用户行为动态计算，不写死。
4. 成就殿堂分类 tab 切换必须动态过滤内容。
5. toast：5 秒自动收起，铃铛显示未读数；**按角色区分内容**（教师看项目进度/安全认证提醒；学生看挑战邀请/能量币通知）。
6. 通知中心订阅 uiStore 渲染业务 toast（转账成功、挑战发起、投标等）。
7. 组间通讯必须包含：挑战系统、专家招募、能量币转账。
8. 前端数据：配置了 `VITE_API_BASE_URL` 走后端；否则 localStorage 离线模式。写操作用乐观更新 + syncQueue。
9. 金币结算只走后端业务端点，禁止前端重复记账。
10. 项目技术点/难点等编辑走 `PUT /api/projects/{id}`（已实现）；题库类（safetyStore、questionBankStore）目前 localStorage 持久化。
11. 后端时间字段返回 ISO；前端过 `reviveDates`。
12. 后端中间件用原生 Koa？——本项目后端是 **FastAPI**（旧有 koa-connect 教训：不要引入 ctx 泄漏的包装层）。
13. 集成后端采用**增量接入**：先保留 store 接口与 UI，内部加同步，避免大面积改 store 签名导致页面崩溃。
14. 提交前跑 `npm run check`（前端）与 `pytest`（后端）。

---

## 12. 待办与扩展点（Backlog）

| 项 | 现状 | 下一步 |
|---|---|---|
| 安全考核指派 | 已完成：教师端 `/teacher/safety` 建指派（类别/题数/限时/及格线/截止/目标班级或小组），学生面板按角色分流可见，考试页读 `?assignment=` 生效参数 | 未做：指派编辑（改则删重建）、服务端强制计时（现为客户端倒计时） |
| 章节测验接待后端 | 已完成：当初「开始测验」跳的是编造的会话 id（`${topicId}-quiz`），测验页找不到就退化抽全局前 10 题、交卷报「评分会话不存在」且成绩不存；后端三个端点早已写好却从没被调用。现已接通，记录按学生存/取，学习路径前 5 步据此判定 | 未做：断线续答、按主题的错题本 |
| 首页假数据清理 | 部分完成：删掉了写死的 4 条「今日任务」清单、把环的标签从「今日任务进度」改为「学习路径进度」、前 5 步改成真实信号 | 未做（见下方「其余已知假数据」） |
| 题库审核多端共享 | questionBankStore 仅 localStorage + 种子数据 | 后端建 review_questions 表；学生提交→教师审核全链路持久化 |
| 题目示意图 | 学生/教师提交题无 image 字段 | ReviewableQuestion 增加可选 imageUrl |
| 冻结项目原因/冻结天数 | 后端 Project 无 freezeReason/frozenAt | 加字段与教师冻结操作端点 |
| 超时招募自动结算 | 前端仅预警展示 | 加定时/管理员触发的自动 resolve 逻辑 |
| 小组头像/学生头像 | 仅本地 avatar 字段 | 头像上传后端存储 |
| `components/ui/Dialog.tsx` 是死代码 | 全仓库无人引用，且用的是**不存在的 token**（`physics-50`/`physics-800`/`card-base` 都没定义），谁想复用都会得到一个没样式的弹窗。新建弹窗请照 `ChangePasswordModal.tsx` 或各页内的既有写法 | 直接删掉，或改成用语义色 token 重写后再用 |
| 挑战要求恰好 10 道题，但多数主题凑不够 | 表单硬性要求选满 10 题，而题库各主题题量为 `topic-1` 17、`topic-2` 13、其余 6 个主题只有 4~7 题——**实际只有前两个主题能发起挑战** | 把「恰好 10 题」放宽为「3~10 题」，奖励按实际题数累加（计价逻辑已经支持任意题数） |

### 其余已知假数据（2026-09-15 全量审计，尚未修）

一次全仓审计列出约 40 处「界面显示的不是真实状态」。上面的两行是已修的部分，以下是**尚未处理**的，按类型归类（改动时请逐条核实现状，别照抄）：

- **学生个人面板上的写死数字**：`ResearchProfile` 整块升级进度（94% / 4700/5000 EXP / LV8）、学期目标 3/5、徽章分母 24 全是编的。`Login` 的「已完成 5/11」与统计条 22400/6/13。
  *（Dashboard 那几处——能量面板 62% 进度条、教师名「杨静老师」、排行榜 `#0`、成就卡成员数、两处写死 toast、Lab News 第 4 条金额恒 +0——2026-09-15 已修）*
- **KnowledgeGalaxy**：「已掌握 N」由 `(sIdx+cIdx+pIdx)%3!==2` 编造；「N 道关联题」编造；「9 大知识星系」实际只有 8 个；难度下拉是死控件。
- **学习页 `LearningHub`**：`TOPIC_META` 的章数（12/15/10/9/11/10/8/7）与难度星级是写死的；参考答案/解析写死成库仑定律那套，点任何知识点都一样。
- **项目/市场**：`ProjectCenter` 看板任务的负责人（张伟/李娜/…）、奖励、截止日全编，且预设 3 个任务为已完成；「6 颗项目行星」实际 10 个。`ResearchMarketplace` 投标进度 10/60/100 编造。
- **成果馆/联赛**：`AchievementHall` 的「本学期优秀作品 · N 人点赞」是拼出来的假教师署名（**仍未修**）。
  *（浏览量 `点赞×2+60`、「本月 Top3」标错时段、「大成果卡 ×5」三处 2026-09-26 已修；`ResearchLeague`「赛季剩余 42 天」与 `SEASON 2026 SPRING`、以及「Season Trends」曲线 2026-09-29 已修——详见下条）*
- **`ResearchLeague` 的「Season Trends」图（2026-09-29 已修）**：原先是把各组**近 30 天的流水 delta 从 0 累加**，既不用真实余额、也不算 30 天前的记录。实测生产数据：牛顿先锋队图上 −121 而真实余额 71（差 192），爱因斯坦脑洞组 157 对 67，且**出现负数**——而 `add_tx` 把余额扣到 0 为止，余额不可能为负。另有 15 笔（合计 +7500，含每组 500 初始币）落在窗口外被整个丢掉。现改为**以各组当前真实余额为锚点向过去反推**（`balance(d) = 当前余额 − d 之后全部流水之和`），末值恒等于排行榜余额、永不为负；因为教师端「批量重置能量币」（`POST /groups/reset-coins`）是直接改余额、**不写流水**，重置前的日子会反推出负数，那条线就从最后一个负数之后起画（即只显示重置后的部分）。图注并由 `30D` 改为「近 30 天余额」以免再被读成净增减。
- **教师端**：`TeacherOverview`「超过 3 天未解冻将自动扣除押金」功能不存在；「已向组长发送解冻提醒」只弹 toast；写死班名「闽西职业技术学院特色班」。`StudentRoster` 写「默认密码 student123」，而生产实际是 `123456`（**会误导老师发错密码**）。
  *（流水「导出 CSV」原本只弹「即将上线」、标题「Top 20」实为「最新 20 条」、`downloadCSV` 字段值未转义——均 2026-09-28 已修）*
- **种子数据**：`backend/app/seed.py` 的 `build_showcase` 写死 `loves = 8 + i*3`，生产库那两件作品的点赞数（8、11）就是这么来的，`loved_by` 是空的（没人点过）。

---

## 13. 常见坑（经验教训）

1. **刷新后数据消失**：只调 `initAuth()` 不会恢复分组/学生数据，必须 `bootstrapFromApi()`。
2. **教师端看不到管理入口**：教师与学生共用 `MissionShell`，但侧边栏项按角色不同（教师 6 项）；新教师页面务必同时加入侧边栏。
3. **流水顺序错**：coinTxs 必须时间正序存储，取最近记录用 reverse+slice。
4. **教师看到学生通知**：toast 必须按角色生成，禁止写死一套消息。
5. **未定义色名**导致文字不可读：只用 tailwind.config 中定义的语义色。
6. **进度/状态写死**导致 UI 联动断裂：一切进度由 completedTasks/projects 状态实时计算。
7. **后端测试缺依赖**：务必用 `backend/.venv/bin/python`。
8. **重启后端**会使旧 token 失效（jwt_secret 变更时）；改 schemas/models 后需重启 uvicorn（未开 --reload）。
9. **两个 challenge 路由别混淆**：`/theory/challenge`（无 s）渲染 `KnowledgeGalaxy`；`/theory/challenges`（带 s）渲染 `TheoryChallenge`（挑战大厅）。两者都在使用。改路由前读 `src/app/App.tsx`。
10. **判断页面是否被使用别只看 `src/app/App.tsx`**：页面之间会互相引用（`ClassComposition.tsx` 由 `AdminConsole.tsx` 内嵌为 tab，不占路由）。删页面前全仓库 grep 组件名。
11. **图片资源**：需要生成图片时使用内置 text_to_image API URL，不用占位图。
12. **主题 id 只有一套**：`topic-N`（N 从 1 起，不补零）。`mockTopics.ts`、`LearningHub` 的 `TOPIC_META`、store 的 `topics`、后端 seed 必须一致——历史上前两者用 `topic-0N`、后两者用 `topic-N`，导致按主题抽题永远抽到 0 道。
13. **测验会话属于个人**：`quizSessions` 在线时由后端按 `user_id` 返回、**正序**存（有消费方做 `reverse().slice(0,4)`），且**不写 localStorage**；退出登录时会清。别把它当成 org 级缓存用。
14. **`startQuiz` 是 async**：会话 id 由服务端下发，调用方必须 `await` 后再跳转；离线/后端不可用时退回本地建会话（会带 `userId` 便于离线筛选）。
15. **改已有的表要补迁移**：`create_all` 只建缺失的表、**不给已有表加列**。新增列必须写进 `database.py::_run_lightweight_migrations()`（不然线上库缺列，一读就炸）。

## 14. 结构维护边界（2026-10-11）

前端依赖为 `pages/components → store → lib/api → apiClient`；领域类型来自 `types`，浏览器持久化来自 `lib/storage`。`lib/apiService.ts` 保留兼容公共入口，不再堆积实现。`data/mockData.ts` 只由 App 与 groupStore 在离线模式初始化种子；其他文件不依赖演示数据模块。

`apiClient` 只转换约定为 Date 的字段，题干、投稿时间及反馈时间等 string 字段保留字符串。无时区日期按 UTC，明确时区原样解析。旧会话响应不再写入新会话，迟到的旧 token 401 不会注销新 token；当前 401 清业务缓存后跳转登录。核心契约由 `npm run test:core` 检查。

本次拆分没有引入新的前后端依赖、迁移真实数据库或改变页面 URL。当前仍存在跨 store 同步、全量快照加载与大型页面；后续应按功能逐步提取 store 和页面用例，不以改目录代替状态边界治理。数据库版本迁移、挑战多组答题奖励池及全校内容可见性需要单独定义契约和验收。

首次播种必须配置非空、非占位符密码；已有数据库跳过账号播种，不因缺少环境密码而重置账户。播种日志不输出密码。
