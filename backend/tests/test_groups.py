"""分组链路测试：建组、按班筛选、学生加入小组、组长设置。"""


def test_teacher_create_group(client, auth):
    resp = client.post(
        "/api/groups",
        json={"name": "新小组", "initialCoins": 100, "classId": "class-1"},
        headers=auth("teacher", "teacher123"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "新小组"
    assert body["totalCoins"] == 100
    assert body["classId"] == "class-1"


def test_create_group_invalid_class(client, auth):
    resp = client.post(
        "/api/groups",
        json={"name": "X", "initialCoins": 0, "classId": "nope"},
        headers=auth("teacher", "teacher123"),
    )
    assert resp.status_code == 400


def test_create_group_requires_teacher(client, auth):
    resp = client.post(
        "/api/groups",
        json={"name": "学生组", "initialCoins": 0, "classId": "class-1"},
        headers=auth("u-1"),
    )
    assert resp.status_code == 403


def test_list_groups_filter_by_class(client, auth):
    resp = client.get("/api/groups", headers=auth("u-1"))
    assert resp.status_code == 200
    all_ids = {g["id"] for g in resp.json()}
    assert all_ids == {"g-1", "g-2"}

    resp = client.get("/api/groups", params={"class_id": "class-1"}, headers=auth("u-1"))
    assert {g["id"] for g in resp.json()} == {"g-1", "g-2"}


def test_student_cannot_read_other_class_students(client, auth):
    headers = auth("u-1")
    assert "u-5" not in {u["id"] for u in client.get("/api/users", headers=headers).json()}
    assert client.get("/api/users/u-5", headers=headers).status_code == 403


def test_student_only_sees_own_class_coin_history(client, auth, db):
    from app.models import CoinTransaction

    db.add_all([
        CoinTransaction(id="tx-class-1", group_id="g-1", source="teacher_set", delta=5, balance_after=505),
        CoinTransaction(id="tx-class-2", group_id="g-3", source="teacher_set", delta=5, balance_after=205),
    ])
    db.commit()
    ids = {row["id"] for row in client.get("/api/coin-transactions", headers=auth("u-1")).json()}
    assert ids == {"tx-class-1"}


def test_teacher_cannot_move_student_across_classes(client, auth):
    resp = client.put(
        "/api/users/u-1/group",
        json={"groupId": "g-3", "role": "member"},
        headers=auth("teacher", "teacher123"),
    )
    assert resp.status_code == 403


def test_student_join_group(client, auth):
    resp = client.post("/api/groups/g-2/join", headers=auth("u-4"))
    assert resp.status_code == 200
    assert resp.json()["groupId"] == "g-2"


def test_student_join_twice_rejected(client, auth):
    # u-3 已在 g-2，再次加入应被拒绝
    resp = client.post("/api/groups/g-1/join", headers=auth("u-3"))
    assert resp.status_code == 400


def test_student_join_cross_class_rejected(client, auth):
    # u-5 属于 class-2，不能加入 class-1 的小组
    resp = client.post("/api/groups/g-1/join", headers=auth("u-5"))
    assert resp.status_code == 403


def test_set_leader(client, auth, db):
    from app.models import User

    resp = client.put("/api/groups/g-1/leader/u-2", headers=auth("teacher", "teacher123"))
    assert resp.status_code == 200

    db.expire_all()
    roles = {u.id: u.member_role for u in db.query(User).filter(User.group_id == "g-1")}
    assert roles == {"u-1": "member", "u-2": "leader"}


def test_set_leader_rejects_non_member(client, auth):
    # u-4 未入组，不能设为 g-1 组长
    resp = client.put("/api/groups/g-1/leader/u-4", headers=auth("teacher", "teacher123"))
    assert resp.status_code == 400


def test_delete_group_unassigns_members(client, auth, db):
    from app.models import User

    resp = client.delete("/api/groups/g-1", headers=auth("teacher", "teacher123"))
    assert resp.status_code == 200
    db.expire_all()
    # 成员账号保留，仅解绑
    users = {u.id: u for u in db.query(User).filter(User.id.in_(["u-1", "u-2"])).all()}
    assert users["u-1"].group_id is None
    assert users["u-2"].group_id is None


def test_teacher_adjust_student_personal_coins(client, auth, db):
    from app.models import User, CoinTransaction, Group

    before = db.get(Group, "g-1").total_coins
    # u-1 属 g-1，初始个人币 0
    resp = client.post("/api/users/u-1/coins", json={"delta": 30}, headers=auth("teacher", "teacher123"))
    assert resp.status_code == 200
    assert resp.json()["personalCoins"] == 30
    db.expire_all()
    assert db.get(User, "u-1").personal_coins == 30
    # 小组总能量随成员个人能量同步 +30
    assert db.get(Group, "g-1").total_coins == before + 30
    # 小组流水记录了该成员的个人变动
    txs = db.query(CoinTransaction).filter(CoinTransaction.user_id == "u-1").all()
    assert any(t.delta == 30 and t.group_id == "g-1" for t in txs)


def test_student_cannot_adjust_personal_coins(client, auth):
    resp = client.post("/api/users/u-2/coins", json={"delta": 50}, headers=auth("u-1"))
    assert resp.status_code == 403


def test_adjust_personal_coins_zero_rejected(client, auth):
    resp = client.post("/api/users/u-1/coins", json={"delta": 0}, headers=auth("teacher", "teacher123"))
    assert resp.status_code == 400


def test_teacher_reset_all_group_coins(client, auth):
    resp = client.post("/api/groups/reset-coins", json={"targetCoins": 300}, headers=auth("teacher", "teacher123"))
    assert resp.status_code == 200
    resp = client.get("/api/groups", headers=auth("teacher", "teacher123"))
    assert all(g["totalCoins"] == 300 for g in resp.json())


def test_student_cannot_reset_group_coins(client, auth):
    resp = client.post("/api/groups/reset-coins", json={"targetCoins": 300}, headers=auth("u-1"))
    assert resp.status_code == 403
