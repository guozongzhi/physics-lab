from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

# SQLite 需要 check_same_thread=False 以配合 FastAPI 的多线程访问
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=connect_args, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依赖：提供一个请求级数据库会话。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """建表（如不存在）。"""
    from . import models  # noqa: F401  确保模型已注册

    Base.metadata.create_all(bind=engine)
    _run_lightweight_migrations()


def _run_lightweight_migrations() -> None:
    """针对已存在的表补充新增列（SQLite 场景）。

    create_all 不会为已存在的表添加新列，这里用 PRAGMA 检查后按需 ALTER TABLE，
    保证老数据库升级后可直接使用（无需 drop 重建）。
    """
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    user_columns = {col["name"] for col in inspector.get_columns("users")}
    if "email" not in user_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)"))
    if "class_id" not in user_columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN class_id VARCHAR"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_class_id ON users (class_id)"))

    if "groups" in inspector.get_table_names():
        group_columns = {col["name"] for col in inspector.get_columns("groups")}
        if "class_id" not in group_columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE groups ADD COLUMN class_id VARCHAR"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_groups_class_id ON groups (class_id)"))

    # 成果展览馆的教师审批字段。加 status 的同时把存量作品标为 approved：
    # 它们在旧模型下本就是直接公开展示的，不该因为这次改动突然变成"待审批"。
    if "showcase_items" in inspector.get_table_names():
        sc_columns = {col["name"] for col in inspector.get_columns("showcase_items")}
        with engine.begin() as conn:
            for column in ("author_user_id", "demo_kind"):
                if column not in sc_columns:
                    conn.execute(text(f"ALTER TABLE showcase_items ADD COLUMN {column} VARCHAR DEFAULT ''"))
            if "status" not in sc_columns:
                conn.execute(text("ALTER TABLE showcase_items ADD COLUMN status VARCHAR DEFAULT 'pending'"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_showcase_items_status ON showcase_items (status)"))
                conn.execute(text("UPDATE showcase_items SET status = 'approved'"))
            if "reject_reason" not in sc_columns:
                conn.execute(text("ALTER TABLE showcase_items ADD COLUMN reject_reason TEXT DEFAULT ''"))
            if "awarded_coins" not in sc_columns:
                conn.execute(text("ALTER TABLE showcase_items ADD COLUMN awarded_coins INTEGER DEFAULT 0"))
            if "html_content" not in sc_columns:
                conn.execute(text("ALTER TABLE showcase_items ADD COLUMN html_content TEXT DEFAULT ''"))
            if "category" not in sc_columns:
                conn.execute(text("ALTER TABLE showcase_items ADD COLUMN category VARCHAR DEFAULT 'photo'"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_showcase_items_category ON showcase_items (category)"))

    # 安全考核记录关联到"教师指派"（自由练习为空）
    if "safety_records" in inspector.get_table_names():
        sr_columns = {col["name"] for col in inspector.get_columns("safety_records")}
        if "assignment_id" not in sr_columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE safety_records ADD COLUMN assignment_id VARCHAR"))
                conn.execute(
                    text("CREATE INDEX IF NOT EXISTS ix_safety_records_assignment_id ON safety_records (assignment_id)")
                )

    # 测验会话是否已交卷判分。存量记录按 score 推断：判过分的才可能有分数或盲点。
    if "quiz_sessions" in inspector.get_table_names():
        qs_columns = {col["name"] for col in inspector.get_columns("quiz_sessions")}
        if "graded" not in qs_columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE quiz_sessions ADD COLUMN graded BOOLEAN DEFAULT 0"))
                conn.execute(
                    text("UPDATE quiz_sessions SET graded = 1 WHERE score > 0 OR blind_points NOT IN ('[]', '')")
                )

    # 挑战奖励单价（按题目难度计价），给已存在的库补列
    if "class_meta" in inspector.get_table_names():
        cm_columns = {col["name"] for col in inspector.get_columns("class_meta")}
        with engine.begin() as conn:
            if "coin_easy" not in cm_columns:
                conn.execute(text("ALTER TABLE class_meta ADD COLUMN coin_easy INTEGER DEFAULT 1"))
            if "coin_medium" not in cm_columns:
                conn.execute(text("ALTER TABLE class_meta ADD COLUMN coin_medium INTEGER DEFAULT 2"))
            if "coin_hard" not in cm_columns:
                conn.execute(text("ALTER TABLE class_meta ADD COLUMN coin_hard INTEGER DEFAULT 3"))
            # 开放窗口。存量库回填成「开着、不限时」：这次上线不能突然改变现有行为，
            # 老师应当是主动去关，而不是发现功能已经被锁上。
            if "challenge_window_open" not in cm_columns:
                conn.execute(text("ALTER TABLE class_meta ADD COLUMN challenge_window_open BOOLEAN DEFAULT 1"))
            if "challenge_window_minutes" not in cm_columns:
                conn.execute(text("ALTER TABLE class_meta ADD COLUMN challenge_window_minutes INTEGER"))
            if "challenge_window_closes_at" not in cm_columns:
                conn.execute(text("ALTER TABLE class_meta ADD COLUMN challenge_window_closes_at DATETIME"))
            if "recruit_window_open" not in cm_columns:
                conn.execute(text("ALTER TABLE class_meta ADD COLUMN recruit_window_open BOOLEAN DEFAULT 1"))
            if "recruit_window_minutes" not in cm_columns:
                conn.execute(text("ALTER TABLE class_meta ADD COLUMN recruit_window_minutes INTEGER"))
            if "recruit_window_closes_at" not in cm_columns:
                conn.execute(text("ALTER TABLE class_meta ADD COLUMN recruit_window_closes_at DATETIME"))

    # 招募押金。存量招募发布时没预扣过，置 0，结算时会补扣（见 services.settle_recruitment）。
    if "recruitments" in inspector.get_table_names():
        rec_columns = {col["name"] for col in inspector.get_columns("recruitments")}
        if "escrow_paid" not in rec_columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE recruitments ADD COLUMN escrow_paid INTEGER DEFAULT 0"))

