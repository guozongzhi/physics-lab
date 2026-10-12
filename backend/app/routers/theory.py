from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import services
from ..database import get_db
from ..deps import get_current_user, window_guard
from ..models import Challenge, ClassMeta, Group, Question, Topic, User
from ..schemas import ChallengeCreate, ChallengeOut, ChallengeSubmit, QuestionOut, TopicOut

from ..question_views import question_dict, public_question

router = APIRouter(prefix="/api", tags=["theory"])

def _require_group(current: User) -> str:
    if not current.group_id:
        raise HTTPException(status_code=400, detail="当前用户未归属小组")
    return current.group_id


# ---------- Topics / Questions ----------
@router.get("/topics", response_model=list[TopicOut])
def list_topics(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Topic).all()


@router.get("/questions", response_model=list[QuestionOut])
def list_questions(
    topic_id: str | None = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    q = db.query(Question)
    if topic_id:
        q = q.filter(Question.topic_id == topic_id)
    questions = q.all()
    if current.account_role in ("teacher", "admin"):
        return questions
    return [public_question(question_dict(item)) for item in questions]


# ---------- Challenges ----------
@router.get("/challenges", response_model=list[ChallengeOut])
def list_challenges(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Challenge).all()


@router.post("/challenges", response_model=ChallengeOut)
def create_challenge(
    payload: ChallengeCreate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
    _window: None = Depends(window_guard("challenge")),
):
    group_id = _require_group(current)
    deadline = payload.deadline
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    if deadline <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="挑战截止时间必须晚于当前时间")

    # 奖励由服务端按题目难度算，**不采信客户端传来的 reward**——否则学生改个请求体
    # 就能把奖励改成任意值，难度定价也就白做了。
    if not payload.questionIds:
        raise HTTPException(status_code=400, detail="请先选择题目")
    questions = db.query(Question).filter(Question.id.in_(payload.questionIds)).all()
    if len(questions) != len(set(payload.questionIds)):
        raise HTTPException(status_code=400, detail="部分题目不存在")

    meta = db.get(ClassMeta, 1) or ClassMeta(id=1)
    reward = services.challenge_reward_for(questions, meta)
    if reward <= 0:
        raise HTTPException(status_code=400, detail="按当前单价算出的奖励为 0，请联系老师设置挑战奖励单价")

    group = db.get(Group, group_id)
    if group is None or group.total_coins < reward:
        raise HTTPException(
            status_code=400,
            detail=f"能量币不足：本次挑战奖励 {reward} ⚡，本组只有 {group.total_coins if group else 0} ⚡",
        )
    # 创建挑战预扣能量币
    try:
        services.add_tx(
            db,
            group_id,
            source="challenge",
            ref_id=f"pre_{services.gen_id()}",
            delta=-reward,
            allow_partial_debit=False,
            note=f"创建挑战「{payload.title}」预扣能量币",
        )
    except services.InsufficientCoins as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    challenge = Challenge(
        id=services.gen_id("ch_"),
        title=payload.title,
        creator_group_id=group_id,
        topic_id=payload.topicId,
        question_ids=payload.questionIds,
        reward=reward,
        deadline=payload.deadline,
        status="open",
        submissions=[],
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)
    return challenge


@router.get("/challenges/{challenge_id}/questions", response_model=list[QuestionOut])
def accept_challenge(challenge_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    challenge = db.get(Challenge, challenge_id)
    if not challenge:
        raise HTTPException(status_code=404, detail="挑战不存在")
    if challenge.question_ids:
        qs = db.query(Question).filter(Question.id.in_(challenge.question_ids)).all()
        if qs:
            return [public_question(question_dict(q)) for q in qs]
    # 回退：取该主题前 10 题
    return [public_question(question_dict(q)) for q in db.query(Question).filter(Question.topic_id == challenge.topic_id).limit(10).all()]


@router.post("/challenges/{challenge_id}/submit", response_model=ChallengeOut)
def submit_challenge(
    challenge_id: str,
    payload: ChallengeSubmit,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    group_id = _require_group(current)
    challenge = db.get(Challenge, challenge_id)
    if not challenge:
        raise HTTPException(status_code=404, detail="挑战不存在")
    # 锁定并重读提交列表，避免同组并发答题重复结算。
    db.query(Challenge).filter(Challenge.id == challenge_id).update(
        {Challenge.status: Challenge.status}, synchronize_session=False
    )
    db.refresh(challenge)
    deadline = challenge.deadline
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    if deadline <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="挑战已截止，无法提交")
    if challenge.status != "open":
        raise HTTPException(status_code=400, detail="挑战已关闭，无法提交")
    if challenge.creator_group_id == group_id:
        raise HTTPException(status_code=403, detail="不能作答自己创建的挑战")
    if any(s.get("groupId") == group_id for s in challenge.submissions):
        raise HTTPException(status_code=400, detail="本小组已作答过该挑战")

    if challenge.question_ids:
        qs = db.query(Question).filter(Question.id.in_(challenge.question_ids)).all()
    else:
        qs = []
    if not qs:
        qs = db.query(Question).filter(Question.topic_id == challenge.topic_id).limit(10).all()

    correct = 0
    for q in qs:
        ua = payload.answers.get(q.id)
        if ua is not None and services.is_answer_correct(question_dict(q), ua):
            correct += 1
    total = len(qs) or 1
    accuracy = correct / total

    result = services.settle_challenge(db, challenge, group_id, accuracy)
    submission = {
        "groupId": group_id,
        "answers": payload.answers,
        "accuracy": accuracy,
        "earned": result["solverReward"],
        "submittedAt": datetime.now(timezone.utc).isoformat(),
    }
    challenge.submissions = list(challenge.submissions) + [submission]
    db.commit()
    db.refresh(challenge)
    return challenge
