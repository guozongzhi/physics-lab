from app.physics_curriculum import TOPICS, upgrade_curriculum, legacy_material
from app.models import Question, QuizSession, Topic
from app.physics_builtin import QUESTIONS, question_values, upgrade_legacy_questions
from app.seed import build_topics, build_questions


def test_builtin_content_and_topic_coverage(db, client, auth):
    topics = build_topics(db)
    build_questions(db, topics)
    db.commit()
    assert len(QUESTIONS) == 74
    assert len({q['id'] for q in QUESTIONS}) == 74
    for raw in QUESTIONS:
        assert raw['type'] == 'single'
        assert len(raw['options']) == 4 and len(set(raw['options'])) == 4
        assert type(raw['answer']) is int and 0 <= raw['answer'] < 4
        assert '重要知识点' not in raw['stem'] and '该知识点是高中物理核心考点' not in raw['options']
    for topic in topics:
        assert {q['knowledgePoint'] for q in QUESTIONS if q['topicId'] == topic.id}
        assert topic.title == next(t['title'] for t in TOPICS if t['id'] == topic.id)
        response = client.post('/api/quiz/start', json={'topicId': topic.id}, headers=auth('u-1'))
        assert response.status_code == 200, response.text
        session = response.json()
        assert session['topicId'] == topic.id
        assert session['questions']
        assert all(q['topicId'] == topic.id for q in session['questions'])
        if topic.id == 'topic-1':
            assert all('库仑' not in q['stem'] for q in session['questions'])


def test_migration_preserves_edits_and_history_and_is_idempotent(db):
    raw = QUESTIONS[0]
    legacy = Question(id=raw['id'], topic_id=raw['topicId'], knowledge_point=raw['knowledgePoint'],
                      type='single', stem='关于质点的下列说法中，正确的是：',
                      options=['该概念仅适用于宏观低速场景', '在高中物理范围内有严格的数学表达', '与参考系选择无关', '属于标量运算不考虑方向'], answer=1, difficulty=1)
    edited = Question(id=QUESTIONS[1]['id'], **question_values(QUESTIONS[1]))
    edited.stem = '教师修改后的题目'
    db.add_all([legacy, edited])
    historical = QuizSession(id='historical', topic_id='topic-1', user_id='u-1', questions=[{'stem':legacy.stem}], user_answers={},score=80,passed=True,blind_points=[])
    db.add(historical); db.commit()
    assert upgrade_legacy_questions(db) == 1
    assert legacy.stem == raw['stem']
    assert edited.stem == '教师修改后的题目'
    assert historical.questions == [{'stem':'关于质点的下列说法中，正确的是：'}]
    assert historical.score == 80 and historical.passed
    assert upgrade_legacy_questions(db) == 0


def test_curriculum_upgrade_preserves_edits_and_existing_ids(db):
    from app.seed import TOPIC_OUTLINES
    originals = [Topic(id=f'topic-{i+1}', title=title, outline=outline,
                       ai_material=legacy_material(title, outline))
                 for i, (title, outline) in enumerate(TOPIC_OUTLINES.items())]
    db.add_all(originals)
    db.commit()
    originals[1].ai_material += "\n教师补充"
    original_title = originals[1].title
    custom_material = originals[1].ai_material
    db.commit()
    assert upgrade_curriculum(db) == {'topicsUpdated': 7, 'questionsAdded': 8}
    assert originals[1].ai_material == custom_material
    assert originals[1].title == original_title
    assert originals[0].outline == TOPICS[0]['outline']
    assert originals[0].id == 'topic-1'
    assert len(originals[0].outline) == 5
    assert upgrade_curriculum(db) == {'topicsUpdated': 0, 'questionsAdded': 0}


def test_fresh_curriculum_and_point_ids(db):
    from app.seed import TOPIC_OUTLINES
    topics = build_topics(db)
    db.commit()
    assert sum(len(c['points']) for t in topics for c in t.outline) == 104
    # Old frontend node IDs depend on chapter and point indices. Those stay stable.
    old_frontend = TOPICS[0]['outline'][:3]
    assert [c['chapter'] for c in old_frontend] == ['第一章 运动的描述', '第二章 相互作用与牛顿定律', '第三章 曲线运动与万有引力']
    assert upgrade_curriculum(db) == {'topicsUpdated': 0, 'questionsAdded': 8}
    assert upgrade_curriculum(db) == {'topicsUpdated': 0, 'questionsAdded': 0}
