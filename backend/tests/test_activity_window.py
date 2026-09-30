"""教师可控的开放窗口。

核心约定：窗口只挡**新开局**（建挑战 / 发招募 / 投标 / 发起转账），
**不挡结算**——已经开着的挑战与招募必须能收尾，否则交过押金的一方会被卡住。
"""

from datetime import datetime, timedelta, timezone

from app.models import ClassMeta

DEADLINE = "2030-01-01T00:00:00Z"
ALL_CLOSED = {
    "challengeOpen": False,
    "challengeMinutes": None,
    "recruitOpen": False,
    "recruitMinutes": None,
}


def _set_window(client, auth, **overrides) -> dict:
    body = {**ALL_CLOSED, **overrides}
    resp = client.put("/api/activity-window", json=body, headers=auth("teacher", "teacher123"))
    assert resp.status_code == 200, resp.text
    return resp.json()


def _create_challenge(client, auth, user: str = "u-1"):
    return client.post(
        "/api/challenges",
        json={
            "title": "力学挑战",
            "topicId": "t-1",
            "questionIds": ["q-1", "q-2"],
            "deadline": DEADLINE,
        },
        headers=auth(user),
    )


def _make_project(client, auth) -> str:
    resp = client.post(
        "/api/projects", json={"title": "窗口用项目", "topic": "力学"}, headers=auth("u-1")
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _create_recruitment(
    client, auth, project_id: str, reward: int = 10, as_user: str = "u-1", as_password: str = "student123"
):
    return client.post(
        "/api/recruitments",
        json={
            "projectId": project_id,
            "title": "招募助手",
            "description": "",
            "skills": [],
            "reward": reward,
            "deadline": DEADLINE,
        },
        headers=auth(as_user, as_password),
    )


def _transfer(client, auth):
    return client.post(
        "/api/coins/transfer",
        json={"sourceGroupId": "g-1", "targetGroupId": "g-2", "amount": 10},
        headers=auth("u-1"),
    )


# ---------- 默认与权限 ----------

def test_windows_default_open_so_behavior_is_unchanged(client, auth):
    """不设窗口时学生照常可用——上线不能把现有功能突然锁上。"""
    assert _create_challenge(client, auth).status_code == 200
    assert _create_recruitment(client, auth, _make_project(client, auth)).status_code == 200
    assert _transfer(client, auth).status_code == 200


def test_activity_window_requires_teacher(client, auth):
    resp = client.put("/api/activity-window", json=ALL_CLOSED, headers=auth("u-1"))
    assert resp.status_code == 403


# ---------- 闸门 ----------

def test_closed_challenge_window_blocks_students(client, auth):
    _set_window(client, auth)
    resp = _create_challenge(client, auth, "u-1")
    assert resp.status_code == 403
    assert "挑战窗口" in resp.json()["detail"]


def test_closed_recruit_window_blocks_create_and_bid(client, auth):
    project_id = _make_project(client, auth)
    _set_window(client, auth)  # 关招募窗口之前先把项目建出来（项目不受窗口管）

    assert _create_recruitment(client, auth, project_id).status_code == 403

    # 教师不受窗口限制：他们在教师端也有发布入口，锁上会自相矛盾
    teacher_recruit = _create_recruitment(
        client, auth, project_id, as_user="teacher", as_password="teacher123"
    )
    assert teacher_recruit.status_code == 200, teacher_recruit.text

    # 先开着窗口发一条，再关上，投标也应被挡
    _set_window(client, auth, recruitOpen=True)
    rec_id = _create_recruitment(client, auth, project_id).json()["id"]
    _set_window(client, auth)

    resp = client.post(
        f"/api/recruitments/{rec_id}/bid",
        json={"userId": "u-3", "skillDesc": "", "hours": 1},
        headers=auth("u-3"),
    )
    assert resp.status_code == 403
    assert "招募窗口" in resp.json()["detail"]


def test_transfer_allowed_while_either_window_is_open(client, auth):
    # 只开招募 → 可转账（"有课＝有监督"）
    _set_window(client, auth, recruitOpen=True)
    assert _transfer(client, auth).status_code == 200

    # 只开挑战 → 也可转账
    _set_window(client, auth, challengeOpen=True)
    assert _transfer(client, auth).status_code == 200

    # 两个都关 → 转账也关
    _set_window(client, auth)
    resp = _transfer(client, auth)
    assert resp.status_code == 403
    assert "组间转账" in resp.json()["detail"]


# ---------- 自动关闭 ----------

def test_minutes_sets_an_auto_close_time(client, auth):
    body = _set_window(client, auth, challengeOpen=True, challengeMinutes=30)
    closes_at = datetime.fromisoformat(body["challengeWindowClosesAt"]).replace(tzinfo=None)
    delta = closes_at - datetime.now(timezone.utc).replace(tzinfo=None)
    assert timedelta(minutes=29) < delta <= timedelta(minutes=30)


def test_open_without_minutes_never_auto_closes(client, auth):
    body = _set_window(client, auth, challengeOpen=True, recruitOpen=True)
    assert body["challengeWindowClosesAt"] is None
    assert body["recruitWindowClosesAt"] is None


def test_expired_window_behaves_closed(client, auth, db):
    """到点后是惰性判定为关闭，不依赖任何定时任务。"""
    _set_window(client, auth, challengeOpen=True, challengeMinutes=30)
    assert _create_challenge(client, auth).status_code == 200

    meta = db.get(ClassMeta, 1)
    meta.challenge_window_closes_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
    db.commit()

    resp = _create_challenge(client, auth)
    assert resp.status_code == 403
    assert "挑战窗口" in resp.json()["detail"]


# ---------- 关键回归：关窗不能把已开的结算卡住 ----------

def test_closing_window_does_not_block_settlement(client, auth):
    _set_window(client, auth, challengeOpen=True, recruitOpen=True)

    challenge_id = _create_challenge(client, auth).json()["id"]
    project_id = _make_project(client, auth)
    rec_id = _create_recruitment(client, auth, project_id).json()["id"]
    client.put(f"/api/recruitments/{rec_id}/assign", json={"userId": "u-3"}, headers=auth("u-1"))

    # 下课，老师把两个窗口都关了
    _set_window(client, auth)

    # 已开的那局挑战照常作答（并结算）
    resp = client.post(
        f"/api/challenges/{challenge_id}/submit",
        json={"answers": {"q-1": 2, "q-2": 1}},
        headers=auth("u-3"),
    )
    assert resp.status_code == 200, resp.text

    # 已发的那条招募照常结算、押金照常退回
    resp = client.put(
        f"/api/recruitments/{rec_id}/resolve", json={"result": "fail"}, headers=auth("u-1")
    )
    assert resp.status_code == 200, resp.text

    # 结算是零和的：g-1 交出去的押金原样回来
    # 500 − 2（挑战被答对，转给 g-2）− 10（招募押金）+ 10（失败退回）= 498
    balances = {g["id"]: g["totalCoins"] for g in client.get("/api/groups", headers=auth("u-1")).json()}
    assert balances["g-1"] == 498
