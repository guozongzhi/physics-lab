# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概况

物理实验室（Physics Mission Control）——面向高中物理教学的**游戏化沉浸式学习平台**。三种角色：**学生**（`/dashboard`）、**教师**（`/teacher/overview`）、**管理员**（`/admin`），三者路由经 `src/app/layouts/AppShell.tsx` 共用一个 `MissionShell`。教师导航 7 项（overview / groups / projects / roster / question-bank / safety / showcase），学生导航 11 项（dashboard / my-team / theory-topics / theory-challenge / communicator / projects / safety-lab / recruit-market / coins / showcase / profile）。重构状态见 `docs/refactoring/PROGRESS.md`；设计细节在 `docs/DESIGN.md`（代码与文档不一致时以代码为准并同步更新文档）。

单仓库：根目录为 Vite React 前端，`backend/` 为 FastAPI 后端。仓库**公开托管**在 `github.com/shuhua-uiuc/physics-lab`，因此**任何被 git 跟踪的文件都等于对外公开**——真实密码、服务器地址、学生姓名一律不得写进其中（示例文件用占位符）。

## 常用命令

前端（仓库根目录）：
```bash
npm run dev       # Vite 开发服务器（默认 5173；端口被占时 vite 会自动 +1）
npm run check     # tsc -b --noEmit（提交前必须通过）
npm run build     # tsc -b && vite build（已配置 vendor 分包）
npm run lint      # eslint；2026-10-11 本轮基线为 0 错误 / 0 警告
npm run test:core # 核心契约与模块依赖检查
```

推送 GitHub（**本机 `gh` 登录账号 `shuhua-uiuc` 与 SSH 密钥所属账号不一致，用 SSH 会被拒**）：
```bash
git -c credential.helper='!gh auth git-credential' push
```

后端（必须用 venv——系统 Python 缺 jose/bcrypt）：
```bash
cd backend
.venv/bin/uvicorn app.main:app --port 8000
.venv/bin/python -m pytest tests/ -q                        # 全部测试
.venv/bin/python -m pytest tests/test_projects.py -q        # 单个文件
.venv/bin/python -m pytest "tests/test_projects.py::test_update_project_partial_fields_keep_others" -q   # 单个测试
```

登录名：教师 `teacher`、管理员 `admin`、学生**预置数据是 `u-01` 起，但教师批量导入的学生其登录名就是姓名本身**（如 `黄雅童`）——见启动时的种子输出，或直接查 `/api/users`。**密码不要从本文档推断**，按加载来源优先级为：本地跑 → `backend/.env`；Docker 部署 → 仓库根 `.env`；两者都没配 → `backend/app/config.py` 的兜底值，而那是**首次播种禁止使用的占位符** `change-me-via-env`；已有账号密码以数据库哈希为准。

**改密码的正确做法**：密码哈希存在数据库 `users.password_hash` 里，而 `seed()` 只在**空库**时才会去读 `.env`。所以已有数据的库改了 `.env` 也不会生效，必须直接改库——用后端镜像跑一段 `bcrypt.hashpw` 更新该字段即可，**不需要 rebuild**；同时把服务器 `.env` 的值一并改掉，保证将来重新播种时一致。

## 架构

### 前端数据流
`pages → Zustand stores（单一数据源）→ lib/apiService → lib/apiClient（fetch + Bearer）`。TS 领域类型在 `src/types/domain.ts`，浏览器存储在 `src/lib/storage.ts`，离线种子数据在 `src/data/mockData.ts`。

由 `VITE_API_BASE_URL` 控制模式（实现见 `src/lib/apiClient.ts`）：
- **离线**（未配置）：store 只读写 `localStorage`。
- **在线**（配置了值）：写操作为**乐观更新**——先改 store + 写 localStorage，再 fire-and-forget 调 `syncToApi(task, label)`（`lib/syncQueue.ts`）。登录/刷新时 `bootstrapFromApi()` 拉取全量数据，`lib/reviveDates.ts` 按字段名把 ISO 字符串转回 `Date`。
- **`VITE_API_BASE_URL=/`（服务器部署用，推荐）**：表示与前端**同源**，请求走相对路径 `/api/...`，由 nginx 同源代理到后端，**完全不产生跨域**。同一个构建产物因此在 IP / 域名 / localhost 下都能直接用，换域名或加 HTTPS 都不必重建。注意里面 `apiEnabled` 判断的是原始值 `RAW_BASE` 而不是去掉尾斜杠的 `API_BASE`——否则 `/` 会被 `replace(/\/$/, '')` 变成空串、被误判成离线模式。

### 前后端契约
后端 Pydantic `CamelModel`（`alias_generator=to_camel`、`populate_by_name`）把 snake_case 字段序列化成 camelCase，与前端 TS 类型对齐。前端始终发 camelCase 键。**未**继承 `CamelModel` 的请求模型（如 `ProjectCreate`/`ProjectUpdate`）用字面 camelCase 字段名，并在路由里手工映射。

### 金币经济——结算只归后端（重要契约）
`src/store/coinStore.ts` 明确约定：`addTx` / `settleChallenge` / `settleRecruitment` / `settleProjectDone` 只是**本地乐观 UI 更新**，不得向后端推送裸金币变动。真正的记账只发生在后端业务端点：`POST /projects/{id}/done`、`POST /challenges/{id}/submit`、`PUT /recruitments/{id}/resolve`、`POST /coins/transfer`。这些操作完成后需重拉 groups/users/coinTxs 对齐（`src/store/projectStore.ts` 的 `refetchAfterSettlement`）。

