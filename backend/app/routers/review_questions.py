"""投稿/审核服务：学生只读本人投稿和公开教师题，教师负责审核。"""
from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session
from ..database import get_db
from ..deps import get_current_user, require_teacher
from ..models import ReviewQuestion, User
from ..services import gen_id

router = APIRouter(prefix='/api/review-questions', tags=['review-questions'])


class QuestionInput(BaseModel):
    type: Literal['single', 'multiple', 'judge']
    stem: str = Field(min_length=1, max_length=4000)
    options: list[str] = Field(min_length=2, max_length=8)
    answer: int | list[int] | bool
    knowledgePoint: str = ''
    difficulty: Literal[1, 2, 3] = 1

    @model_validator(mode='after')
    def validate_answer(self):
        if not self.stem.strip() or any(not s.strip() for s in self.options):
            raise ValueError('题干和选项不能为空')
        if self.type == 'judge':
            valid = isinstance(self.answer, bool)
        elif self.type == 'single':
            valid = type(self.answer) is int and 0 <= self.answer < len(self.options)
        else:
            valid = isinstance(self.answer, list) and bool(self.answer) and all(type(i) is int and 0 <= i < len(self.options) for i in self.answer) and len(set(self.answer)) == len(self.answer)
        if not valid:
            raise ValueError('答案与题型或选项不匹配')
        return self


class ReviewPatch(BaseModel):
    type: Literal['single', 'multiple', 'judge'] | None = None
    stem: str | None = None
    options: list[str] | None = None
    answer: int | list[int] | bool | None = None
    knowledgePoint: str | None = None
    difficulty: Literal[1, 2, 3] | None = None
    reviewStatus: Literal['pending', 'approved', 'rejected'] | None = None
    teacherFeedback: str | None = None


class ImportInput(BaseModel):
    questions: list[QuestionInput] = Field(min_length=1, max_length=500)


def create(db, current, payload):
    teacher = current.account_role in ('teacher', 'admin')
    q = ReviewQuestion(id=gen_id('rq_'), submitted_by=None if teacher else current.id,
        payload={**payload.model_dump(), 'submittedBy': None if teacher else current.id,
                 'submittedByName': current.name, 'submittedAt': datetime.now(timezone.utc).isoformat(),
                 'reviewStatus': 'approved' if teacher else 'pending'})
    db.add(q)
    return q


def output(q):
    return {**q.payload, 'id': q.id}


@router.get('')
def list_questions(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    query = db.query(ReviewQuestion)
    if current.account_role == 'student':
        query = query.filter(or_(ReviewQuestion.submitted_by == current.id, ReviewQuestion.submitted_by.is_(None)))
    return [output(q) for q in query.all()][::-1]


@router.post('', status_code=201)
def submit(payload: QuestionInput, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    q = create(db, current, payload)
    db.commit()
    return output(q)


@router.post('/import')
def import_questions(payload: ImportInput, db: Session = Depends(get_db), current: User = Depends(require_teacher)):
    stems = {q.payload['stem'] for q in db.query(ReviewQuestion).all()}
    imported = 0
    for item in payload.questions:
        if item.stem not in stems:
            create(db, current, item)
            stems.add(item.stem)
            imported += 1
    db.commit()
    return {'imported': imported}


@router.patch('/{qid}')
def review(qid: str, payload: ReviewPatch, db: Session = Depends(get_db), current: User = Depends(require_teacher)):
    q = db.get(ReviewQuestion, qid)
    if not q:
        raise HTTPException(404, '题目不存在')
    patch = payload.model_dump(exclude_unset=True)
    if any(value is None for value in patch.values()):
        raise HTTPException(422, '更新字段不可为空')
    merged = {**q.payload, **patch}
    try:
        QuestionInput.model_validate(merged)
    except ValueError:
        raise HTTPException(422, '题干、题型或答案无效')
    if merged.get('reviewStatus') == 'rejected' and not (merged.get('teacherFeedback') or '').strip():
        raise HTTPException(422, '驳回需填写原因')
    if 'teacherFeedback' in patch:
        merged['feedbackAt'] = datetime.now(timezone.utc).isoformat()
    if set(patch) & set(QuestionInput.model_fields):
        merged.update(edited=True, editedBy=current.name)
    q.payload = merged
    db.commit()
    return output(q)


@router.delete('/{qid}')
def delete(qid: str, db: Session = Depends(get_db), _: User = Depends(require_teacher)):
    q = db.get(ReviewQuestion, qid)
    if not q:
        raise HTTPException(404, '题目不存在')
    db.delete(q)
    db.commit()
    return {'ok': True}
