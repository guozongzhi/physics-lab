"""安全考核指派：可见性分流、权限、以及"及格由服务端推导"的防伪造。

预置数据（见 conftest）：g-1/g-2 属 class-1，g-3 属 class-2，
u-4（class-1）与 u-5（class-2）都没有小组——这两个是 NULL 匹配回归的关键。
"""


def _create(client, auth, **overrides):
    payload = {
        "title": "辐射安全随堂测",
        "category": "radiation",
        "questionCount": 5,
        "timeLimit": 15,
        "passScore": 60,
        "classId": "class-1",
        "groupId": None,
    }
    payload.update(overrides)
    return client.post("/api/safety/assignments", json=payload, headers=auth("teacher", "teacher123"))


# ---------- 创建与校验 ----------

def test_teacher_creates_class_assignment(client, auth):
    resp = _create(client, auth)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["title"] == "辐射安全随堂测"
    assert body["classId"] == "class-1"
    assert body["groupId"] is None
    assert body["passScore"] == 60


def test_create_rejects_both_targets(client, auth):
    resp = _create(client, auth, classId="class-1", groupId="g-1")
    assert resp.status_code == 422


def test_create_rejects_no_target(client, auth):
    resp = _create(client, auth, classId=None, groupId=None)
    assert resp.status_code == 422


def test_create_rejects_unknown_target(client, auth):
    assert _create(client, auth, classId="class-404").status_code == 400
    assert _create(client, auth, classId=None, groupId="g-404").status_code == 400


def test_student_cannot_create(client, auth):
    payload = {
        "title": "辐射安全随堂测",
        "category": "radiation",
        "questionCount": 5,
        "timeLimit": 15,
        "passScore": 60,
        "classId": "class-1",
        "groupId": None,
    }
    assert client.post("/api/safety/assignments", json=payload, headers=auth("u-1")).status_code == 403


# ---------- 可见性分流 ----------

def test_student_sees_assignment_for_own_class(client, auth):
    _create(client, auth)
    resp = client.get("/api/safety/assignments", headers=auth("u-4"))
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_student_without_group_does_not_see_other_class(client, auth):
    """回归：class-1 的指派（groupId 为 NULL）不得被 class-2 的无组学生看到。

    曾因 `group_id == None` 被渲染成 `group_id IS NULL` 而误匹配。
    """
    _create(client, auth)
    resp = client.get("/api/safety/assignments", headers=auth("u-5"))
    assert resp.status_code == 200
    assert resp.json() == []


def test_group_assignment_not_visible_to_other_group(client, auth):
    _create(client, auth, classId=None, groupId="g-1")
    assert len(client.get("/api/safety/assignments", headers=auth("u-1")).json()) == 1
    assert client.get("/api/safety/assignments", headers=auth("u-3")).json() == []


def test_teacher_sees_all_assignments(client, auth):
    _create(client, auth)
    _create(client, auth, classId=None, groupId="g-3")
    resp = client.get("/api/safety/assignments", headers=auth("teacher", "teacher123"))
    assert len(resp.json()) == 2


def test_get_assignment_respects_visibility(client, auth):
    aid = _create(client, auth).json()["id"]
    assert client.get(f"/api/safety/assignments/{aid}", headers=auth("u-4")).status_code == 200
    assert client.get(f"/api/safety/assignments/{aid}", headers=auth("u-5")).status_code == 403


def test_delete_assignment(client, auth):
    aid = _create(client, auth).json()["id"]
    assert client.delete(f"/api/safety/assignments/{aid}", headers=auth("teacher", "teacher123")).status_code == 200
    assert client.get("/api/safety/assignments", headers=auth("teacher", "teacher123")).json() == []


# ---------- 服务端判分 ----------

def _question(db):
    from app.models import Question
    db.add(Question(id="sq-radiation", type="single", stem="安全题", options=["错", "对"], answer=1, safety_category="radiation"))
    db.commit()


def test_client_cannot_forge_safety_result(client, auth, db):
    _question(db)
    aid = _create(client, auth, passScore=60).json()["id"]
    headers = auth("u-4")
    assert client.post("/api/safety/records", json={"category": "radiation", "score": 100, "passed": True}, headers=headers).status_code == 410
    started = client.post("/api/safety/exams/start", json={"category": "radiation", "assignmentId": aid}, headers=headers)
    assert started.status_code == 200
    assert "answer" not in started.json()["questions"][0]
    result = client.post(f"/api/safety/exams/{started.json()['id']}/submit", json={"answers": {"sq-radiation": 0}}, headers=headers)
    assert result.status_code == 200
    assert result.json()["score"] == 0 and result.json()["passed"] is False
    assert result.json()["assignmentId"] == aid
    assert client.post(f"/api/safety/exams/{started.json()['id']}/submit", json={"answers": {"sq-radiation": 1}}, headers=headers).status_code == 409


def test_correct_answer_passes(client, auth, db):
    _question(db)
    aid = _create(client, auth, passScore=60).json()["id"]
    headers = auth("u-4")
    started = client.post("/api/safety/exams/start", json={"category": "radiation", "assignmentId": aid}, headers=headers).json()
    result = client.post(f"/api/safety/exams/{started['id']}/submit", json={"answers": {"sq-radiation": 1}}, headers=headers)
    assert result.json()["passed"] is True


def test_unassigned_student_cannot_start_other_class_exam(client, auth, db):
    _question(db)
    aid = _create(client, auth).json()["id"]
    resp = client.post("/api/safety/exams/start", json={"category": "radiation", "assignmentId": aid}, headers=auth("u-5"))
    assert resp.status_code == 403


def test_unknown_assignment_is_404(client, auth):
    resp = client.post("/api/safety/exams/start", json={"category": "radiation", "assignmentId": "sasgn_nope"}, headers=auth("u-1"))
    assert resp.status_code == 404
