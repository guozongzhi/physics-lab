from app.models import Question, QuizSession, Topic
from app.physics_builtin import QUESTIONS, question_values, upgrade_legacy_questions
from app.seed import TOPIC_OUTLINES, build_questions


def test_builtin_content_and_topic_coverage(db, client, auth):
    topics = [Topic(id=f'topic-{i+1}', title=title, outline=outline, ai_material='')
              for i, (title, outline) in enumerate(TOPIC_OUTLINES.items())]
    db.add_all(topics)
    build_questions(db, topics)
    db.commit()
    assert len(QUESTIONS) == 66
    assert len({q['id'] for q in QUESTIONS}) == 66
    for raw in QUESTIONS:
        assert raw['type'] == 'single'
        assert len(raw['options']) == 4 and len(set(raw['options'])) == 4
        assert type(raw['answer']) is int and 0 <= raw['answer'] < 4
        assert '重要知识点' not in raw['stem'] and '该知识点是高中物理核心考点' not in raw['options']
    for topic in topics:
        assert {q['knowledgePoint'] for q in QUESTIONS if q['topicId'] == topic.id} == {
            point for chapter in topic.outline for point in chapter['points']}
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
