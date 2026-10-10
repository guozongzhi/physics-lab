"""章节测验：会话按学生隔离、归属校验、判分与「已交卷」标记。

预置数据（见 conftest）：主题 t-1 下只有 q-1（答案 2，知识点「基础」）与
q-2（答案 1，知识点「光学」），所以一次测验是 2 道题，不是 10 道。
u-1/u-2 属 g-1，u-3 属 g-2。
"""


def _start(client, auth, topic="t-1", user="u-1"):
    return client.post("/api/quiz/start", json={"topicId": topic}, headers=auth(user))


def _answer(client, auth, sid, qid, value, user="u-1"):
    return client.post(f"/api/quiz/{sid}/answer", json={"qid": qid, "answer": value}, headers=auth(user))


def _grade(client, auth, sid, user="u-1"):
    return client.post(f"/api/quiz/{sid}/grade", headers=auth(user))


# ---------- 开始测验 ----------

def test_start_creates_session_for_current_user(client, auth, db):
    resp = _start(client, auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["topicId"] == "t-1"
    assert len(body["questions"]) == 2
    assert body["score"] == 0
    assert body["passed"] is False
    assert body["graded"] is False
    assert body["blindPoints"] == []
    assert body["userAnswers"] == {}
    assert all("answer" not in q for q in body["questions"])

    from app.models import QuizSession

    db.expire_all()
    row = db.get(QuizSession, body["id"])
    assert row is not None and row.user_id == "u-1"


def test_start_unknown_topic_is_404(client, auth):
    assert _start(client, auth, topic="t-404").status_code == 404


def test_student_question_bank_does_not_reveal_answers(client, auth):
    student = client.get("/api/questions", headers=auth("u-1")).json()
    teacher = client.get("/api/questions", headers=auth("teacher", "teacher123")).json()
    assert all(q.get("answer") is None for q in student)
    assert any(q["answer"] is not None for q in teacher)


def test_start_requires_auth(client):
    assert client.post("/api/quiz/start", json={"topicId": "t-1"}).status_code == 401


# ---------- 列表按学生隔离（本轮核心回归） ----------

def test_list_returns_only_own_sessions(client, auth):
    sid = _start(client, auth, user="u-1").json()["id"]

    mine = client.get("/api/quiz/sessions", headers=auth("u-1")).json()
    assert [s["id"] for s in mine] == [sid]

    # 同组同学看不到，其他组同学也看不到
    assert client.get("/api/quiz/sessions", headers=auth("u-2")).json() == []
    assert client.get("/api/quiz/sessions", headers=auth("u-3")).json() == []


def test_list_orders_newest_first(client, auth):
    first = _start(client, auth).json()["id"]
    second = _start(client, auth).json()["id"]
    ids = [s["id"] for s in client.get("/api/quiz/sessions", headers=auth("u-1")).json()]
    assert ids == [second, first]


def test_response_has_no_user_id(client, auth):
    """响应模型不含 user_id，避免把别人的归属信息带出去。"""
    body = _start(client, auth).json()
    assert "userId" not in body and "user_id" not in body


# ---------- 归属校验 ----------

def test_other_user_cannot_answer(client, auth):
    sid = _start(client, auth, user="u-1").json()["id"]
    assert _answer(client, auth, sid, "q-1", 2, user="u-2").status_code == 403


def test_other_user_cannot_grade(client, auth):
    sid = _start(client, auth, user="u-1").json()["id"]
    assert _grade(client, auth, sid, user="u-3").status_code == 403


def test_unknown_session_is_404(client, auth):
    assert _answer(client, auth, "qs_nope", "q-1", 2).status_code == 404
    assert _grade(client, auth, "qs_nope").status_code == 404


# ---------- 判分 ----------

def test_grade_computes_score_and_blind_points(client, auth):
    sid = _start(client, auth).json()["id"]
    _answer(client, auth, sid, "q-1", 2)  # 对
    _answer(client, auth, sid, "q-2", 0)  # 错

    body = _grade(client, auth, sid).json()
    assert body["score"] == 50
    assert body["passed"] is False
    assert body["graded"] is True
    assert "光学" in body["blindPoints"]
    assert "基础" not in body["blindPoints"]


def test_grade_pass_threshold_is_80(client, auth):
    sid = _start(client, auth).json()["id"]
    _answer(client, auth, sid, "q-1", 2)
    _answer(client, auth, sid, "q-2", 1)

    body = _grade(client, auth, sid).json()
    assert body["score"] == 100
    assert body["passed"] is True
    assert body["blindPoints"] == []


def test_graded_flag_survives_in_list(client, auth):
    sid = _start(client, auth).json()["id"]
    assert client.get("/api/quiz/sessions", headers=auth("u-1")).json()[0]["graded"] is False

    _grade(client, auth, sid)
    assert client.get("/api/quiz/sessions", headers=auth("u-1")).json()[0]["graded"] is True


def test_answer_is_idempotent_per_qid(client, auth):
    sid = _start(client, auth).json()["id"]
    _answer(client, auth, sid, "q-1", 0)  # 先答错
    _answer(client, auth, sid, "q-1", 2)  # 再答对，后者覆盖
    _answer(client, auth, sid, "q-2", 1)

    assert _grade(client, auth, sid).json()["score"] == 100
