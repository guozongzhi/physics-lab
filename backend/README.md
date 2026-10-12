# Physics Mission Control — 后端服务

基于 **FastAPI + SQLAlchemy + SQLite** 的后端，为「物理研究基地」前端提供数据持久化、
账号密码 JWT 认证以及全部业务实体的 REST API。

## 技术栈

- FastAPI（Web 框架）
- SQLAlchemy 2.0（ORM）
- SQLite（默认数据库，零配置；可通过 `DATABASE_URL` 切换为 Postgres 等）
- python-jose（JWT）+ passlib[bcrypt]（密码哈希）

## 快速开始

```bash
cd backend

# 1. 创建虚拟环境
python3 -m venv .venv
source .venv/bin/activate

# 2. 安装依赖
pip install -r requirements.txt

# 3. 初始化数据库并导入种子数据（把前端 mock 数据迁移进库）
python -m app.seed

# 4. 启动服务（默认 http://localhost:8000）
uvicorn app.main:app --reload --port 8000
```

启动后可访问交互式 API 文档：<http://localhost:8000/docs>

## 认证说明

- 教师账号：用户名 `teacher`，密码取自 `TEACHER_PASSWORD`（见下方环境变量，必须在 `.env` 中自行设置）
- 学生账号：用户名为学生的登录名（见种子数据打印输出），密码取自 `STUDENT_DEFAULT_PASSWORD`
- 未在 `.env` 配置时，密码兜底为占位符 `change-me-via-env`；首次播种会拒绝空密码/占位符密码，必须配置真实密码。已有账号的密码由数据库哈希决定，修改 `.env` 不会自动更改已有密码。播种日志只打印用户名，不打印密码
- 登录接口 `POST /api/auth/login` 返回 JWT，前端在后续请求头 `Authorization: Bearer <token>` 中携带。

安全考核使用 `POST /api/safety/exams/start` 获取无答案的题目和考核 ID，再向 `POST /api/safety/exams/{id}/submit` 提交答案。服务端判分并写入考核记录；旧的直接提交分数接口 `/api/safety/records` 返回 410。项目安全认证仅接受本项目已通过的服务端考核。

## 环境变量（可选）

在 `backend/` 下创建 `.env` 覆盖默认值：

```
DATABASE_URL=sqlite:///./physics_lab.db
JWT_SECRET=change-me-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=720
TEACHER_PASSWORD=
STUDENT_DEFAULT_PASSWORD=
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
```
