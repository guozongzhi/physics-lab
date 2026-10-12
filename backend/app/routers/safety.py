import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import services
from ..access import require_class_access, require_group_access
from ..database import get_db
from ..deps import get_current_user, require_teacher, visible_class_id
from ..models import Class, Group, Question, Project, SafetyAssignment, SafetyExamAttempt, SafetyRecord, User
from ..schemas import QuestionOut, SafetyAssignmentCreate, SafetyAssignmentOut, SafetyImportRequest, SafetyQuestionInput, SafetyQuestionUpdate, SafetyRecordCreate, SafetyRecordOut, SafetyExamStart, SafetyExamSubmit
from ..safety_builtin import build_safety_questions

from ..question_views import question_dict, public_question

router = APIRouter(prefix="/api", tags=["safety"])

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
    current: User = Depends(get_current_user),
):
    """安全题库。登录即可读——学生安全考核据此出题，教师端据此维护。"""
    q = db.query(Question).filter(Question.safety_category.isnot(None))
    if category:
        q = q.filter(Question.safety_category == category)
    questions = q.all()
    if current.account_role in ("teacher", "admin"):
        return questions
    return [public_question(question_dict(item)) for item in questions]


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


# ---------- Safety exam records ----------
@router.post("/safety/exams/start")
def start_safety_exam(
    payload: SafetyExamStart,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    assignment = db.get(SafetyAssignment, payload.assignmentId) if payload.assignmentId else None
    if payload.assignmentId and not assignment:
        raise HTTPException(status_code=404, detail="指派不存在")
    if assignment:
        if not _assignment_visible_to(assignment, current, db):
            raise HTTPException(status_code=403, detail="无权参加该考核")
        if assignment.category != payload.category:
            raise HTTPException(status_code=400, detail="考核类别与指派不符")
        if assignment.deadline and assignment.deadline.replace(tzinfo=None) < datetime.now(timezone.utc).replace(tzinfo=None):
            raise HTTPException(status_code=400, detail="考核已截止")
    project = db.get(Project, payload.projectId) if payload.projectId else None
    if payload.projectId and not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project:
        require_group_access(db, current, project.owner_group_id)
        if current.account_role == "student" and current.group_id != project.owner_group_id:
            raise HTTPException(status_code=403, detail="只能参加本组项目考核")
        if project.safety_category != payload.category:
            raise HTTPException(status_code=400, detail="考核类别与项目不符")
    pool = db.query(Question).filter(Question.safety_category == payload.category).all()
    if not pool:
        raise HTTPException(status_code=404, detail="该类别暂无安全题目")
    picked = random.sample(pool, min(len(pool), assignment.question_count if assignment else 10))
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=assignment.time_limit if assignment else 60)
    attempt = SafetyExamAttempt(
        id=services.gen_id("sexam_"),
        user_id=current.id,
        category=payload.category,
        assignment_id=payload.assignmentId,
        project_id=payload.projectId,
        questions=[question_dict(q) for q in picked],
        pass_score=assignment.pass_score if assignment else 80,
        expires_at=expires_at,
    )
    db.add(attempt)
    db.commit()
    return {"id": attempt.id, "questions": [public_question(q) for q in attempt.questions], "passScore": attempt.pass_score}


@router.post("/safety/exams/{attempt_id}/submit", response_model=SafetyRecordOut)
def submit_safety_exam(
    attempt_id: str,
    payload: SafetyExamSubmit,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    attempt = db.get(SafetyExamAttempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="考核不存在")
    if attempt.user_id != current.id:
        raise HTTPException(status_code=403, detail="无权提交他人考核")
    if attempt.graded:
        raise HTTPException(status_code=409, detail="考核已提交")
    if attempt.expires_at and attempt.expires_at.replace(tzinfo=None) + timedelta(seconds=15) < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(status_code=400, detail="考核已超时")
    correct = sum(
        1 for q in attempt.questions
        if q["id"] in payload.answers and services.is_answer_correct(q, payload.answers[q["id"]])
    )
    score = round(correct / len(attempt.questions) * 100)
    passed = score >= attempt.pass_score
    changed = (
        db.query(SafetyExamAttempt)
        .filter(SafetyExamAttempt.id == attempt_id, SafetyExamAttempt.graded.is_(False))
        .update({SafetyExamAttempt.score: score, SafetyExamAttempt.passed: passed, SafetyExamAttempt.graded: True}, synchronize_session=False)
    )
    if changed != 1:
        raise HTTPException(status_code=409, detail="考核已提交")
    db.refresh(attempt)
    rec = SafetyRecord(
        id=services.gen_id("srec_"), user_id=current.id, category=attempt.category,
        score=score, passed=passed, assignment_id=attempt.assignment_id,
    )
    db.add(rec)
    if passed and attempt.project_id:
        project = db.get(Project, attempt.project_id)
        project.safety_passed = {**project.safety_passed, current.id: True}
    elif not passed and attempt.project_id:
        db.get(Project, attempt.project_id).status = "frozen"
    db.commit()
    db.refresh(rec)
    return rec


@router.post("/safety/records", response_model=SafetyRecordOut)
def create_safety_record(
    payload: SafetyRecordCreate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    raise HTTPException(status_code=410, detail="请使用安全考核接口提交答案")


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
def _assignment_visible_to(a: SafetyAssignment, current: User, db: Session) -> bool:
    """教师/管理员可见全部；学生只能看到指派给自己班级或小组的。"""
    if current.account_role in ("teacher", "admin"):
        scoped = visible_class_id(current)
        if not scoped:
            return True
        group = db.get(Group, a.group_id) if a.group_id else None
        return a.class_id == scoped or (group is not None and group.class_id == scoped)
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

    if payload.classId:
        require_class_access(current, payload.classId)
    if payload.groupId:
        require_group_access(db, current, payload.groupId)
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
    scoped = visible_class_id(current)
    if current.account_role == "teacher" and scoped:
        group_ids = db.query(Group.id).filter(Group.class_id == scoped)
        q = q.filter(or_(SafetyAssignment.class_id == scoped, SafetyAssignment.group_id.in_(group_ids)))
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
    if not _assignment_visible_to(item, current, db):
        raise HTTPException(status_code=403, detail="无权查看该指派")
    return item


@router.delete("/safety/assignments/{assignment_id}")
def delete_safety_assignment(
    assignment_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(require_teacher),
):
    item = db.get(SafetyAssignment, assignment_id)
    if not item:
        raise HTTPException(status_code=404, detail="指派不存在")
    if not _assignment_visible_to(item, current, db):
        raise HTTPException(status_code=403, detail="只能操作本班指派")
    db.delete(item)
    db.commit()
    return {"ok": True}
