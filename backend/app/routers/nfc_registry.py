"""Administrator card inventory, atomic updates and Excel round trips."""
import hashlib
import json
import secrets
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import Field
from sqlalchemy import text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from ..access import require_class_access
from ..database import get_db
from ..deps import require_teacher, visible_class_id
from ..models import Class, Group, User, NfcCard, NfcInventory
from ..nfc_inventory import remember_uid, reveal_uid
from ..schemas import CamelModel
from .nfc import uid_key, audit

router = APIRouter(prefix='/api/nfc/registry', tags=['nfc-admin'])


class BindingRow(CamelModel):
    card_uid: str = Field(min_length=8, max_length=20)
    user_id: str | None = None


class Batch(CamelModel):
    rows: list[BindingRow] = Field(min_length=1, max_length=500)
    expected_version: str | None = None
    dry_run: bool = True
    allow_transfer: bool = False


class RandomPlan(CamelModel):
    class_id: str


def version(db):
    cards = [(c.uid_key, c.user_id, c.active_user_id, str(c.revoked_at))
             for c in db.query(NfcCard).order_by(NfcCard.uid_key)]
    inventory = [i.uid_key for i in db.query(NfcInventory).order_by(NfcInventory.uid_key)]
    students = [(u.id, u.username, u.name, u.class_id, u.group_id, u.account_role)
                for u in db.query(User).order_by(User.id)]
    return hashlib.sha256(json.dumps([cards, inventory, students], ensure_ascii=False).encode()).hexdigest()


def registry_data(db, scope: str | None = None):
    users_q = db.query(User).filter(User.account_role == 'student')
    if scope:
        users_q = users_q.filter(User.class_id == scope)
    users = {u.id: u for u in users_q}
    classes_q = db.query(Class)
    if scope:
        classes_q = classes_q.filter(Class.id == scope)
    classes = {c.id: c.name for c in classes_q}
    groups = {g.id: g.name for g in db.query(Group)}
    bindings = {c.uid_key: c for c in db.query(NfcCard)}
    rows = []
    for item in db.query(NfcInventory).order_by(NfcInventory.created_at, NfcInventory.uid_key):
        card = bindings.get(item.uid_key)
        user = users.get(card.active_user_id) if card else None
        # 班级作用域下，其他班已绑定的卡片不出现在本班登记表里。
        if scope and card and card.active_user_id and user is None:
            continue
        rows.append({'cardUid': reveal_uid(item), 'userId': user.id if user else None,
                     'username': user.username if user else '', 'studentName': user.name if user else '',
                     'classId': user.class_id if user else None,
                     'className': classes.get(user.class_id, '') if user else '',
                     'groupName': groups.get(user.group_id, '') if user else '',
                     'status': '已绑定' if user else ('已挂失' if card and card.revoked_at else '备用卡')})
    return {'version': version(db), 'cards': rows,
            'students': [{'id': u.id, 'username': u.username, 'name': u.name,
                          'classId': u.class_id, 'className': classes.get(u.class_id, ''),
                          'groupName': groups.get(u.group_id, '')} for u in users.values()],
            'classes': [{'id': cid, 'name': name} for cid, name in classes.items()]}


@router.get('')
def registry(response: Response, db: Session = Depends(get_db), actor: User = Depends(require_teacher)):
    response.headers['Cache-Control'] = 'no-store'
    return registry_data(db, visible_class_id(actor))


def apply_batch(payload, db, actor):
    # Serialize writers before checking the preview version, including concurrent imports.
    if not payload.dry_run and db.bind.dialect.name == 'sqlite':
        db.execute(text('BEGIN IMMEDIATE'))
    current_version = version(db)
    if payload.expected_version and payload.expected_version != current_version:
        raise HTTPException(409, '登记数据已变化，请重新导出或重新预览')
    if not payload.dry_run and not payload.expected_version:
        raise HTTPException(400, '请先预览再提交更新')
    keys, users, parsed, errors = set(), set(), [], []
    scope = visible_class_id(actor)
    for index, row in enumerate(payload.rows, 2):
        try:
            key, mask = uid_key(row.card_uid)
            if key in keys:
                raise HTTPException(400, '重复卡片 UID')
            keys.add(key)
            user = db.get(User, row.user_id) if row.user_id else None
            if row.user_id:
                if not user or user.account_role != 'student' or not user.class_id:
                    raise HTTPException(400, '学生不存在或未分班')
                if scope and user.class_id != scope:
                    raise HTTPException(403, '只能绑定本班学生')
                if row.user_id in users:
                    raise HTTPException(400, '同一学生不能绑定多张卡')
                users.add(row.user_id)
            card = db.get(NfcCard, key)
            current = db.get(User, card.active_user_id) if card and card.active_user_id else None
            if scope and current and current.class_id != scope:
                raise HTTPException(403, '只能解绑本班学生的卡片')
            if card and row.user_id and card.user_id != row.user_id and not payload.allow_transfer:
                raise HTTPException(409, '卡片已有归属；调整前请勾选允许换绑')
            parsed.append((row, key, mask, card, user))
        except HTTPException as exc:
            if exc.status_code == 503:
                raise
            errors.append({'row': index, 'message': exc.detail})
    if errors:
        raise HTTPException(400, {'message': '整批未写入，请修正错误', 'errors': errors})
    changes = [{'cardUid': r.card_uid.upper(), 'userId': r.user_id,
                'studentName': u.name if u else '', 'username': u.username if u else '',
                'previousUserId': c.active_user_id if c else None} for r, k, m, c, u in parsed]
    if payload.dry_run:
        return {'version': current_version, 'changes': changes, 'applied': False}
    now = datetime.now(timezone.utc)
    # Clear every affected active assignment first so swaps satisfy the unique constraint.
    affected_keys = [k for r, k, m, c, u in parsed]
    db.execute(update(NfcCard).where((NfcCard.uid_key.in_(affected_keys)) |
                                   (NfcCard.active_user_id.in_(list(users)))).values(
                                       active_user_id=None, revoked_at=now))
    db.flush()
    for row, key, mask, card, user in parsed:
        remember_uid(db, key, row.card_uid)
        if row.user_id:
            if card is None:
                card = NfcCard(uid_key=key, uid_mask=mask, user_id=row.user_id)
                db.add(card)
            card.user_id = row.user_id
            card.active_user_id, card.revoked_at = row.user_id, None
        audit(db, actor, 'card.batch.bind' if row.user_id else 'card.batch.unbind', key)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, '并发绑定冲突，请重新预览')
    return {'version': version(db), 'changes': changes, 'applied': True}


