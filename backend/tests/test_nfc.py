import pytest
from app.config import settings
from app.models import CoinTransaction, NfcCard, NfcDevice, User
from app.routers import nfc


@pytest.fixture(autouse=True)
def nfc_config(monkeypatch):
    monkeypatch.setattr(settings, 'nfc_uid_secret', 'test-only-index-key-not-for-production-0001')
    nfc._buckets.clear()


def setup_device(client, auth, db):
    db.get(User, 'teacher').account_role = 'admin'
    db.commit()
    admin = auth('teacher', 'teacher123')
    r = client.post('/api/nfc/devices', headers=admin,
                    json={'name':'test-terminal', 'allowedClassIds':['class-1']})
    assert r.status_code == 201, r.text
    return admin, r.json(), {'Authorization':'Bearer ' + r.json()['deviceToken']}


def bind(client, admin, uid='00112233', user='u-1'):
    return client.post('/api/nfc/cards/bind', headers=admin, json={'cardUid':uid, 'userId':user})


def query(client, headers, uid='00112233', **extra):
    return client.post('/api/nfc/tap', headers=headers, json={'cardUid':uid, 'requestId':'test-1', **extra})


def test_live_balances_no_writes_and_secret_storage(client, auth, db):
    admin, device, headers = setup_device(client, auth, db)
    assert bind(client, admin).status_code == 200
    db.get(User, 'u-1').personal_coins = -3
    db.commit()
    r = query(client, headers)
    assert r.status_code == 200, r.text
    assert r.headers['cache-control'] == 'no-store'
    assert (r.json()['personalCoins'], r.json()['groupCoins']) == (-3, 500)
    assert r.json()['requestId'] == 'test-1'
    db.get(User, 'u-1').personal_coins = 12
    db.commit()
    assert query(client, headers).json()['personalCoins'] == 12
    assert db.query(CoinTransaction).count() == 0
    card = db.query(NfcCard).one()
    assert card.uid_key != '00112233' and '00112233' not in card.uid_mask
    assert db.get(NfcDevice, device['id']).token_hash != device['deviceToken']
    assert 'token' not in client.get('/api/nfc/devices', headers=admin).text.lower()


def test_no_group_and_class_integrity(client, auth, db):
    admin, _, headers = setup_device(client, auth, db)
    assert bind(client, admin, user='u-4').status_code == 200
    assert query(client, headers).json()['groupCoins'] is None
    db.get(User, 'u-4').group_id = 'g-3'
    db.commit()
    assert query(client, headers).status_code == 409


def test_revoke_replace_conflict(client, auth, db):
    admin, _, headers = setup_device(client, auth, db)
    assert bind(client, admin).status_code == 200
    assert bind(client, admin, user='u-2').status_code == 409
    assert bind(client, admin, uid='04112233445566').status_code == 200
    assert query(client, headers).status_code == 404
    assert query(client, headers, '04112233445566').status_code == 200
    assert client.post('/api/nfc/cards/revoke', headers=admin, json={'userId':'u-1'}).status_code == 200
    assert query(client, headers, '04112233445566').status_code == 404


def test_credentials_rotation_disable(client, auth, db):
    admin, device, headers = setup_device(client, auth, db)
    assert query(client, {}).status_code == 401
    assert query(client, admin).status_code == 401
    assert client.get('/api/users', headers=headers).status_code == 401
    path = '/api/nfc/devices/' + device['id']
    assert client.patch(path, headers=admin, json={'enabled':False}).status_code == 200
    assert query(client, headers).status_code == 403
    rotated = client.post(path + '/rotate-token', headers=admin).json()
    assert query(client, headers).status_code == 401
    client.patch(path, headers=admin, json={'enabled':True})
    assert query(client, {'Authorization':'Bearer ' + rotated['deviceToken']}).status_code == 404


def test_scope_teacher_and_student_permissions(client, auth, db):
    admin, _, headers = setup_device(client, auth, db)
    assert bind(client, admin, user='u-5').status_code == 200
    assert query(client, headers).status_code == 404
    teacher = db.get(User, 'teacher')
    teacher.account_role, teacher.class_id = 'teacher', 'class-1'
    db.commit()
    assert bind(client, admin, user='u-5').status_code == 403
    assert client.get('/api/nfc/cards', headers=admin).json() == []
    assert client.post('/api/nfc/devices', headers=admin,
                       json={'name':'x','allowedClassIds':['class-2']}).status_code == 403
    assert client.post('/api/nfc/devices', headers=admin,
                       json={'name':'own','allowedClassIds':['class-1']}).status_code == 201
    assert bind(client, auth('u-1')).status_code == 403


@pytest.mark.parametrize('uid', ['123', 'GG112233', '001122334455', 'a'*22])
def test_invalid_uid(client, auth, db, uid):
    admin, _, headers = setup_device(client, auth, db)
    assert bind(client, admin, uid=uid).status_code in (400, 422)
    assert query(client, headers, uid).status_code == 400


def test_request_limit_and_config(client, auth, db, monkeypatch):
    _, _, headers = setup_device(client, auth, db)
    assert client.post('/api/nfc/tap', headers=headers, content='x'*513).status_code == 400
    assert query(client, headers, userId='u-2').status_code == 400
    monkeypatch.setattr(settings, 'nfc_uid_secret', '')
    assert query(client, headers).status_code == 503
    monkeypatch.setattr(settings, 'nfc_uid_secret', 'x'*32)
    nfc._buckets.clear()
    for _ in range(4):
        assert query(client, headers).status_code == 404
    r = query(client, headers)
    assert r.status_code == 429 and r.headers['retry-after'] == '1'


def test_additive_schema_upgrade_preserves_existing_balances(tmp_path, monkeypatch):
    from sqlalchemy import create_engine, inspect
    from sqlalchemy.orm import Session
    from app import database
    from app.models import Class, Group
    engine = create_engine(f'sqlite:///{tmp_path / "legacy.db"}')
    database.Base.metadata.create_all(engine, tables=[Class.__table__, Group.__table__, User.__table__])
    with Session(engine) as session:
        session.add(User(id='legacy-test', username='legacy-test', name='DEMO', password_hash='unused', personal_coins=73))
        session.commit()
    monkeypatch.setattr(database, 'engine', engine)
    database.init_db()
    with Session(engine) as session:
        assert session.get(User, 'legacy-test').personal_coins == 73
    assert {'nfc_devices','nfc_cards','nfc_admin_audit'}.issubset(inspect(engine).get_table_names())
    engine.dispose()
