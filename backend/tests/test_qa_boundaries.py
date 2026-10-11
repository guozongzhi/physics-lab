"""全量验收中发现的招募身份及输入边界回归。"""
from datetime import datetime, timedelta, timezone
import pytest
from app.models import Recruitment


def recruitment(client, auth):
    h = auth('u-1')
    p = client.post('/api/projects', json={'title': 'QA', 'topic': '力学'}, headers=h).json()
    data = {'projectId': p['id'], 'title': 'QA', 'description': 'QA', 'reward': 10,
            'deadline': (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}
    r = client.post('/api/recruitments', json=data, headers=h)
    assert r.status_code == 200
    return r.json()['id'], data


def bid(client, auth, rid, user='u-3', actor='u-3'):
    return client.post(f'/api/recruitments/{rid}/bid', json={'userId': user, 'skillDesc': 'QA', 'hours': 2}, headers=auth(actor))


@pytest.mark.parametrize('user', ['u-2', 'nonexistent'])
def test_bid_cannot_impersonate(client, auth, user):
    rid, _ = recruitment(client, auth)
    assert bid(client, auth, rid, user=user).status_code == 403
    assert client.get('/api/recruitments', headers=auth('u-3')).json()[0]['bids'] == []


def test_duplicate_and_closed_bids_rejected(client, auth):
    rid, _ = recruitment(client, auth)
    assert bid(client, auth, rid).status_code == 200
    assert bid(client, auth, rid).status_code == 409
    assert client.put(f'/api/recruitments/{rid}/assign', json={'userId': 'u-3'}, headers=auth('u-1')).status_code == 200
    assert bid(client, auth, rid, user='u-2', actor='u-2').status_code == 400


def test_assignment_requires_bid(client, auth):
    rid, _ = recruitment(client, auth)
    assert client.put(f'/api/recruitments/{rid}/assign', json={'userId': 'u-3'}, headers=auth('u-1')).status_code == 400


def test_expired_recruitment_rejected(client, auth, db):
    rid, data = recruitment(client, auth)
    past = datetime.now(timezone.utc) - timedelta(days=1)
    data['deadline'] = past.isoformat()
    assert client.post('/api/recruitments', json=data, headers=auth('u-1')).status_code == 400
    rec = db.get(Recruitment, rid)
    rec.deadline = past
    db.commit()
    assert bid(client, auth, rid).status_code == 400


@pytest.mark.parametrize('ratios', [{'u-1': 150, 'u-2': -50}, {'u-3': 100}])
def test_contribution_requires_valid_members_and_range(client, auth, ratios):
    assert client.put('/api/groups/g-1/contribution', json={'ratioRecord': ratios}, headers=auth('teacher', 'teacher123')).status_code == 400


def test_negative_initial_balance_rejected(client, auth):
    assert client.post('/api/groups', json={'name': 'QA', 'initialCoins': -1}, headers=auth('teacher', 'teacher123')).status_code == 422


@pytest.mark.parametrize('suffix', ['', '/status'])
def test_project_status_must_be_known(client, auth, suffix):
    p = client.post('/api/projects', json={'title': 'QA', 'topic': '力学'}, headers=auth('u-1')).json()
    assert client.put(f"/api/projects/{p['id']}{suffix}", json={'status': 'invalid'}, headers=auth('u-1')).status_code == 422
