"""转账审核：角色与班级权限、延迟记账、重复操作和失败回滚。"""
import pytest
from app.models import CoinTransaction, CoinTransferRequest, Group, User


def apply(client, auth, amount=50):
    response = client.post('/api/coins/transfer', headers=auth('u-1'), json={
        'sourceGroupId': 'g-1', 'targetGroupId': 'g-2', 'amount': amount, 'note': '设备借用',
    })
    assert response.status_code == 200, response.text
    return response.json()['id']


def review(client, auth, request_id, decision='approve', username='teacher', password='teacher123'):
    return client.post(f'/api/coins/transfers/{request_id}/review',
                       headers=auth(username, password), json={'decision': decision})


@pytest.mark.parametrize('username,password', [('u-2', 'student123'), ('teacher', 'teacher123')])
def test_only_leader_can_apply(client, auth, db, username, password):
    response = client.post('/api/coins/transfer', headers=auth(username, password), json={
        'sourceGroupId': 'g-1', 'targetGroupId': 'g-2', 'amount': 50,
    })
    assert response.status_code == 403
    assert db.query(CoinTransferRequest).count() == 0
    assert db.query(CoinTransaction).count() == 0


def test_student_cannot_review(client, auth, db):
    request_id = apply(client, auth)
    assert review(client, auth, request_id, username='u-1', password='student123').status_code == 403
    assert db.query(CoinTransaction).count() == 0


@pytest.mark.parametrize('decision', ['approve', 'reject'])
def test_review_once_only(client, auth, db, decision):
    request_id = apply(client, auth)
    reviewed = review(client, auth, request_id, decision)
    assert reviewed.status_code == 200
    assert reviewed.json()['reviewedAt'].endswith('+00:00')
    assert reviewed.json()['createdAt'].endswith('+00:00')
    assert review(client, auth, request_id, 'approve').status_code == 409
    assert review(client, auth, request_id, 'reject').status_code == 409
    db.expire_all()
    assert db.get(Group, 'g-1').total_coins == (450 if decision == 'approve' else 500)
    assert db.get(Group, 'g-2').total_coins == (350 if decision == 'approve' else 300)
    assert db.query(CoinTransaction).count() == (2 if decision == 'approve' else 0)


def test_balance_checked_again_and_failed_review_rolls_back(client, auth, db):
    request_id = apply(client, auth, 400)
    client.post('/api/groups/g-1/coins', headers=auth('teacher', 'teacher123'), json={'delta': -300})
    response = review(client, auth, request_id)
    assert response.status_code == 400
    db.expire_all()
    request = db.get(CoinTransferRequest, request_id)
    assert request.status == 'pending' and request.reviewed_by is None
    assert db.get(Group, 'g-1').total_coins == 200
    assert db.get(Group, 'g-2').total_coins == 300
    assert db.query(CoinTransaction).filter_by(source='transfer').count() == 0
    # 老师直接补币后可再次审核。
    client.post('/api/groups/g-1/coins', headers=auth('teacher', 'teacher123'), json={'delta': 300})
    assert review(client, auth, request_id).status_code == 200


def test_teacher_class_scope(client, auth, db):
    request_id = apply(client, auth)
    teacher = db.get(User, 'teacher')
    teacher.class_id = 'class-2'
    db.commit()
    assert review(client, auth, request_id).status_code == 403
    assert client.get('/api/coins/transfers', headers=auth('teacher', 'teacher123')).json() == []
    db.expire_all()
    assert db.get(CoinTransferRequest, request_id).status == 'pending'
    assert db.query(CoinTransaction).count() == 0


def test_list_only_own_group_and_class(client, auth):
    request_id = apply(client, auth)
    for username in ('u-1', 'u-2', 'u-3'):
        response = client.get('/api/coins/transfers', headers=auth(username))
        assert [r['id'] for r in response.json()] == [request_id]
    for username in ('u-4', 'u-5'):
        assert client.get('/api/coins/transfers', headers=auth(username)).json() == []


def test_review_allowed_after_windows_close(client, auth):
    request_id = apply(client, auth)
    response = client.put('/api/activity-window', headers=auth('teacher', 'teacher123'), json={
        'challengeOpen': False, 'recruitOpen': False,
    })
    assert response.status_code == 200
    assert review(client, auth, request_id).status_code == 200


def test_competing_pending_requests_do_not_overspend(client, auth, db):
    first = apply(client, auth, 400)
    second = apply(client, auth, 400)
    assert review(client, auth, first).status_code == 200
    assert review(client, auth, second).status_code == 400
    db.expire_all()
    assert db.get(Group, 'g-1').total_coins == 100
    assert db.get(Group, 'g-2').total_coins == 700
    assert db.query(CoinTransaction).filter_by(source='transfer').count() == 2
