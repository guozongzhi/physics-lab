from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import init_db
from .routers import admin, auth, coins, groups, projects, theory, review_questions, quiz, safety, recruitments, showcase

# 与 config.py 中的开发默认值保持一致；使用默认密钥时启动阶段给出告警
_DEV_DEFAULT_JWT_SECRET = "physics-mission-control-dev-secret-change-me"

app = FastAPI(
    title="Physics Mission Control API",
    description="物理研究基地后端 —— 认证、小组、题库、项目、招募、能量币等业务接口",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()

    # 已有数据的库不会走 seed() 的灌种分支（它在"库里有 Group"时提前返回），
    # 所以在这里补一次内置安全题。幂等；失败也绝不阻塞启动。
    import logging

    _log = logging.getLogger("uvicorn.error")
    try:
        from .database import SessionLocal
        from .seed import ensure_safety_questions

        db = SessionLocal()
        try:
            added = ensure_safety_questions(db)
            if added:
                _log.info("已灌入内置安全题 %d 道", added)
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001  启动期任何异常都不应挡住服务
        _log.warning("安全题补种失败（不影响启动）：%s", exc)

    if settings.jwt_secret == _DEV_DEFAULT_JWT_SECRET:
        _log.warning(
            "JWT 密钥仍为开发默认值，任何人可伪造 token；请在 backend/.env 中配置 JWT_SECRET 后重启服务"
        )


@app.get("/api/health", tags=["health"])
def health() -> dict:
    return {"status": "ok", "service": "physics-mission-control"}


app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(groups.router)
app.include_router(theory.router)
app.include_router(projects.router)
app.include_router(coins.router)

app.include_router(review_questions.router)

app.include_router(quiz.router)
app.include_router(safety.router)
app.include_router(recruitments.router)
app.include_router(showcase.router)
