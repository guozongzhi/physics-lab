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

## 能量币转账审核

- `POST /api/coins/transfer`：仅学生组长可从本组向本班其他小组提交申请，返回 `pending`，不改余额、不生成资金流水；沿用课堂开放窗口限制。
- `GET /api/coins/transfers`：学生查看本组收付款申请，教师按班级权限查看审核记录。
- `POST /api/coins/transfers/{id}/review`：教师提交 `{"decision":"approve"或"reject","note":"审核意见"}`。通过时重新校验余额，同一事务完成审核状态和双方流水；余额不足保留待审核状态，重复审核返回 409。窗口关闭不阻止教师审核已有申请。
- 教师仍可用 `POST /api/groups/{id}/coins`、`POST /api/users/{id}/coins` 直接增减小组或个人能量币，无需转账审核；前端入口在教师“小组管理”的“±能量币”及成员管理中。

后端启动时自动创建转账申请表，保留既有余额与流水。前后端需一并更新，旧客户端应刷新页面后使用。