> 项目/招募结算已增加数据库原子资格检查；余额/流水在同一事务。跨班写入使用 `backend/app/access.py` 的统一策略。挑战多组答题的奖励池、全校内容可见范围仍需后续明确；改动结算代码时不得引入裸金币推送。

### 设计系统
Tailwind + 语义色 token（`mission/energy/growth/nova/alert/danger/ink`）。卡片 `glass-card`、徽章 `chip-*`、按钮 `btn-*`。Markdown 必须包在 `.prose-safety` 内渲染。所有可交互元素需显式绑定 `onClick`（无功能时给 toast 或跳转）。页面中禁止硬编码业务数据——一律从 store 取。

## 易踩坑的规则

- **刷新丢数据**：只调 `initAuth()` 不会恢复分组/学生数据，必须 `bootstrapFromApi()`。教师总览用 `bootstrapFromApi(true)` 强制拉最新。
- **两套数据库互不相通**（曾导致"我做的数据不见了"的误判）：Docker 路线的数据在卷 `physics_lab_db-data`（容器内 `/data/physics_lab.db`），直接跑 uvicorn 的路线在 `backend/physics_lab.db`。同一套界面连不同后端就是两个库。排查"数据消失"先确认地址：`:8080` = Docker 库，`:8000` = 本地库，`.env.local` 的 `VITE_API_BASE_URL` 决定 Vite 开发服务器连哪个（现指向 8080，与部署一致）。
- `coinTxs` 必须**时间正序**存储；展示"最近 N 条"用 `reverse` + `slice`。
- **后端测试必须用 `backend/.venv/bin/python`**（系统 Python 缺依赖）。
- 改 `schemas.py`/`models.py` 后需重启 uvicorn（dev 服务器未开 `--reload`）；重启若 `jwt_secret` 变更会使旧 token 失效。
- `/theory/challenge`（无 `s`）和 `/theory/challenges`（带 `s`）**是两个不同页面，都还挂着**：前者渲染 `KnowledgeGalaxy`（知识星系），后者渲染 `TheoryChallenge`（挑战大厅）。不是新旧拼写关系。
- **判断页面是否被使用，不能只 grep `src/app/App.tsx`**——页面之间会互相引用（如 `ClassComposition.tsx` 由 `AdminConsole.tsx` 以 tab 形式内嵌，不经过路由）。要删页面先全仓库 grep 组件名，否则会误删。
- 改导航/路由前先读 `src/app/App.tsx`（路由表和角色守卫）；`src/App.tsx` 是兼容转发。`src/pages/` 里可能留有没被任何路由引用的文件。
- **加路由时页面不包 `MissionShell`**：`src/app/App.tsx` 用父路由与 `AppShell` 统一包裹，子页面只返回页面内容。登录页独立。看到顶栏或侧边栏重复时检查父布局与页面是否都创建了 Shell。
- **"我的 / 本组的"指标必须按本组口径统计**：Dashboard 的学习路径进度曾用全局数据（`projects.length > 0`、`coinTxs.length > 0` 之类）判断，结果任何一个小组做了项目、全校学生都显示同一个 45%。凡是呈现在学生个人视角的数字，都要先 `filter(x => x.groupId === groupId)`。同理 `/profile` 的能力六维图不要加写死的基线分（曾被加成"零活动也有 60/40/40/45/50/45"的假能力值）。
- **后端测试用例数量以本次 pytest 输出为准**，`pytest tests/ -q` 约 6 秒跑完，改完随手跑一次很划算。

## 部署

### 工作流（先本地，后确认，再同步）
**本地调通 → 把"改了什么 / 怎么验证的 / 影响范围"汇报给用户 → 等用户明确确认 → 才同步服务器。** 用户没点头之前不要顺手 rsync + rebuild 上线（此前这么做被用户叫停）。推 GitHub 不受此限，那只是代码备份。

确认后：
```bash
rsync -az --exclude node_modules --exclude dist --exclude '.env' --exclude '.env.local' \
  --exclude 'backend/.venv' --exclude '__pycache__' --exclude '*.db' \
  ./ ubuntu@<服务器>:/home/ubuntu/Physics_lab/
ssh ubuntu@<服务器> 'cd /home/ubuntu/Physics_lab && docker compose build && docker compose up -d'
```

### 通用要点
见 `DEPLOY.md`。Docker Compose 双服务（`web` 用 nginx 托管 `dist` 并**同源代理 `/api` 到 backend**，因此不涉及 CORS）；`VITE_API_BASE_URL` 是**构建期烘焙**进前端的，改端口/域名/IP 必须 `docker compose build` 重建，否则前端连不上后端。首次启动由 `docker-entrypoint.sh` 跑幂等的 `python -m app.seed`。

**生产环境的实际地址、端口、密码一律不写进本文件**——本仓库公开托管。需要时向用户询问。

### 已知部署注意（生产服务器是共享机）
- 生产服务器上还跑着**其他项目**（另一个 Postgres 项目、一个 Caddy/Redis/MySQL 项目，以及宿主机 nginx 托管的若干域名）。**动任何东西前先确认不碰它们**；8080、80、8000、3000、3100 等端口已被占用，本项目用的是 8090。
- 服务器**没有** `/etc/docker/daemon.json` 镜像加速。拉基础镜像的正确做法是 `docker pull docker.m.daocloud.io/library/<img>` 再 `docker tag` 回原名，**不要去改共享的 daemon.json**。
- 服务器上的代码目录**不是 git 仓库**，更新只能靠 rsync；数据库在 Docker 卷里（`docker compose build/up` 不会动它）。
- 容器内是 SQLite，`VITE_API_BASE_URL=/` 让前端与 API 同源；宿主机 nginx 另有一条域名转发到 8090。
