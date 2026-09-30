import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import services
from ..database import get_db
from ..deps import get_current_user, require_teacher, window_guard
from ..models import (
    Challenge,
    Class,
    ClassMeta,
    Group,
    Question,
    QuizSession,
    SafetyAssignment,
    SafetyRecord,
    Topic,
    User,
)
from ..schemas import (
    ChallengeCreate,
    ChallengeOut,
    ChallengeSubmit,
    QuestionOut,
    QuizAnswerRequest,
    QuizSessionOut,
    QuizStartRequest,
    SafetyAssignmentCreate,
    SafetyAssignmentOut,
    SafetyImportRequest,
    SafetyQuestionInput,
    SafetyQuestionUpdate,
    SafetyRecordCreate,
    SafetyRecordOut,
    TopicOut,
)
from ..safety_builtin import build_safety_questions

router = APIRouter(prefix="/api", tags=["theory"])


def _question_dict(q: Question) -> dict:
    return {
        "id": q.id,
        "type": q.type,
        "stem": q.stem,
        "options": q.options,
        "answer": q.answer,
        "knowledgePoint": q.knowledge_point,
        "difficulty": q.difficulty,
        "topicId": q.topic_id,
        "safetyCategory": q.safety_category,
    }


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
    _: User = Depends(get_current_user),
):
    q = db.query(Question)
    if topic_id:
        q = q.filter(Question.topic_id == topic_id)
    return q.all()


# ---------- Safety question bank（教师维护；与理论题共用 questions 表，靠 safety_category 区分） ----------
def _new_safety_question(payload: SafetyQuestionInput) -> Question:
    return Question(
        id=f"sq_{services.gen_id()}",
        type=payload.type,
        stem=payload.stem,
        options=list(payload.options),
        answer=payload.answer,
        knowledge_point=payload.knowledgePoint or "",
        difficulty=payload.difficulty or 1,
        topic_id=None,  # 安全题不属于任何理论主题
        safety_category=payload.safetyCategory,
    )


@router.get("/safety/questions", response_model=list[QuestionOut])
def list_safety_questions(
    category: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """安全题库。登录即可读——学生安全考核据此出题，教师端据此维护。"""
    q = db.query(Question).filter(Question.safety_category.isnot(None))
    if category:
        q = q.filter(Question.safety_category == category)
    return q.all()


@router.post("/safety/questions", response_model=QuestionOut, status_code=201)
def create_safety_question(
    payload: SafetyQuestionInput,
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher),
):
    item = _new_safety_question(payload)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


# 注意：/import 与 /reset 必须声明在 /{question_id} 之前，否则会被路径参数吞掉
@router.post("/safety/questions/import")
def import_safety_questions(
    payload: SafetyImportRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher),
):
    """批量导入。merge=按题干去重后追加；replace=清空现有安全题后整体写入。"""
    if payload.mode == "replace":
        db.query(Question).filter(Question.safety_category.isnot(None)).delete(synchronize_session=False)
        existing_stems: set[str] = set()
    else:
        existing_stems = {s for (s,) in db.query(Question.stem).filter(Question.safety_category.isnot(None))}

    imported = 0
    for q in payload.questions:
        if q.stem in existing_stems:
            continue
        db.add(_new_safety_question(q))
        existing_stems.add(q.stem)
        imported += 1
    db.commit()
    total = db.query(Question).filter(Question.safety_category.isnot(None)).count()
    return {"imported": imported, "total": total}


@router.post("/safety/questions/reset", response_model=list[QuestionOut])
def reset_safety_questions(
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher),
):
    """恢复内置题库：清空现有安全题后重新灌入内置的 35 道。"""
    db.query(Question).filter(Question.safety_category.isnot(None)).delete(synchronize_session=False)
    for raw in build_safety_questions():
        db.add(
            Question(
                id=raw["id"],
                type=raw["type"],
                stem=raw["stem"],
                options=list(raw["options"]),
                answer=raw["answer"],
                knowledge_point=raw.get("knowledgePoint", ""),
                difficulty=raw.get("difficulty", 1),
                topic_id=None,
                safety_category=raw["safetyCategory"],
            )
        )
    db.commit()
    return db.query(Question).filter(Question.safety_category.isnot(None)).all()


