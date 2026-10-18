# 物理实验室（Physics Mission Control）

面向高中物理教学的**游戏化沉浸式学习平台**。学生以"科研小组"为单位，在"物理任务指挥中心"氛围中完成学习、答题挑战、项目实验与协作；教师和管理员在控制台进行分组、题库、项目、安全认证与班级管理。

三种角色：

| 角色 | 入口 | 核心功能 |
|---|---|---|
| 学生 | `/dashboard` | 学习路径、答题挑战、项目实验、招募市场、组间转账、成就 |
| 教师 | `/teacher/overview` | 总览数据台、分组管理、学生名册、班级管理、题库审核、安全题库维护、NFC 卡片 |
| 管理员 | `/admin` | 教师账号管理（班级等业务管理已并入教师端） |

## 技术栈

- **前端**：Vite 6 + React 18 + TypeScript + Zustand + react-router-dom 7 + TailwindCSS（根目录）
- **后端**：FastAPI + SQLAlchemy + SQLite + JWT（`backend/`）
- **部署**：Docker Compose（nginx 托管前端并同源代理 `/api`）

## 快速开始

前端（仓库根目录）：

```bash
npm install
npm run dev       # http://localhost:5173
npm run check     # 类型检查（提交前必须通过）
npm run lint      # 静态检查
npm run test:core # 日期、错误、会话、模块依赖与完成结算契约
```

后端（必须用项目自带 venv，系统 Python 缺依赖）：

```bash
cd backend
.venv/bin/uvicorn app.main:app --port 8000
.venv/bin/python -m pytest tests/ -q
```

前端不配 `VITE_API_BASE_URL` 时走 **localStorage 离线演示模式**；配置后进入在线模式。在线测验与安全考核由服务端判分，业务写入后会重拉服务端快照；无法完成数据引导时不会沿用上一账号的缓存。本地联调可复制 `.env.example` 为 `.env.local` 并设为 `http://localhost:8000`。

## 默认账号

登录名：教师 `teacher`、管理员 `admin`、学生 `u-01` 起。

密码取决于加载的配置：本地跑读 `backend/.env`，Docker 部署读仓库根 `.env`（从 `docker.env.example` 复制），两者都没有则回退到 `backend/app/config.py` 的默认值。**生产环境务必改密。**

## 部署

见 [DEPLOY.md](DEPLOY.md)。前端由 nginx 托管并与后端同源（无 CORS）；`VITE_API_BASE_URL` 在构建期烘焙，改端口/域名/IP 需重新构建。

## 文档

- [docs/DESIGN.md](docs/DESIGN.md) —— 权威设计文档（架构、数据流、路由、API、设计系统）
- [docs/refactoring/README.md](docs/refactoring/README.md) —— 分阶段重构计划、当前进展与 UI 截图
- [CLAUDE.md](CLAUDE.md) —— 面向 AI 助手的开发约定与易踩坑清单
- [DEPLOY.md](DEPLOY.md) —— Docker 部署与运维
