"""答题响应投影：未交卷时隐藏标准答案。"""
from .models import Question

def question_dict(q: Question) -> dict:
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


def public_question(q: dict) -> dict:
    return {key: value for key, value in q.items() if key != "answer"}
