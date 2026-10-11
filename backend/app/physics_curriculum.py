"""One curriculum for the UI and API; preserve edited topics and question IDs."""
import json
from pathlib import Path
from .models import Topic, Question
from .physics_builtin import QUESTIONS, question_values

TOPICS = json.loads(Path(__file__).with_name('physics_topics.json').read_text())


def legacy_material(title, outline):
    lines = [f"# {title} - AI 自学路径", "", f'本主题涵盖高中物理中"{title}"的核心知识点。', "", "## 学习建议", "1. 从基本概念出发，理解物理量的定义", "2. 掌握核心公式及其适用条件", "3. 结合生活实例加深理解", "4. 通过例题和习题巩固解题技巧", "", "## 章节要点"]
    for chapter in outline:
        lines += [f"### {chapter['chapter']}", "- " + " / ".join(chapter["points"]), ""]
    return "\n".join(lines)


def upgrade_curriculum(db):
    from .seed import TOPIC_OUTLINES
    updated = added = 0
    for raw in TOPICS:
        topic = db.get(Topic, raw['id'])
        legacy = TOPIC_OUTLINES.get(raw['title'])
        if topic and topic.title == raw['title'] and topic.outline == legacy and topic.ai_material == legacy_material(raw['title'], legacy):
            topic.outline = raw['outline']
            topic.ai_material = raw['aiMaterial']
            updated += 1
    for raw in QUESTIONS[66:]:
        if db.get(Topic, raw['topicId']) and not db.get(Question, raw['id']):
            db.add(Question(id=raw['id'], **question_values(raw)))
            added += 1
    db.commit()
    return {'topicsUpdated': updated, 'questionsAdded': added}
