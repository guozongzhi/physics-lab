"""SQLAlchemy 数据模型。

字段命名尽量对齐前端 TypeScript 类型（src/types/domain.ts），
对于数组 / 嵌套对象采用 JSON 列存储，保证前后端数据结构一致、迁移零损耗。
"""

from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Class(Base):
    """班级：一个班级下辖多个小组。学生先归属班级，再加入本班某个小组。"""

    __tablename__ = "classes"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)

    groups: Mapped[list["Group"]] = relationship(back_populates="class_")


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    logo: Mapped[str] = mapped_column(String, default="#0D47A1")
    total_coins: Mapped[int] = mapped_column(Integer, default=0)
    initial_coins: Mapped[int] = mapped_column(Integer, default=0)
    # 所属班级
    class_id: Mapped[str | None] = mapped_column(ForeignKey("classes.id"), index=True, nullable=True)
    # { userId: ratio } —— 组内贡献比例
    contribution_ratio: Mapped[dict] = mapped_column(JSON, default=dict)

    users: Mapped[list["User"]] = relationship(back_populates="group")
    class_: Mapped["Class | None"] = relationship(back_populates="groups")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    # 登录凭证
    username: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    # 邮箱（注册用户填写；预置账号可为空）。可作为登录凭证之一。
    email: Mapped[str | None] = mapped_column(String, unique=True, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    # teacher / student
    account_role: Mapped[str] = mapped_column(String, default="student")

    name: Mapped[str] = mapped_column(String, nullable=False)
    avatar: Mapped[str] = mapped_column(String, default="")
    # 学生所属班级（注册时选择；未选组时也已归属班级）
    class_id: Mapped[str | None] = mapped_column(ForeignKey("classes.id"), index=True, nullable=True)
    group_id: Mapped[str | None] = mapped_column(ForeignKey("groups.id"), nullable=True)
    # leader / member
    member_role: Mapped[str] = mapped_column(String, default="member")
    personal_coins: Mapped[int] = mapped_column(Integer, default=0)

    group: Mapped["Group | None"] = relationship(back_populates="users")


class CoinTransferRequest(Base):
    """待审核转账独立保存；只有审核通过才写入资金流水。"""

    __tablename__ = "coin_transfer_requests"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    source_group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), index=True)
    target_group_id: Mapped[str] = mapped_column(ForeignKey("groups.id"), index=True)
    requested_by: Mapped[str] = mapped_column(String)
    amount: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    reviewed_by: Mapped[str | None] = mapped_column(String, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str] = mapped_column(Text, default="")


class CoinTransaction(Base):
    __tablename__ = "coin_transactions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    group_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    source: Mapped[str] = mapped_column(String, nullable=False)  # challenge/project/recruit/teacher_set/penalty
    ref_id: Mapped[str] = mapped_column(String, default="")
    delta: Mapped[int] = mapped_column(Integer, default=0)
    balance_after: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    note: Mapped[str] = mapped_column(String, default="")


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    # [{ chapter, points: [] }]
    outline: Mapped[list] = mapped_column(JSON, default=list)
    ai_material: Mapped[str] = mapped_column(Text, default="")


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    type: Mapped[str] = mapped_column(String, nullable=False)  # single/multiple/judge
    stem: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list] = mapped_column(JSON, default=list)
    # 存储答案（number / number[] / bool），统一用 JSON
    answer: Mapped[object] = mapped_column(JSON)
    knowledge_point: Mapped[str] = mapped_column(String, default="")
    difficulty: Mapped[int] = mapped_column(Integer, default=1)
    topic_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    safety_category: Mapped[str | None] = mapped_column(String, nullable=True)


