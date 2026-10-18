"""Pydantic schemas。

对外 JSON 使用 camelCase（对齐前端 TS 类型），内部用 snake_case，
通过 alias + populate_by_name 完成映射。
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---------- Auth ----------
class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    """学生注册：邮箱 + 用户名 + 密码 + 班级（可选显示名，默认取用户名）。"""

    email: EmailStr
    username: str = Field(min_length=2, max_length=32)
    password: str = Field(min_length=6, max_length=64)
    name: str | None = Field(default=None, max_length=32)
    classId: str


class ChangePassword(BaseModel):
    """用户修改本人密码（需校验原密码）。"""

    oldPassword: str
    newPassword: str = Field(min_length=6, max_length=64)


class UserCoinAdjust(BaseModel):
    """教师调整某学生个人能量币。"""

    delta: int
    note: str | None = None


class GroupCoinsReset(BaseModel):
    """批量重置所有小组能量币为目标值（基线重置，不产生逐组流水）。"""

    targetCoins: int = Field(ge=0, le=1_000_000)


class SafetyRecordCreate(BaseModel):
    """提交一次安全科目考核结果。"""

    category: str
    score: int = Field(ge=0, le=100)
    passed: bool
    # 来自哪条教师指派；自由练习为空。带了它时后端会忽略上面的 passed，
    # 改由该指派的及格线推导（否则学生可伪造 passed=true）
    assignmentId: str | None = None


class SafetyExamStart(BaseModel):
    category: str
    assignmentId: str | None = None
    projectId: str | None = None


class SafetyExamSubmit(BaseModel):
    answers: dict[str, Any]


class SafetyRecordOut(BaseModel):
    id: str
    category: str
    score: int
    passed: bool
    created_at: datetime
    assignment_id: str | None = None

    model_config = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)


class SafetyAssignmentCreate(BaseModel):
    """教师指派一次安全考核。目标必须且**只能**是班级或小组之一。

    与其它请求模型一致：不继承 CamelModel，字段直接用字面 camelCase。
    """

    title: str = Field(min_length=1, max_length=60)
    category: str
    questionCount: int = Field(default=10, ge=1, le=100)
    timeLimit: int = Field(default=15, ge=1, le=300)  # 分钟
    passScore: int = Field(default=80, ge=0, le=100)
    deadline: datetime | None = None
    classId: str | None = None
    groupId: str | None = None

    @model_validator(mode="after")
    def _exactly_one_target(self):
        if bool(self.classId) == bool(self.groupId):
            raise ValueError("classId 与 groupId 必须且只能填一个")
        return self


class SafetyAssignmentOut(CamelModel):
    id: str
    title: str
    category: str
    question_count: int
    time_limit: int
    pass_score: int
    deadline: datetime | None = None
    class_id: str | None = None
    group_id: str | None = None
    created_by: str
    created_at: datetime


class TokenResponse(CamelModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    role: str  # teacher / student
    class_id: str | None = None
    group_id: str | None = None
    name: str
    # 学生是否还在用统一初始密码。前端据此提示「建议修改初始密码」。
    # 教师/管理员恒为 false。离线模式没有这个概念，字段缺省。
    is_default_password: bool = False


# ---------- Class ----------
class ClassOut(CamelModel):
    id: str
    name: str


class ClassCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class ClassRename(BaseModel):
    name: str = Field(min_length=1, max_length=40)


# ---------- Teacher management ----------
class TeacherCreate(BaseModel):
    username: str = Field(min_length=2, max_length=32)
    password: str = Field(min_length=6, max_length=64)
    name: str | None = Field(default=None, max_length=32)


class TeacherOut(CamelModel):
    id: str
    username: str
    name: str
    avatar: str


class PasswordReset(BaseModel):
    password: str = Field(min_length=6, max_length=64)


class GroupClassMove(BaseModel):
    """将小组移动到另一班级（同时更新组内学生的班级归属）。"""
    classId: str


class StudentBatchItem(BaseModel):
    """单个学生上传项。"""
    name: str = Field(min_length=1, max_length=32)
    username: str | None = Field(default=None, min_length=2, max_length=32)
    password: str | None = Field(default=None, min_length=6, max_length=64)


class StudentBatchUpload(BaseModel):
    """批量上传学生名单。"""
    students: list[StudentBatchItem] = Field(min_length=1, max_length=30)


# ---------- Group / User ----------
class GroupOut(CamelModel):
    id: str
    name: str
    logo: str
    total_coins: int
    initial_coins: int
    class_id: str | None = None
    contribution_ratio: dict[str, int]


class GroupCreate(BaseModel):
    name: str
    initialCoins: int = Field(default=500, ge=0)
    classId: str | None = None


class GroupRename(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class UserGroupAssign(BaseModel):
    """把学生分配 / 移动到某小组，或移出（groupId 为 null）。可同时指定成员角色。"""

    groupId: str | None = None
    role: str = "member"  # leader / member


class ContributionUpdate(BaseModel):
    ratioRecord: dict[str, int]


class UserOut(CamelModel):
    id: str
    name: str
    avatar: str
    class_id: str | None = None
    group_id: str | None = None
    role: str  # leader / member（对齐前端 User.role）
    personal_coins: int


class UserAvatarUpdate(BaseModel):
    avatar: str


class CoinDelta(BaseModel):
    """教师调整小组能量币。note 为发放/扣除理由，会写进流水并**对学生可见**。"""

    delta: int
    note: str | None = None


class CoinTransfer(CamelModel):
    """组长发起转账申请，教师审核通过后原子记账。"""

    source_group_id: str
    target_group_id: str
    amount: int = Field(ge=1)
    note: str = Field(default="", max_length=100)


class CoinTransferReview(CamelModel):
    decision: Literal["approve", "reject"]
    note: str = Field(default="", max_length=200)


# ---------- Topic / Question ----------
class TopicOut(CamelModel):
    id: str
    title: str
    outline: list[dict[str, Any]]
    ai_material: str


class QuestionOut(CamelModel):
    id: str
    type: str
    stem: str
    options: list[str]
    answer: Any = None
    knowledge_point: str
    difficulty: int
    topic_id: str | None = None
    safety_category: str | None = None


# ---------- Safety question bank ----------
# 安全题与理论题共用 questions 表，靠 safety_category 区分（该列本就是这个用途）。
# 与其它请求模型一致：不继承 CamelModel，字段直接用字面 camelCase。
class SafetyQuestionInput(BaseModel):
    type: str  # single / multiple / judge
    stem: str
    options: list[str]
    answer: Any
    knowledgePoint: str = ""
    difficulty: int = 1
    safetyCategory: str


class SafetyQuestionUpdate(BaseModel):
    """部分更新：只改传入的字段。answer 不会是 None（判断题是 bool、多选是数组），故用它判断"是否提供"。"""

    type: str | None = None
    stem: str | None = None
    options: list[str] | None = None
    answer: Any = None
    knowledgePoint: str | None = None
    difficulty: int | None = None
    safetyCategory: str | None = None


class SafetyImportRequest(BaseModel):
    questions: list[SafetyQuestionInput]
    mode: str = "merge"  # merge=按题干去重追加；replace=整体替换


# ---------- Quiz ----------
class QuizStartRequest(BaseModel):
    topicId: str


class QuizAnswerRequest(BaseModel):
    qid: str
    answer: Any


class QuizSessionOut(CamelModel):
    id: str
    topic_id: str
    questions: list[dict[str, Any]]
    user_answers: dict[str, Any]
    score: int
    passed: bool
    blind_points: list[str]
    graded: bool = False
    created_at: datetime


# ---------- Challenge ----------
class ChallengeCreate(BaseModel):
    """创建挑战。

    注意**没有 reward 字段**：奖励由服务端按所选题目难度与教师的单价算出
    （`services.challenge_reward_for`），学生不能自定——原先能自填默认 100，
    改个请求体就能随便改。
    """

    title: str
    topicId: str
    questionIds: list[str] = []
    deadline: datetime


class ChallengeSubmit(BaseModel):
    answers: dict[str, Any]


class ChallengeOut(CamelModel):
    id: str
    title: str
    creator_group_id: str
    topic_id: str
    question_ids: list[str]
    reward: int
    deadline: datetime
    status: str
    submissions: list[dict[str, Any]]


# ---------- Project ----------
class EquipmentItem(BaseModel):
    name: str
    qty: int
    category: str


class ProjectCreate(BaseModel):
    title: str
    topic: str
    techPoints: str | None = ""
    difficulties: str | None = ""
    equipmentList: list[EquipmentItem] = []
    dueDate: datetime | None = None
    rewardCoins: int | None = Field(default=200, ge=0)
    # 教师/管理员代建时指定所属小组；学生创建由后端绑定本人小组
    ownerGroupId: str | None = None


class ProjectUpdate(BaseModel):
    """项目信息更新（技术要点/难点、标题、课题、器材、截止日期、成果、照片、奖励币）。

    所有字段可选，仅更新传入的字段；与 ProjectCreate 一样直接使用 camelCase 键。
    """

    title: str | None = Field(default=None, min_length=1, max_length=100)
    topic: str | None = Field(default=None, max_length=100)
    techPoints: str | None = None
    difficulties: str | None = None
    equipmentList: list[EquipmentItem] | None = None
    dueDate: datetime | None = None
    results: str | None = None
    photos: list[str] | None = None
    rewardCoins: int | None = Field(default=None, ge=0)
    status: Literal["planning", "progress", "review", "done", "failed", "frozen"] | None = None
    progress: int | None = Field(default=None, ge=0, le=100)


class ProjectStatusUpdate(BaseModel):
    status: Literal["planning", "progress", "review", "done", "failed", "frozen"]


class ProjectProgressUpdate(BaseModel):
    progress: int


class ProjectOut(CamelModel):
    id: str
    title: str
    topic: str
    owner_group_id: str
    start_date: datetime
    due_date: datetime
    progress: int
    status: str
    tech_points: str
    difficulties: str
    equipment_list: list[dict[str, Any]]
    safety_category: str
    safety_passed: dict[str, bool]
    photos: list[str]
    results: str
    reward_coins: int


# ---------- Recruitment ----------
class RecruitmentCreate(BaseModel):
    projectId: str
    title: str
    description: str
    skills: list[str] = []
    # 必须为正：它在发布时按此数从发包组扣押金，负数会变成"发布就加钱"
    reward: int = Field(gt=0)
    deadline: datetime


class BidCreate(BaseModel):
    userId: str
    skillDesc: str
    hours: int


class AssignRequest(BaseModel):
    userId: str


class ResolveRequest(BaseModel):
    result: str  # success / partial / fail


class RecruitmentOut(CamelModel):
    id: str
    project_id: str
    title: str
    description: str
    skills: list[str]
    reward: int
    deadline: datetime
    status: str
    bids: list[dict[str, Any]]
    assignee_user_id: str | None = None
    result: str | None = None
    actual_pay: int | None = None
    # 发布时从发包组预扣的押金，结算时按它分账
    escrow_paid: int = 0


# ---------- Showcase ----------
# 展览馆顶部的筛选分类。上传时必须选一个，tab 据此过滤。
ShowcaseCategory = Literal["photo", "video", "paper", "model", "award"]


class ShowcaseCreate(BaseModel):
    demoKind: Literal["", "optics", "motor"] = ""
    projectId: str | None = ""
    title: str
    coverImage: str
    groupId: str
    description: str | None = ""
    category: ShowcaseCategory = "photo"


class ShowcaseOut(CamelModel):
    author_user_id: str = ""
    demo_kind: str = ""
    id: str
    project_id: str
    title: str
    cover_image: str
    group_id: str
    description: str
    loves: int
    loved_by: list[str]
    created_at: datetime
    status: str
    reject_reason: str
    awarded_coins: int
    category: str


class ShowcaseUpdate(BaseModel):
    """学生修改本组作品。修改后前端/后端都会把状态重置回 pending（需重新审批）。

    与其它请求模型一致：不继承 CamelModel，字段直接用字面 camelCase。
    """

    title: str | None = None
    coverImage: str | None = None
    description: str | None = None
    category: ShowcaseCategory | None = None


class ShowcaseReview(BaseModel):
    """教师审批。action=approve 时可带 coins 奖励该小组能量币；reject 时必须带 reason。"""

    action: str  # approve | reject
    coins: int | None = None
    reason: str | None = ""


# ---------- Rankings / Meta ----------
class GroupRankRow(CamelModel):
    group_id: str
    name: str
    total_coins: int
    rank: int


class PersonalRankRow(CamelModel):
    user_id: str
    name: str
    personal_coins: int
    group_id: str
    rank: int


class RankingsOut(CamelModel):
    group_ranking: list[GroupRankRow]
    personal_ranking: list[PersonalRankRow]


class ClassMetaOut(CamelModel):
    initial_coins_per_group: int
    term_name: str
    coin_easy: int
    coin_medium: int
    coin_hard: int
    # 开放窗口：minutes 是老师选的时长（空＝不限时），closesAt 是按它算出的到期点
    challenge_window_open: bool
    challenge_window_minutes: int | None
    challenge_window_closes_at: datetime | None
    recruit_window_open: bool
    recruit_window_minutes: int | None
    recruit_window_closes_at: datetime | None


class ActivityWindowUpdate(BaseModel):
    """教师开/关挑战与招募窗口（字段用字面 camelCase，与其它请求模型一致）。

    minutes 为空＝不限时。上限 24 小时（1440）是防手滑——真要长时间开放就选"不限"。
    """

    challengeOpen: bool
    challengeMinutes: int | None = Field(default=None, ge=1, le=1440)
    recruitOpen: bool
    recruitMinutes: int | None = Field(default=None, ge=1, le=1440)


class ClassMetaUpdate(BaseModel):
    """教师调整挑战奖励单价（按题目难度）。

    与其它请求模型一致：不继承 CamelModel，字段直接用字面 camelCase。
    上限 100 是防手滑——真填成 10000，一局挑战就能刷爆全服。
    """

    coinEasy: int = Field(ge=0, le=100)
    coinMedium: int = Field(ge=0, le=100)
    coinHard: int = Field(ge=0, le=100)
