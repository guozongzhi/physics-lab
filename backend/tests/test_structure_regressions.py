"""结构整改发现的权限、结算与事务边界回归。"""
import pytest
from app.models import CoinTransaction, Group, Project, User


def scoped_teacher(db):
    teacher = db.get(User, 'teacher')
    teacher.class_id = 'class-1'
    db.commit()


def project(client, headers):
    res = client.post('/api/projects', json={'title': '实验', 'topic': '力学'}, headers=headers)
    assert res.status_code == 200
    return res.json()['id']


def test_student_cannot_price_project(client, auth):
    headers = auth('u-1')
    res = client.post('/api/projects', json={'title': '实验', 'topic': '力学', 'rewardCoins': 999999}, headers=headers)
    assert res.status_code == 403
    pid = project(client, headers)
    assert client.put(f'/api/projects/{pid}', json={'rewardCoins': 999999}, headers=headers).status_code == 403


@pytest.mark.parametrize('endpoint', ['', '/status'])
def test_settled_project_cannot_reopen(client, auth, db, endpoint):
    headers = auth('u-1')
    pid = project(client, headers)
    assert client.post(f'/api/projects/{pid}/done', headers=headers).status_code == 200
    assert client.put(f'/api/projects/{pid}{endpoint}', json={'status': 'planning'}, headers=headers).status_code == 409
    assert client.post(f'/api/projects/{pid}/done', headers=headers).status_code == 400
    assert db.query(CoinTransaction).filter_by(source='project', ref_id=pid).count() == 1


def test_legacy_reward_ledger_prevents_double_settlement(client, auth, db):
    headers = auth('u-1'); pid = project(client, headers)
    assert client.post(f'/api/projects/{pid}/done', headers=headers).status_code == 200
    db.get(Project, pid).status = 'progress'  # 旧版本允许重开，流水才是永久凭证
    db.commit()
    assert client.post(f'/api/projects/{pid}/done', headers=headers).status_code == 400
    assert db.query(CoinTransaction).filter_by(source='project', ref_id=pid).count() == 1


@pytest.mark.parametrize('endpoint', ['', '/status'])
def test_done_requires_settlement_endpoint(client, auth, endpoint):
    headers = auth('u-1'); pid = project(client, headers)
    assert client.put(f'/api/projects/{pid}{endpoint}', json={'status': 'done'}, headers=headers).status_code == 409


def test_teacher_zero_reward_is_preserved(client, auth):
    res = client.post('/api/projects', json={'title': '无奖励', 'topic': '力学', 'ownerGroupId': 'g-1', 'rewardCoins': 0}, headers=auth('teacher', 'teacher123'))
    assert res.status_code == 200
    assert res.json()['rewardCoins'] == 0


@pytest.mark.parametrize('method,path,payload', [
    ('post','/api/groups/g-3/coins', {'delta': 50}),
    ('patch','/api/groups/g-3', {'name': '越权'}),
    ('delete','/api/groups/g-3', None),
    ('post','/api/users/u-5/coins', {'delta': 50}),
    ('put','/api/users/u-5/avatar', {'avatar': 'other'}),
    ('post','/api/groups', {'name': '越权', 'classId': 'class-2', 'initialCoins': 0}),
])
def test_scoped_teacher_cannot_write_foreign_resources(client, auth, db, method, path, payload):
    scoped_teacher(db)
    res = client.request(method, path, json=payload, headers=auth('teacher','teacher123'))
    assert res.status_code == 403
    assert db.get(Group, 'g-3').total_coins == 200
    assert db.get(User, 'u-5').personal_coins == 0


def test_scoped_teacher_reset_affects_only_own_class(client, auth, db):
    scoped_teacher(db)
    res = client.post('/api/groups/reset-coins', json={'targetCoins': 10}, headers=auth('teacher','teacher123'))
    assert res.status_code == 200
    assert res.json()['count'] == 2
    db.expire_all()
    assert db.get(Group,'g-3').total_coins == 200


def test_cross_class_transfer_is_rejected(client, auth, db):
    res = client.post('/api/coins/transfer', json={'sourceGroupId':'g-1','targetGroupId':'g-3','amount':10}, headers=auth('u-1'))
    assert res.status_code == 403
    assert db.query(CoinTransaction).count() == 0