class QuizSession(Base):
    __tablename__ = "quiz_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    topic_id: Mapped[str] = mapped_column(String, index=True)
    user_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    # 题目快照
    questions: Mapped[list] = mapped_column(JSON, default=list)
    user_answers: Mapped[dict] = mapped_column(JSON, default=dict)
    score: Mapped[int] = mapped_column(Integer, default=0)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    blind_points: Mapped[list] = mapped_column(JSON, default=list)
    # 是否已交卷判分。前端学习路径要区分「开始过测验」与「已完成检测」，
    # 靠 score 推断不可靠（全错也是 0 分），所以显式记一个标记。
    graded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    creator_group_id: Mapped[str] = mapped_column(String, index=True)
    topic_id: Mapped[str] = mapped_column(String, index=True)
    question_ids: Mapped[list] = mapped_column(JSON, default=list)
    reward: Mapped[int] = mapped_column(Integer, default=0)
    deadline: Mapped[datetime] = mapped_column(DateTime, default=_now)
    status: Mapped[str] = mapped_column(String, default="open")  # open/closed
    # [{ groupId, answers, accuracy, earned, submittedAt }]
    submissions: Mapped[list] = mapped_column(JSON, default=list)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    topic: Mapped[str] = mapped_column(String, default="")
    owner_group_id: Mapped[str] = mapped_column(String, index=True)
    start_date: Mapped[datetime] = mapped_column(DateTime, default=_now)
    due_date: Mapped[datetime] = mapped_column(DateTime, default=_now)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="planning")
    tech_points: Mapped[str] = mapped_column(Text, default="")
    difficulties: Mapped[str] = mapped_column(Text, default="")
    # [{ name, qty, category }]
    equipment_list: Mapped[list] = mapped_column(JSON, default=list)
    safety_category: Mapped[str] = mapped_column(String, default="mechanical")
    # { userId: bool }
    safety_passed: Mapped[dict] = mapped_column(JSON, default=dict)
    photos: Mapped[list] = mapped_column(JSON, default=list)
    results: Mapped[str] = mapped_column(Text, default="")
    reward_coins: Mapped[int] = mapped_column(Integer, default=200)


class Recruitment(Base):
    __tablename__ = "recruitments"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(String, index=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    skills: Mapped[list] = mapped_column(JSON, default=list)
    reward: Mapped[int] = mapped_column(Integer, default=0)
    deadline: Mapped[datetime] = mapped_column(DateTime, default=_now)
    status: Mapped[str] = mapped_column(String, default="open")  # open/assigned/done/failed
    # [{ userId, skillDesc, hours, bidAt }]
    bids: Mapped[list] = mapped_column(JSON, default=list)
    assignee_user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    result: Mapped[str | None] = mapped_column(String, nullable=True)  # success/partial/fail
    actual_pay: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 发布招募时从发包组预扣的押金（余额不足则不允许发布，因此正常等于 reward）。
    # 历史数据（本次改动之前发布的）为 0，结算时会补扣，见 services.settle_recruitment。
    escrow_paid: Mapped[int] = mapped_column(Integer, default=0)


class ShowcaseItem(Base):
    __tablename__ = "showcase_items"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(String, default="")
    title: Mapped[str] = mapped_column(String, nullable=False)
    cover_image: Mapped[str] = mapped_column(String, default="")
    group_id: Mapped[str] = mapped_column(String, index=True)
    author_user_id: Mapped[str] = mapped_column(String, default="")
    demo_kind: Mapped[str] = mapped_column(String, default="")
    html_content: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    loves: Mapped[int] = mapped_column(Integer, default=0)
    loved_by: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    # 教师审批：pending / approved / rejected。新上传一律 pending，教师通过后才公开展示
    status: Mapped[str] = mapped_column(String, default="pending", index=True)
    reject_reason: Mapped[str] = mapped_column(Text, default="")
    # 审批通过时奖给该小组的能量币（同时已通过 add_tx 计入小组总能量与流水）
    awarded_coins: Mapped[int] = mapped_column(Integer, default=0)
    # 作品分类（展览馆顶部的筛选 tab）。上传表单一直让学生选，但从前端到模型都没有这个字段，
    # 选了等于白选、tab 也永远筛不出东西。存量作品回填为 photo。
    category: Mapped[str] = mapped_column(String, default="photo", index=True)


class SafetyExamAttempt(Base):
    """服务端保存题目快照与判分状态，客户端只收到无答案的题目。"""

    __tablename__ = "safety_exam_attempts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    category: Mapped[str] = mapped_column(String)
    assignment_id: Mapped[str | None] = mapped_column(String, nullable=True)
    project_id: Mapped[str | None] = mapped_column(String, nullable=True)
    questions: Mapped[list] = mapped_column(JSON, default=list)
    pass_score: Mapped[int] = mapped_column(Integer, default=80)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    graded: Mapped[bool] = mapped_column(Boolean, default=False)
    score: Mapped[int] = mapped_column(Integer, default=0)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)