@router.patch("/safety/questions/{question_id}", response_model=QuestionOut)
def update_safety_question(
    question_id: str,
    payload: SafetyQuestionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher),
):
    item = db.get(Question, question_id)
    if not item or item.safety_category is None:
        raise HTTPException(status_code=404, detail="安全题不存在")
    if payload.type is not None:
        item.type = payload.type
    if payload.stem is not None:
        item.stem = payload.stem
    if payload.options is not None:
        item.options = list(payload.options)
    if payload.answer is not None:
        item.answer = payload.answer
    if payload.knowledgePoint is not None:
        item.knowledge_point = payload.knowledgePoint
    if payload.difficulty is not None:
        item.difficulty = payload.difficulty
    if payload.safetyCategory is not None:
        item.safety_category = payload.safetyCategory
    db.commit()
    db.refresh(item)
    return item


@router.delete("/safety/questions/{question_id}")
def delete_safety_question(
    question_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher),
):
    item = db.get(Question, question_id)
    if not item or item.safety_category is None:
        raise HTTPException(status_code=404, detail="安全题不存在")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ---------- Quiz ----------
@router.get("/quiz/sessions", response_model=list[QuizSessionOut])
def list_quiz_sessions(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """当前用户自己的答题会话（按创建时间倒序）。

    只返回本人的记录——QuizSessionOut 里不含 user_id，不泄露他人信息。
    前端 bootstrap 拉这个列表，学习路径的「学习/检测」几步据此判定。
    """
    return (
        db.query(QuizSession)
        .filter(QuizSession.user_id == current.id)
        .order_by(QuizSession.created_at.desc())
        .all()
    )


def _own_session(session_id: str, current: User, db: Session) -> QuizSession:
    """取会话并校验归属。不校验的话，任何登录用户拿到 id 就能改别人的答卷与成绩。"""
    session = db.get(QuizSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="答题会话不存在")
    if session.user_id != current.id:
        raise HTTPException(status_code=403, detail="无权操作他人的答题会话")
    return session


@router.post("/quiz/start", response_model=QuizSessionOut)
def start_quiz(payload: QuizStartRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    topic_questions = db.query(Question).filter(Question.topic_id == payload.topicId).all()
    if not topic_questions:
        raise HTTPException(status_code=404, detail="该主题暂无题目")

    # 按知识点均匀抽题，逻辑对齐前端 theoryStore.startQuiz
    kp_map: dict[str, list[Question]] = {}
    for q in topic_questions:
        kp_map.setdefault(q.knowledge_point, []).append(q)
    kps = list(kp_map.keys())
    picked: list[Question] = []
    per_kp = max(1, 10 // len(kps))
    for kp in kps:
        pool = kp_map[kp][:]
        random.shuffle(pool)
        picked.extend(pool[: min(per_kp, len(pool))])
    while len(picked) < 10 and len(topic_questions) > len(picked):
        remain = [q for q in topic_questions if q not in picked]
        picked.append(random.choice(remain))
    final = picked[:10]

    session = QuizSession(
        id=services.gen_id("qs_"),
        topic_id=payload.topicId,
        user_id=current.id,
        questions=[_question_dict(q) for q in final],
        user_answers={},
        score=0,
        passed=False,
        blind_points=[],
        created_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/quiz/{session_id}/answer", response_model=QuizSessionOut)
def submit_answer(
    session_id: str,
    payload: QuizAnswerRequest,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    session = _own_session(session_id, current, db)
    answers = dict(session.user_answers)
    answers[payload.qid] = payload.answer
    session.user_answers = answers
    db.commit()
    db.refresh(session)
    return session


@router.post("/quiz/{session_id}/grade", response_model=QuizSessionOut)
def grade_quiz(session_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    session = _own_session(session_id, current, db)
    correct = 0
    blind: set[str] = set()
    for q in session.questions:
        ua = session.user_answers.get(q["id"])
        if ua is not None and services.is_answer_correct(q, ua):
            correct += 1
        else:
            blind.add(q.get("knowledgePoint", ""))
    total = len(session.questions) or 1
    session.score = round(correct / total * 100)
    session.passed = session.score >= 80
    session.blind_points = list(blind)
    session.graded = True
    db.commit()
    db.refresh(session)
    return session


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
    services.add_tx(
        db,
        group_id,
        source="challenge",
        ref_id=f"pre_{services.gen_id()}",
        delta=-reward,
        note=f"创建挑战「{payload.title}」预扣能量币",
    )
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
            return qs
    # 回退：取该主题前 10 题
    return db.query(Question).filter(Question.topic_id == challenge.topic_id).limit(10).all()


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
        if ua is not None and services.is_answer_correct(_question_dict(q), ua):
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


# ---------- Safety exam records ----------
@router.post("/safety/records", response_model=SafetyRecordOut)
def create_safety_record(
    payload: SafetyRecordCreate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """记录一次安全科目考核结果（用于安全实验室按真实记录算通过率）。

    带了 assignmentId（来自教师指派）时，**忽略客户端传来的 passed**，改由该指派的
    及格线推导——否则学生可以 POST `{score: 0, passed: true}` 伪造通过。
    自由练习（无 assignmentId）保持原行为。
    """
    passed = payload.passed
    if payload.assignmentId:
        assignment = db.get(SafetyAssignment, payload.assignmentId)
        if not assignment:
            raise HTTPException(status_code=404, detail="指派不存在")
        passed = payload.score >= assignment.pass_score

    rec = SafetyRecord(
        id=services.gen_id("srec_"),
        user_id=current.id,
        category=payload.category,
        score=payload.score,
        passed=passed,
        assignment_id=payload.assignmentId,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.get("/safety/records", response_model=list[SafetyRecordOut])
def list_safety_records(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """当前用户的安全考核记录（按时间倒序）。"""
    return (
        db.query(SafetyRecord)
        .filter(SafetyRecord.user_id == current.id)
        .order_by(SafetyRecord.created_at.desc())
        .all()
    )


# ---------- Safety exam assignments（教师指派） ----------
def _assignment_visible_to(a: SafetyAssignment, current: User) -> bool:
    """教师/管理员可见全部；学生只能看到指派给自己班级或小组的。"""
    if current.account_role in ("teacher", "admin"):
        return True
    if a.group_id and a.group_id == current.group_id:
        return True
    if a.class_id and a.class_id == current.class_id:
        return True
    return False


@router.post("/safety/assignments", response_model=SafetyAssignmentOut, status_code=201)
def create_safety_assignment(
    payload: SafetyAssignmentCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_teacher),
):
    """教师指派一次安全考核（目标为班级或小组之一）。"""
    if payload.classId and db.get(Class, payload.classId) is None:
        raise HTTPException(status_code=400, detail="班级不存在")
    if payload.groupId and db.get(Group, payload.groupId) is None:
        raise HTTPException(status_code=400, detail="小组不存在")

    item = SafetyAssignment(
        id=services.gen_id("sasgn_"),
        title=payload.title.strip(),
        category=payload.category,
        question_count=payload.questionCount,
        time_limit=payload.timeLimit,
        pass_score=payload.passScore,
        deadline=payload.deadline,
        class_id=payload.classId,
        group_id=payload.groupId,
        created_by=current.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/safety/assignments", response_model=list[SafetyAssignmentOut])
def list_safety_assignments(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """教师/管理员看全部；学生只看指派到自己班级或小组的（按创建时间倒序）。"""
    q = db.query(SafetyAssignment)
    if current.account_role not in ("teacher", "admin"):
        # 只对"学生身上确实有值"的目标加条件：写成 `group_id == None` 会被
        # 渲染成 `group_id IS NULL`，反而匹配到所有未指定小组的指派。
        conds = []
        if current.group_id:
            conds.append(SafetyAssignment.group_id == current.group_id)
        if current.class_id:
            conds.append(SafetyAssignment.class_id == current.class_id)
        if not conds:
            return []
        q = q.filter(or_(*conds))
    return q.order_by(SafetyAssignment.created_at.desc()).all()


@router.get("/safety/assignments/{assignment_id}", response_model=SafetyAssignmentOut)
def get_safety_assignment(
    assignment_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    item = db.get(SafetyAssignment, assignment_id)
    if not item:
        raise HTTPException(status_code=404, detail="指派不存在")
    if not _assignment_visible_to(item, current):
        raise HTTPException(status_code=403, detail="无权查看该指派")
    return item


@router.delete("/safety/assignments/{assignment_id}")
def delete_safety_assignment(
    assignment_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher),
):
    item = db.get(SafetyAssignment, assignment_id)
    if not item:
        raise HTTPException(status_code=404, detail="指派不存在")
    db.delete(item)
    db.commit()
    return {"ok": True}
