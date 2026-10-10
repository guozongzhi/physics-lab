"""挑战奖励定价：由服务端按题目难度算，客户端不能自定。

这是本轮的核心防线——奖励若采信客户端传值，学生改个请求体就能随便改。
conftest 预置：t-1 下 q-1（难度 1）、q-2（难度 1）；u-1 属 g-1（500 币）。
"""

import pytest

from app.models import ClassMeta, Question

DEADLINE = "2030-01-01T00:00:00Z"


@pytest.fixture(autouse=True)
def hard_question(db):
    """conftest 只预置了 q-1/q-2（都是难度 1），这里补一道难度 3 的题。"""
    db.add(
        Question(
            id="q-3",
            type="single",
            stem="难题",
            options=["A", "B", "C", "D"],
            answer=0,
            topic_id="t-1",
            knowledge_point="综合",
            difficulty=3,
        )
    )
    db.commit()
    return "q-3"


def _set_rates(client, auth, easy=1, medium=2, hard=3, user="teacher"):
    pw = "teacher123" if user == "teacher" else None
    headers = auth(user, pw) if pw else auth(user)
    return client.put(
        "/api/class-meta",
        json={"coinEasy": easy, "coinMedium": medium, "coinHard": hard},
        headers=headers,
    )


def _create(client, auth, question_ids, user="u-1", **extra):
    return client.post(
        "/api/challenges",
        json={
            "title": "定价测试",
            "topicId": "t-1",
            "questionIds": question_ids,
            "deadline": DEADLINE,
            **extra,
        },
        headers=auth(user),
    )


# ---------- 按难度计价 ----------

def test_reward_is_sum_of_difficulty_rates(client, auth):
    """两道简单(1) + 一道困难(3)，单价 5/10/20 → 5+5+20 = 30。"""
    assert _set_rates(client, auth, 5, 10, 20).status_code == 200
    resp = _create(client, auth, ["q-1", "q-2", "q-3"])
    assert resp.status_code == 200, resp.text
    assert resp.json()["reward"] == 30


def test_challenge_questions_do_not_reveal_answers(client, auth):
    challenge = _create(client, auth, ["q-1", "q-3"]).json()
    questions = client.get(f"/api/challenges/{challenge['id']}/questions", headers=auth("u-3")).json()
    assert len(questions) == 2
    assert all(q.get("answer") is None for q in questions)


def test_reward_follows_rate_changes(client, auth):
    _set_rates(client, auth, 1, 1, 1)
    assert _create(client, auth, ["q-1", "q-2"]).json()["reward"] == 2

    _set_rates(client, auth, 100, 100, 100)
    assert _create(client, auth, ["q-1", "q-2"]).json()["reward"] == 200


def test_harder_questions_cost_more(client, auth):
    _set_rates(client, auth, 1, 1, 50)
    easy = _create(client, auth, ["q-1", "q-2"]).json()["reward"]
    hard = _create(client, auth, ["q-1", "q-3"]).json()["reward"]
    assert hard > easy


def test_pre_deduct_matches_computed_reward(client, auth, db):
    """预扣的必须是服务端算出的值——余额与流水都要对得上。"""
    _set_rates(client, auth, 50, 50, 50)
    resp = _create(client, auth, ["q-1", "q-2"])
    reward = resp.json()["reward"]
    assert reward == 100

    groups = client.get("/api/groups", headers=auth("u-1")).json()
    assert {g["id"]: g["totalCoins"] for g in groups}["g-1"] == 500 - reward

    from app.models import CoinTransaction

    db.expire_all()
    tx = (
        db.query(CoinTransaction)
        .filter(CoinTransaction.group_id == "g-1", CoinTransaction.source == "challenge")
        .order_by(CoinTransaction.created_at.desc())
        .first()
    )
    assert tx.delta == -reward


# ---------- 核心防线：客户端不能自定价 ----------

def test_client_supplied_reward_is_ignored(client, auth):
    """客户端硬塞一个 reward，服务端必须无视它，按难度自己算。"""
    _set_rates(client, auth, 1, 1, 1)
    resp = _create(client, auth, ["q-1", "q-2"], reward=99999)
    assert resp.status_code == 200, resp.text
    assert resp.json()["reward"] == 2  # 而不是 99999

    groups = client.get("/api/groups", headers=auth("u-1")).json()
    assert {g["id"]: g["totalCoins"] for g in groups}["g-1"] == 498


def test_zero_rate_blocks_creation(client, auth):
    """单价全是 0 时应拒绝，而不是建出一个 0 币的挑战。"""
    _set_rates(client, auth, 0, 0, 0)
    resp = _create(client, auth, ["q-1", "q-2"])
    assert resp.status_code == 400


# ---------- 入参校验 ----------

def test_empty_question_ids_rejected(client, auth):
    assert _create(client, auth, []).status_code == 400


def test_unknown_question_id_rejected(client, auth):
    assert _create(client, auth, ["q-1", "q_nope"]).status_code == 400


# ---------- PUT /class-meta 的权限与边界 ----------

def test_student_cannot_set_rates(client, auth):
    assert _set_rates(client, auth, 9, 9, 9, user="u-1").status_code == 403


def test_rates_are_persisted(client, auth):
    _set_rates(client, auth, 7, 8, 9)
    meta = client.get("/api/class-meta", headers=auth("u-1")).json()
    assert (meta["coinEasy"], meta["coinMedium"], meta["coinHard"]) == (7, 8, 9)


@pytest.mark.parametrize("bad", [-1, 101, 100000])
def test_out_of_range_rate_rejected(client, auth, bad):
    assert _set_rates(client, auth, bad, 2, 3).status_code == 422


# ---------- 越界难度值向最近档收拢 ----------

def test_out_of_range_difficulty_clamps(client, auth, db):
    """题库里若出现难度 0 或 9，不能算出负数或天价。"""
    db.add(Question(id="q-low", type="single", stem="低", options=["A", "B"], answer=0, topic_id="t-1", knowledge_point="x", difficulty=0))
    db.add(Question(id="q-high", type="single", stem="高", options=["A", "B"], answer=0, topic_id="t-1", knowledge_point="x", difficulty=9))
    db.commit()

    _set_rates(client, auth, 1, 2, 3)
    # 难度 0 收拢到简单(1)，难度 9 收拢到困难(3)
    assert _create(client, auth, ["q-low", "q-high"]).json()["reward"] == 4