class ClassMeta(Base):
    __tablename__ = "class_meta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    initial_coins_per_group: Mapped[int] = mapped_column(Integer, default=500)
    term_name: Mapped[str] = mapped_column(String, default="")
    # 挑战奖励单价：按所选题目各自的难度累加出奖励，学生不能自己填。
    # 定价权归教师——原先奖励由学生自定（默认 100），一局赚的比老师手发一笔还多。
    coin_easy: Mapped[int] = mapped_column(Integer, default=1)
    coin_medium: Mapped[int] = mapped_column(Integer, default=2)
    coin_hard: Mapped[int] = mapped_column(Integer, default=3)

    # 教师可控的开放窗口。关闭后学生不能"新开局"（建挑战/发招募/投标/组间转账），
    # 但已经开着的挑战与招募照常作答、结算——否则押金会卡在中间谁也拿不回。
    # minutes 是老师选的时长（空＝不限时），closes_at 是按下开关那一刻算出的到期点；
    # 两个都存：minutes 供界面回显选项（不会随时间衰减），closes_at 供判定是否到点。
    challenge_window_open: Mapped[bool] = mapped_column(Boolean, default=True)
    challenge_window_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    challenge_window_closes_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    recruit_window_open: Mapped[bool] = mapped_column(Boolean, default=True)
    recruit_window_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recruit_window_closes_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class SafetyRecord(Base):
    """安全科目考核记录：某个学生某安全分类（electric/thermal/...）的一次考试结果。"""

    __tablename__ = "safety_records"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    category: Mapped[str] = mapped_column(String, nullable=False, index=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    # 来自哪条教师指派；自由练习为空。学生面板据此判断"这条指派我通过了没有"
    # （按 (user_id, category) 判断不够——同类别可能既有指派又有自由练习）
    assignment_id: Mapped[str | None] = mapped_column(String, index=True, nullable=True)


class SafetyAssignment(Base):
    """教师指派的一次安全考核任务。

    目标用两个可空外键表达"班级**或**小组"（恰好填一个，由请求模型校验），
    沿用本仓库"受众用单个 FK 列"的约定（如 projects.owner_group_id）。
    """

    __tablename__ = "safety_assignments"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False, index=True)
    question_count: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    time_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=15)  # 分钟
    pass_score: Mapped[int] = mapped_column(Integer, nullable=False, default=80)
    deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    class_id: Mapped[str | None] = mapped_column(ForeignKey("classes.id"), index=True, nullable=True)
    group_id: Mapped[str | None] = mapped_column(ForeignKey("groups.id"), index=True, nullable=True)
    created_by: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class ReviewQuestion(Base):
    """投稿审核记录；新增独立表，保留现有题库和历史成绩。"""
    __tablename__ = 'review_questions'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    submitted_by: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)


class NfcDevice(Base):
    __tablename__ = "nfc_devices"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    allowed_class_ids: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class NfcCard(Base):
    __tablename__ = "nfc_cards"

    # HMAC index only: do not store the raw UID.
    uid_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    uid_mask: Mapped[str] = mapped_column(String, nullable=False)
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    # Nullable unique key enforces at most one active card per student in the DB.
    active_user_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class NfcAdminAudit(Base):
    __tablename__ = "nfc_admin_audit"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    actor_id: Mapped[str] = mapped_column(String, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    target_id: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class NfcInventory(Base):
    __tablename__ = "nfc_inventory"
    uid_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    uid_ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
