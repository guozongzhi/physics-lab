"""Reviewed topic questions shared with the offline frontend; upgrade only untouched templates."""
import json
from pathlib import Path
from sqlalchemy.orm import Session
from .models import Question

QUESTIONS = json.loads(Path(__file__).with_name('physics_questions.json').read_text())


def question_values(raw):
    return dict(type=raw['type'], stem=raw['stem'], options=raw['options'], answer=raw['answer'],
                knowledge_point=raw['knowledgePoint'], difficulty=raw['difficulty'], topic_id=raw['topicId'])


def is_legacy_template(q):
    kp = q.knowledge_point
    return (
        (q.type == 'single' and q.stem == f'关于{kp}的下列说法中，正确的是：'
         and q.options == ['该概念仅适用于宏观低速场景', '在高中物理范围内有严格的数学表达', '与参考系选择无关', '属于标量运算不考虑方向'] and q.answer == 1)
        or (q.type == 'multiple' and q.stem == f'关于{kp}，下列说法正确的是（多选）：'
            and q.options == ['该知识点是高中物理核心考点', '可通过实验验证其正确性', '在任何条件下都严格成立', '与其他知识点存在密切联系'] and q.answer == [0, 1, 3])
        or (q.type == 'judge' and q.stem == f'{kp}是高中物理必须掌握的重要知识点。（判断对错）'
            and q.options == ['正确', '错误'] and q.answer is True)
    )


def upgrade_legacy_questions(db: Session):
    updated = 0
    for raw in QUESTIONS:
        q = db.get(Question, raw['id'])
        if (q and q.topic_id == raw['topicId'] and q.knowledge_point == raw['knowledgePoint']
                and is_legacy_template(q)):
            for key, value in question_values(raw).items():
                setattr(q, key, value)
            updated += 1
    db.commit()
    return updated