@router.post('/batch')
def batch(payload: Batch, response: Response, db: Session = Depends(get_db), actor: User = Depends(require_teacher)):
    response.headers['Cache-Control'] = 'no-store'
    return apply_batch(payload, db, actor)


@router.post('/random')
def random_plan(payload: RandomPlan, response: Response, db: Session = Depends(get_db), actor: User = Depends(require_teacher)):
    response.headers['Cache-Control'] = 'no-store'
    if db.get(Class, payload.class_id) is None:
        raise HTTPException(404, '班级不存在')
    require_class_access(actor, payload.class_id)
    busy = {c.active_user_id for c in db.query(NfcCard) if c.active_user_id}
    active_keys = {c.uid_key for c in db.query(NfcCard) if c.active_user_id}
    # Previously owned/revoked cards stay reserved until explicitly reassigned.
    owned_keys = {c.uid_key for c in db.query(NfcCard)}
    students = [u for u in db.query(User).filter(User.account_role == 'student', User.class_id == payload.class_id)
                if u.id not in busy]
    available = [i for i in db.query(NfcInventory) if i.uid_key not in owned_keys | active_keys]
    rng = secrets.SystemRandom()
    rng.shuffle(students)
    rng.shuffle(available)
    rows = [BindingRow(card_uid=reveal_uid(i), user_id=u.id) for i, u in zip(available, students)]
    if not rows:
        raise HTTPException(400, '没有可分配的备用卡或待领卡学生')
    preview = apply_batch(Batch(rows=rows), db, actor)
    return {**preview, 'rows': [r.model_dump(by_alias=True) for r in rows],
            'waitingStudents': max(0, len(students) - len(rows))}


@router.get('/export')
def export(class_id: str | None = None, db: Session = Depends(get_db), actor: User = Depends(require_teacher)):
    from ..nfc_xlsx import export_xlsx
    scope = visible_class_id(actor)
    if class_id and scope and class_id != scope:
        raise HTTPException(403, '只能导出本班卡片')
    target_class = class_id or scope
    data = registry_data(db, scope)
    if target_class:
        data['cards'] = [r for r in data['cards'] if r['classId'] in (None, target_class)]
        data['students'] = [r for r in data['students'] if r['classId'] == target_class]
    return Response(export_xlsx(data), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    headers={'Content-Disposition': 'attachment; filename="nfc-cards.xlsx"', 'Cache-Control': 'no-store'})


@router.post('/import')
async def import_xlsx(request: Request, dry_run: bool = True, allow_transfer: bool = False,
                      expected_version: str | None = None, db: Session = Depends(get_db),
                      actor: User = Depends(require_teacher)):
    from ..nfc_xlsx import read_xlsx
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 2 * 1024 * 1024:
            raise HTTPException(413, '文件不能超过 2MB')
    entries, file_version = read_xlsx(bytes(body))
    scope = visible_class_id(actor)
    users_q = db.query(User).filter(User.account_role == 'student')
    if scope:
        users_q = users_q.filter(User.class_id == scope)
    usernames = {u.username: u.id for u in users_q}
    rows, errors = [], []
    for index, (uid, username) in enumerate(entries, 2):
        if username and username not in usernames:
            errors.append({'row': index, 'message': '学生账号不存在或不属于本班'})
        rows.append(BindingRow(card_uid=uid, user_id=usernames.get(username) if username else None))
    if errors:
        raise HTTPException(400, {'message': '整批未写入，请修正学生账号', 'errors': errors})
    if file_version and file_version != version(db):
        raise HTTPException(409, 'Excel 已过期，请重新导出后修改')
    return apply_batch(Batch(rows=rows, expected_version=expected_version or file_version,
                             dry_run=dry_run, allow_transfer=allow_transfer), db, actor)
