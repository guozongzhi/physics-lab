from io import BytesIO
from zipfile import ZipFile, ZIP_DEFLATED
import pytest
from app.config import settings
from app.models import User, NfcInventory, NfcCard, CoinTransaction, NfcAdminAudit
from app.nfc_xlsx import read_xlsx


@pytest.fixture(autouse=True)
def nfc_secret(monkeypatch):
    monkeypatch.setattr(settings, 'nfc_uid_secret', 'registry-test-secret-at-least-32-bytes')


def admin(auth, db):
    db.get(User, 'teacher').account_role = 'admin'
    db.commit()
    return auth('teacher', 'teacher123')


def preview(client, headers, rows, **extra):
    return client.post('/api/nfc/registry/batch', headers=headers, json={'rows': rows, **extra})


def save(client, headers, rows, **extra):
    p = preview(client, headers, rows, **extra)
    assert p.status_code == 200, p.text
    return preview(client, headers, rows, expectedVersion=p.json()['version'], dryRun=False, **extra)


def row(uid='00112233', user=None):
    return {'cardUid': uid, 'userId': user}


def test_preview_storage_and_live_query(client, auth, db):
    h = admin(auth, db)
    p = preview(client, h, [row(user='u-1'), row('00000001')])
    assert p.status_code == 200 and db.query(NfcInventory).count() == 0
    assert save(client, h, [row(user='u-1'), row('00000001')]).status_code == 200
    assert db.query(NfcInventory).count() == 2
    assert all('00112233' not in i.uid_ciphertext for i in db.query(NfcInventory))
    data = client.get('/api/nfc/registry', headers=h).json()
    assert {r['cardUid'] for r in data['cards']} == {'00112233', '00000001'}
    d = client.post('/api/nfc/devices', headers=h, json={'name':'test', 'allowedClassIds':['class-1']}).json()
    r = client.post('/api/nfc/tap', headers={'Authorization':'Bearer '+d['deviceToken']}, json={'cardUid':'00112233','requestId':'query'})
    assert r.status_code == 200 and r.json()['groupCoins'] == 500
    assert db.query(CoinTransaction).count() == 0


@pytest.mark.parametrize('rows', [
    [row(), row()], [row(user='u-1'), row('00000001','u-1')],
    [row(user='missing')], [row('INVALID!')],
])
def test_invalid_batch_is_atomic(client, auth, db, rows):
    h = admin(auth, db)
    r = preview(client, h, rows)
    assert r.status_code == 400
    assert db.query(NfcInventory).count() == db.query(NfcCard).count() == db.query(NfcAdminAudit).count() == 0


def test_stale_and_missing_preview_version(client, auth, db):
    h = admin(auth, db)
    rows = [row(user='u-1')]
    v = preview(client,h,rows).json()['version']
    assert save(client,h,[row('00000001')]).status_code == 200
    assert preview(client,h,rows,expectedVersion=v,dryRun=False).status_code == 409
    assert preview(client,h,rows,dryRun=False).status_code == 400
    assert db.query(NfcCard).count() == 0


def test_transfer_requires_opt_in_and_swaps_atomically(client, auth, db):
    h = admin(auth, db)
    assert save(client,h,[row(user='u-1'), row('00000001','u-2')]).status_code == 200
    swaps=[row(user='u-2'),row('00000001','u-1')]
    assert preview(client,h,swaps).status_code == 400
    assert save(client,h,swaps,allowTransfer=True).status_code == 200
    cards=client.get('/api/nfc/registry',headers=h).json()['cards']
    assert {c['cardUid']:c['userId'] for c in cards}=={'00112233':'u-2','00000001':'u-1'}
    assert save(client,h,[row()]).status_code == 200
    assert sum(c.active_user_id is not None for c in db.query(NfcCard)) == 1


def test_random_only_unassigned_and_no_mutation_until_apply(client, auth, db):
    h=admin(auth,db)
    save(client,h,[row(),row('00000001'),row('00000002')])
    p=client.post('/api/nfc/registry/random',headers=h,json={'classId':'class-1'})
    assert p.status_code==200,p.text
    plan=p.json()
    assert len(plan['rows'])==3 and plan['waitingStudents']==1
    assert db.query(NfcCard).count()==0
    r=preview(client,h,plan['rows'],expectedVersion=plan['version'],dryRun=False)
    assert r.status_code==200,r.text
    assert db.query(NfcCard).count()==3
    assert client.post('/api/nfc/registry/random',headers=h,json={'classId':'class-1'}).status_code==400


def test_excel_roundtrip_updates_and_preserves_zero_uid(client, auth, db):
    h=admin(auth,db)
    save(client,h,[row('00000001','u-1'),row('00000002')])
    r=client.get('/api/nfc/registry/export?class_id=class-1',headers=h)
    assert r.status_code==200 and r.headers['cache-control']=='no-store'
    entries,v=read_xlsx(r.content)
    assert ('00000001','u-1') in entries and ('00000002','') in entries
    with ZipFile(BytesIO(r.content)) as z:
        files={i.filename:z.read(i.filename) for i in z.infolist()}
    files['xl/worksheets/sheet1.xml']=files['xl/worksheets/sheet1.xml'].replace(b'u-1',b'u-2')
    out=BytesIO()
    with ZipFile(out,'w',ZIP_DEFLATED) as z:
        for name,body in files.items(): z.writestr(name,body)
    p=client.post('/api/nfc/registry/import?allow_transfer=true',headers=h,content=out.getvalue())
    assert p.status_code==200,p.text
    assert any(c['userId']=='u-2' for c in p.json()['changes'])
    r=client.post('/api/nfc/registry/import?dry_run=false&allow_transfer=true&expected_version='+v,headers=h,content=out.getvalue())
    assert r.status_code==200,r.text
    assert any(c.active_user_id=='u-2' for c in db.query(NfcCard))
    assert client.post('/api/nfc/registry/import',headers=h,content=out.getvalue()).status_code==409


def test_excel_invalid_formula_and_bad_zip(client, auth, db):
    h=admin(auth,db)
    assert client.post('/api/nfc/registry/import',headers=h,content=b'not xlsx').status_code==400
    save(client,h,[row()])
    data=client.get('/api/nfc/registry/export',headers=h).content
    with ZipFile(BytesIO(data)) as z: files={i.filename:z.read(i.filename) for i in z.infolist()}
    files['xl/worksheets/sheet1.xml']=files['xl/worksheets/sheet1.xml'].replace(b'<is>',b'<f>1+1</f><is>',1)
    out=BytesIO()
    with ZipFile(out,'w',ZIP_DEFLATED) as z:
        for n,b in files.items(): z.writestr(n,b)
    assert client.post('/api/nfc/registry/import',headers=h,content=out.getvalue()).status_code==400


def test_students_cannot_use_registry(client, auth):
    h = auth('u-1')
    assert client.get('/api/nfc/registry', headers=h).status_code == 403
    assert preview(client, h, [row()]).status_code == 403
    assert client.get('/api/nfc/registry/export', headers=h).status_code == 403
