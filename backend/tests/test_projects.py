"""项目链路测试：创建、信息更新（技术要点/难点/器材等）、权限控制。"""


def _create_project(client, headers, title="单摆实验", topic="力学"):
    resp = client.post(
        "/api/projects",
        json={
            "title": title,
            "topic": topic,
            "techPoints": "",
            "difficulties": "",
            "equipmentList": [{"name": "铁架台", "qty": 1, "category": "mechanical"}],
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_safety_pass_requires_server_graded_attempt(client, auth, db):
    from app.models import Question

    project = _create_project(client, auth("u-1"))
    endpoint = f"/api/projects/{project['id']}/safety-pass"
    assert client.post(endpoint, headers=auth("u-1")).status_code == 403
    assert client.post(endpoint, headers=auth("u-3")).status_code == 403
    db.add(Question(id="sq-project", type="single", stem="机械安全", options=["错", "对"], answer=1, safety_category="mechanical"))
    db.commit()
    headers = auth("u-1")
    exam = client.post("/api/safety/exams/start", json={"category": "mechanical", "projectId": project["id"]}, headers=headers).json()
    result = client.post(f"/api/safety/exams/{exam['id']}/submit", json={"answers": {"sq-project": 1}}, headers=headers)
    assert result.json()["passed"] is True
    assert client.post(endpoint, headers=headers).status_code == 200


def test_create_and_update_project_tech_points(client, auth):
    headers = auth("u-1")  # g-1 组长
    project = _create_project(client, headers)

    resp = client.put(
        f"/api/projects/{project['id']}",
        json={"techPoints": "# 要点\n周期公式 T=2π√(L/g)", "difficulties": "# 难点\n计时误差"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "周期公式" in body["techPoints"]
    assert "计时误差" in body["difficulties"]

    # GET 持久化校验
    got = client.get(f"/api/projects/{project['id']}", headers=headers).json()
    assert "周期公式" in got["techPoints"]
    assert "计时误差" in got["difficulties"]


def test_update_project_partial_fields_keep_others(client, auth):
    headers = auth("u-1")
    project = _create_project(client, headers)

    resp = client.put(
        f"/api/projects/{project['id']}",
        json={"title": "单摆周期探究"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "单摆周期探究"
    # 未传字段保持不变
    assert body["topic"] == "力学"
    assert body["equipmentList"][0]["name"] == "铁架台"


def test_update_equipment_reinfers_safety_category(client, auth):
    headers = auth("u-1")
    project = _create_project(client, headers)
    assert project["safetyCategory"] == "mechanical"

    resp = client.put(
        f"/api/projects/{project['id']}",
        json={"equipmentList": [{"name": "电源", "qty": 1, "category": "electric"}]},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["safetyCategory"] == "electric"


def test_student_cannot_update_other_group_project(client, auth):
    # u-1 属于 g-1，u-3 属于 g-2
    project = _create_project(client, auth("u-1"))
    resp = client.put(
        f"/api/projects/{project['id']}",
        json={"techPoints": "篡改"},
        headers=auth("u-3"),
    )
    assert resp.status_code == 403


def test_teacher_can_update_any_project(client, auth):
    project = _create_project(client, auth("u-1"))
    resp = client.put(
        f"/api/projects/{project['id']}",
        json={"results": "# 实验结论\n数据吻合"},
        headers=auth("teacher", "teacher123"),
    )
    assert resp.status_code == 200
    assert "数据吻合" in resp.json()["results"]


def test_update_project_not_found(client, auth):
    resp = client.put(
        "/api/projects/proj_nope",
        json={"techPoints": "x"},
        headers=auth("u-1"),
    )
    assert resp.status_code == 404


def test_update_project_requires_auth(client):
    resp = client.put("/api/projects/proj_x", json={"techPoints": "x"})
    assert resp.status_code == 401


def test_student_cannot_settle_other_group_project(client, auth):
    project = _create_project(client, auth("u-1"))  # 属 g-1
    resp = client.post(f"/api/projects/{project['id']}/done", headers=auth("u-3"))  # g-2 学生
    assert resp.status_code == 403


def test_project_done_idempotent(client, auth):
    project = _create_project(client, auth("u-1"))
    assert client.post(f"/api/projects/{project['id']}/done", headers=auth("u-1")).status_code == 200
    resp = client.post(f"/api/projects/{project['id']}/done", headers=auth("u-1"))
    assert resp.status_code == 400


def test_student_cannot_update_other_group_status(client, auth):
    project = _create_project(client, auth("u-1"))
    resp = client.put(f"/api/projects/{project['id']}/status", json={"status": "failed"}, headers=auth("u-3"))
    assert resp.status_code == 403


def test_owner_can_delete_project(client, auth):
    project = _create_project(client, auth("u-1"))
    resp = client.delete(f"/api/projects/{project['id']}", headers=auth("u-1"))
    assert resp.status_code == 200
    ids = [p["id"] for p in client.get("/api/projects", headers=auth("u-1")).json()]
    assert project["id"] not in ids


def test_student_cannot_delete_other_group(client, auth):
    project = _create_project(client, auth("u-1"))
    resp = client.delete(f"/api/projects/{project['id']}", headers=auth("u-3"))
    assert resp.status_code == 403


def test_teacher_can_delete_any_project(client, auth):
    project = _create_project(client, auth("u-1"))
    resp = client.delete(f"/api/projects/{project['id']}", headers=auth("teacher", "teacher123"))
    assert resp.status_code == 200


def test_delete_project_not_found(client, auth):
    resp = client.delete("/api/projects/proj_nope", headers=auth("u-1"))
    assert resp.status_code == 404


def test_delete_project_requires_auth(client):
    resp = client.delete("/api/projects/proj_x")
    assert resp.status_code == 401


def test_teacher_create_project_with_group(client, auth):
    resp = client.post(
        "/api/projects",
        json={"title": "教师代建", "topic": "力学", "ownerGroupId": "g-2"},
        headers=auth("teacher", "teacher123"),
    )
    assert resp.status_code == 200
    assert resp.json()["ownerGroupId"] == "g-2"


def test_teacher_create_project_requires_group(client, auth):
    resp = client.post(
        "/api/projects",
        json={"title": "教师代建", "topic": "力学"},
        headers=auth("teacher", "teacher123"),
    )
    assert resp.status_code == 400
