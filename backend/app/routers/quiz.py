import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import services
from ..database import get_db
from ..deps import get_current_user
from ..models import Question, QuizSession, User
from ..schemas import QuizAnswerRequest, QuizSessionOut, QuizStartRequest

from ..question_views import question_dict, public_question

router = APIRouter(prefix="/api", tags=["quiz"])

def _quiz_response(session: QuizSession) -> dict:
    return {
        "id": session.id,
        "topic_id": session.topic_id,
        "questions": [q if session.graded else public_question(q) for q in session.questions],
        "user_answers": session.user_answers,
        "score": session.score,
        "passed": session.passed,
        "blind_points": session.blind_points,
        "graded": session.graded,
        "created_at": session.created_at,
    }


# ---------- Quiz ----------
@router.get("/quiz/sessions", response_model=list[QuizSessionOut])
def list_quiz_sessions(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    """当前用户自己的答题会话（按创建时间倒序）。

    只返回本人的记录——QuizSessionOut 里不含 user_id，不泄露他人信息。
    前端 bootstrap 拉这个列表，学习路径的「学习/检测」几步据此判定。
    """
    sessions = (
        db.query(QuizSession)
        .filter(QuizSession.user_id == current.id)
        .order_by(QuizSession.created_at.desc())
        .all()
    )
    return [_quiz_response(session) for session in sessions]


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
        questions=[question_dict(q) for q in final],
        user_answers={},
        score=0,
        passed=False,
        blind_points=[],
        created_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _quiz_response(session)


@router.post("/quiz/{session_id}/answer", response_model=QuizSessionOut)
def submit_answer(
    session_id: str,
    payload: QuizAnswerRequest,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    session = _own_session(session_id, current, db)
    if session.graded:
        raise HTTPException(status_code=409, detail="测验已交卷")
    if payload.qid not in {q["id"] for q in session.questions}:
        raise HTTPException(status_code=400, detail="题目不属于本次测验")
    answers = dict(session.user_answers)
    answers[payload.qid] = payload.answer
    session.user_answers = answers
    db.commit()
    db.refresh(session)
    return _quiz_response(session)


@router.post("/quiz/{session_id}/grade", response_model=QuizSessionOut)
def grade_quiz(session_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    session = _own_session(session_id, current, db)
    if session.graded:
        return session
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
