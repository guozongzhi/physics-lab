"""成果展览馆：教师编辑/下架，以及"学生改要重审、教师改不重审"的分歧。

预置数据见 conftest：u-1/u-2 属 g-1，u-3 属 g-2，teacher 为教师账号。
"""

from app.models import Group

teacher = lambda auth: auth("teacher", "teacher123")  # noqa: E731


def _create(client, auth, group_id="g-1", title="作品A", category=None):
    payload = {"title": title, "coverImage": "", "groupId": group_id, "description": "说明"}
    if category is not None:
        payload["category"] = category
    resp = client.post("/api/showcase", json=payload, headers=auth("u-1"))
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _approve(client, auth, sid, coins=0):
    resp = client.post(
        f"/api/showcase/{sid}/review",
        json={"action": "approve", "coins": coins},
        headers=teacher(auth),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ---------- 编辑 ----------

def test_teacher_edit_keeps_approved_status(client, auth):
    """回归：教师改已通过的作品不得把它打回待审批。"""
    sid = _create(client, auth)
    _approve(client, auth, sid)

    resp = client.put(f"/api/showcase/{sid}", json={"title": "改过的标题"}, headers=teacher(auth))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "approved"
    assert body["title"] == "改过的标题"


def test_approval_reward_is_not_duplicated(client, auth, db):
    sid = _create(client, auth)
    _approve(client, auth, sid, coins=50)
    db.expire_all()
    before = db.get(Group, "g-1").total_coins
    repeat = client.post(f"/api/showcase/{sid}/review", json={"action": "approve", "coins": 50}, headers=teacher(auth))
    assert repeat.status_code == 409
    db.expire_all()
    assert db.get(Group, "g-1").total_coins == before


def test_student_cannot_submit_for_another_group(client, auth):
    resp = client.post("/api/showcase", json={"title": "越权", "coverImage": "", "groupId": "g-2"}, headers=auth("u-1"))
    assert resp.status_code == 403


def test_student_only_sees_own_pending_items(client, auth):
    sid = _create(client, auth)
    assert any(item["id"] == sid for item in client.get("/api/showcase", headers=auth("u-1")).json())
    assert all(item["id"] != sid for item in client.get("/api/showcase", headers=auth("u-3")).json())


def test_teacher_edit_can_change_cover_and_description(client, auth):
    sid = _create(client, auth)
    resp = client.put(
        f"/api/showcase/{sid}",
        json={"coverImage": "https://example.com/a.png", "description": "新说明"},
        headers=teacher(auth),
    )
    assert resp.status_code == 200
    assert resp.json()["coverImage"] == "https://example.com/a.png"
    assert resp.json()["description"] == "新说明"


def test_student_edit_still_resets_to_pending(client, auth):
    """学生改本组作品仍须重新送审（原有行为不能因教师改动而丢失）。"""
    sid = _create(client, auth)
    _approve(client, auth, sid)

    resp = client.put(f"/api/showcase/{sid}", json={"title": "学生改的"}, headers=auth("u-1"))
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"


def test_non_owner_student_cannot_edit(client, auth):
    sid = _create(client, auth, group_id="g-1")
    resp = client.put(f"/api/showcase/{sid}", json={"title": "越权"}, headers=auth("u-3"))
    assert resp.status_code == 403


# ---------- 下架 ----------

def test_teacher_deletes_showcase(client, auth):
    sid = _create(client, auth)
    assert client.delete(f"/api/showcase/{sid}", headers=teacher(auth)).status_code == 200
    remaining = client.get("/api/showcase", headers=auth("u-1")).json()
    assert all(s["id"] != sid for s in remaining)


def test_student_cannot_delete(client, auth):
    sid = _create(client, auth)
    assert client.delete(f"/api/showcase/{sid}", headers=auth("u-1")).status_code == 403


def test_delete_unknown_is_404(client, auth):
    assert client.delete("/api/showcase/sc_nope", headers=teacher(auth)).status_code == 404


def test_delete_does_not_claw_back_awarded_coins(client, auth, db):
    """下架只删展示条目，已发出去的奖励能量币留在小组账上。"""
    sid = _create(client, auth)
    _approve(client, auth, sid, coins=50)
    db.expire_all()
    after_award = db.get(Group, "g-1").total_coins

    client.delete(f"/api/showcase/{sid}", headers=teacher(auth))
    db.expire_all()
    assert db.get(Group, "g-1").total_coins == after_award


def test_delete_pending_item(client, auth):
    sid = _create(client, auth)
    assert client.delete(f"/api/showcase/{sid}", headers=teacher(auth)).status_code == 200


# ---------- 作品分类（展览馆顶部筛选 tab 的依据） ----------

def test_category_is_persisted(client, auth):
    """上传表单一直让学生选分类，但从前端到模型都没有这个字段——选了等于白选。"""
    sid = _create(client, auth, category="video")
    item = [s for s in client.get("/api/showcase", headers=auth("u-1")).json() if s["id"] == sid][0]
    assert item["category"] == "video"


def test_category_defaults_to_photo(client, auth):
    sid = _create(client, auth)  # 不传 category
    item = [s for s in client.get("/api/showcase", headers=auth("u-1")).json() if s["id"] == sid][0]
    assert item["category"] == "photo"


def test_invalid_category_rejected(client, auth):
    resp = client.post(
        "/api/showcase",
        json={"title": "x", "coverImage": "", "groupId": "g-1", "description": "", "category": "nope"},
        headers=auth("u-1"),
    )
    assert resp.status_code == 422


def test_teacher_can_change_category(client, auth):
    sid = _create(client, auth, category="photo")
    resp = client.put(f"/api/showcase/{sid}", json={"category": "paper"}, headers=teacher(auth))
    assert resp.status_code == 200, resp.text
    assert resp.json()["category"] == "paper"


def test_student_edit_can_change_category_and_resets_status(client, auth):
    sid = _create(client, auth, category="photo")
    _approve(client, auth, sid)
    resp = client.put(f"/api/showcase/{sid}", json={"category": "model"}, headers=auth("u-1"))
    assert resp.status_code == 200
    assert resp.json()["category"] == "model"
    assert resp.json()["status"] == "pending"  # 学生改仍需重新审批

# ---------- 平台公共 Demo ----------
def _admin(auth, db):
    from app.models import User
    from conftest import TEACHER_HASH
    db.add(User(id="admin", username="admin", password_hash=TEACHER_HASH, account_role="admin", name="管理员"))
    db.commit()
    return auth("admin", "teacher123")


def test_public_demo_admin_ownership_and_visibility(client, auth, db):
    headers = _admin(auth, db)
    r = client.post("/api/showcase", headers=headers, json={"title": "光学公共 Demo", "groupId": "", "coverImage": "/images/showcase-fallback.jpg", "demoKind": "optics"})
    assert r.status_code == 200, r.text
    item = r.json()
    assert item["authorUserId"] == "admin" and item["groupId"] == "" and item["demoKind"] == "optics"
    sid = item["id"]
    for student in ("u-1", "u-3", "u-4", "u-5"):
        assert not any(x["id"] == sid for x in client.get("/api/showcase", headers=auth(student)).json())
    _approve(client, auth, sid)
    for student in ("u-1", "u-3", "u-4", "u-5"):
        assert any(x["id"] == sid for x in client.get("/api/showcase", headers=auth(student)).json())
        assert client.put(f"/api/showcase/{sid}", json={"title": "篡改"}, headers=auth(student)).status_code == 403
        assert client.delete(f"/api/showcase/{sid}", headers=auth(student)).status_code == 403


def test_public_demo_rejects_non_admin_creation_and_group_reward(client, auth, db):
    payload = {"title": "公共电机", "groupId": "", "coverImage": "", "demoKind": "motor"}
    for headers in (auth("u-1"), auth("u-4"), teacher(auth)):
        assert client.post("/api/showcase", json=payload, headers=headers).status_code == 403
    sid = client.post("/api/showcase", json=payload, headers=_admin(auth, db)).json()["id"]
    r = client.post(f"/api/showcase/{sid}/review", json={"action": "approve", "coins": 50}, headers=teacher(auth))
    assert r.status_code == 400
    item = next(x for x in client.get("/api/showcase", headers=teacher(auth)).json() if x["id"] == sid)
    assert item["status"] == "pending" and item["awardedCoins"] == 0
    _approve(client, auth, sid)


def test_public_demo_metadata_validation(client, auth, db):
    headers = _admin(auth, db)
    payload = {"title": "Demo", "groupId": "", "coverImage": ""}
    assert client.post("/api/showcase", json={**payload, "demoKind": "arbitrary"}, headers=headers).status_code == 422
    assert client.post("/api/showcase", json={**payload, "projectId": "p-1"}, headers=headers).status_code == 400
    assert client.post("/api/showcase", json={**payload, "groupId": "g-1", "demoKind": "motor"}, headers=headers).status_code == 400
    sid = _create(client, auth)
    item = next(x for x in client.get("/api/showcase", headers=auth("u-1")).json() if x["id"] == sid)
    assert item["authorUserId"] == "" and item["demoKind"] == "" and item["groupId"] == "g-1"


def test_showcase_upgrade_preserves_existing_records_and_is_idempotent(monkeypatch):
    from sqlalchemy import create_engine, text
    from app import database
    legacy = create_engine("sqlite://")
    with legacy.begin() as conn:
        conn.execute(text("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, class_id TEXT)"))
        conn.execute(text("CREATE TABLE showcase_items (id TEXT PRIMARY KEY, group_id TEXT, status TEXT, reject_reason TEXT, awarded_coins INTEGER, category TEXT)"))
        conn.execute(text("INSERT INTO showcase_items VALUES ('old', 'g-1', 'approved', '', 50, 'photo')"))
    monkeypatch.setattr(database, "engine", legacy)
    database._run_lightweight_migrations()
    database._run_lightweight_migrations()
    with legacy.connect() as conn:
        row = conn.execute(text("SELECT * FROM showcase_items")).mappings().one()
        assert dict(row) == {"id": "old", "group_id": "g-1", "status": "approved", "reject_reason": "", "awarded_coins": 50, "category": "photo", "author_user_id": "", "demo_kind": ""}
        assert conn.execute(text("PRAGMA integrity_check")).scalar() == "ok"
    legacy.dispose()