def test_scoped_teacher_cannot_settle_foreign_project(client, auth, db):
    db.add(Project(id='foreign', title='外班', owner_group_id='g-3'))
    scoped_teacher(db)
    res = client.post('/api/projects/foreign/done', headers=auth('teacher','teacher123'))
    assert res.status_code == 403
    assert db.query(CoinTransaction).count() == 0


@pytest.mark.parametrize('method,path,payload', [
    ('patch','/api/classes/class-2', {'name':'越权'}),
    ('get','/api/classes/class-2/students', None),
    ('post','/api/classes/class-2/students/batch', {'students':[{'name':'测试占位'}]}),
    ('delete','/api/students/u-5', None),
    ('post','/api/students/u-5/password/reset', None),
    ('post','/api/safety/assignments', {'title':'越权','category':'mechanical','classId':'class-2'}),
    ('post','/api/safety/assignments', {'title':'越权','category':'mechanical','groupId':'g-3'}),
])
def test_scoped_teacher_roster_and_safety_boundaries(client, auth, db, method, path, payload):
    scoped_teacher(db)
    assert client.request(method,path,json=payload,headers=auth('teacher','teacher123')).status_code == 403
    assert db.get(User,'u-5') is not None


def test_foreign_safety_assignment_is_hidden_and_protected(client, auth, db):
    headers = auth('teacher','teacher123')
    res = client.post('/api/safety/assignments',json={'title':'外班指派','category':'mechanical','groupId':'g-3'},headers=headers)
    assert res.status_code == 201
    aid = res.json()['id']
    scoped_teacher(db)
    assert client.get('/api/safety/assignments',headers=headers).json() == []
    assert client.get(f'/api/safety/assignments/{aid}',headers=headers).status_code == 403
    assert client.delete(f'/api/safety/assignments/{aid}',headers=headers).status_code == 403


def test_foreign_recruitment_and_showcase_writes_are_protected(client, auth, db):
    headers = auth('teacher','teacher123')
    db.add(Project(id='foreign',title='外班',owner_group_id='g-3'))
    db.commit()
    item = client.post('/api/showcase', json={'title':'外班作品','groupId':'g-3','coverImage':''},headers=headers).json()
    scoped_teacher(db)
    assert client.post('/api/recruitments',json={'title':'越权','projectId':'foreign','reward':10,'description':'','deadline':'2099-01-01T00:00:00Z'},headers=headers).status_code == 403
    assert client.put(f"/api/showcase/{item['id']}",json={'title':'越权'},headers=headers).status_code == 403
    assert client.post(f"/api/showcase/{item['id']}/review",json={'action':'approve','coins':10},headers=headers).status_code == 403
    assert client.delete(f"/api/showcase/{item['id']}",headers=headers).status_code == 403


def test_cannot_delete_project_with_unsettled_escrow(client, auth):
    headers = auth('u-1'); pid = project(client,headers)
    res = client.post('/api/recruitments',json={'title':'任务','projectId':pid,'reward':10,'description':'','deadline':'2099-01-01T00:00:00Z'},headers=headers)
    assert res.status_code == 200
    assert client.delete(f'/api/projects/{pid}',headers=headers).status_code == 409
    rid = res.json()['id']
    assert client.put(f'/api/recruitments/{rid}/resolve',json={'result':'fail'},headers=headers).status_code == 200
    assert client.delete(f'/api/projects/{pid}',headers=headers).status_code == 200


def test_expired_challenge_cannot_be_created(client, auth):
    res = client.post('/api/challenges',json={'title':'过期挑战','topicId':'t-1','questionIds':['q-1'],'deadline':'2000-01-01T00:00:00Z'},headers=auth('u-1'))
    assert res.status_code == 400


def test_expired_legacy_challenge_cannot_settle(client, auth, db):
    from datetime import datetime
    from app.models import Challenge
    db.add(Challenge(id='expired',title='过期',creator_group_id='g-1',topic_id='t-1',question_ids=['q-1'],reward=1,deadline=datetime(2000,1,1),submissions=[]))
    db.commit()
    res = client.post('/api/challenges/expired/submit',json={'answers':{'q-1':2}},headers=auth('u-3'))
    assert res.status_code == 400
    assert db.query(CoinTransaction).count() == 0
