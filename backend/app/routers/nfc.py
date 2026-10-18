"""Read-only NFC terminal API. Device tokens are independent of account JWTs."""
import hashlib
import hmac
import re
import secrets
import threading
import time
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..access import require_class_access
from ..config import settings
from ..database import get_db
from ..deps import require_teacher, visible_class_id
from ..models import Class, Group, NfcAdminAudit, NfcCard, NfcDevice, User
from ..schemas import CamelModel

router = APIRouter(prefix="/api/nfc", tags=["nfc"])


class DeviceCreate(CamelModel):
    name: str = Field(min_length=1, max_length=64)
    allowed_class_ids: list[str] = Field(min_length=1, max_length=100)


class DeviceUpdate(CamelModel):
    enabled: bool


class CardBind(CamelModel):
    card_uid: str = Field(max_length=20)
    user_id: str = Field(min_length=1, max_length=128)


class CardRevoke(CamelModel):
    user_id: str = Field(min_length=1, max_length=128)


def uid_key(uid: str) -> tuple[str, str]:
    if len(settings.nfc_uid_secret.encode()) < 32:
        raise HTTPException(503, "请配置持久的 NFC_UID_SECRET（至少 32 字节）")
    uid = uid.upper()
    if not re.fullmatch(r"(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})", uid):
        raise HTTPException(400, "INVALID_CARD_FORMAT")
    key = hmac.new(settings.nfc_uid_secret.encode(), bytes.fromhex(uid), hashlib.sha256).hexdigest()
    return key, "*" * (len(uid) - 4) + uid[-4:]


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def audit(db: Session, actor: User, action: str, target: str) -> None:
    db.add(NfcAdminAudit(id=uuid4().hex, actor_id=actor.id, action=action, target_id=target))


def device_out(device: NfcDevice) -> dict:
    return {"id": device.id, "name": device.name, "enabled": device.enabled,
            "allowedClassIds": device.allowed_class_ids}


def device_in_scope(actor: User, device: NfcDevice) -> bool:
    """绑定班级的教师只能管理允许班级完全属于本班的设备。"""
    scope = visible_class_id(actor)
    return scope is None or set(device.allowed_class_ids) <= {scope}


@router.post("/devices", status_code=201)
def create_device(payload: DeviceCreate, response: Response, db: Session = Depends(get_db),
                  actor: User = Depends(require_teacher)):
    if any(db.get(Class, cid) is None for cid in payload.allowed_class_ids):
        raise HTTPException(400, "班级不存在")
    scope = visible_class_id(actor)
    if scope and any(cid != scope for cid in payload.allowed_class_ids):
        raise HTTPException(403, "只能为本班配置设备")
    token = "nfc_" + secrets.token_urlsafe(32)
    device = NfcDevice(id=uuid4().hex, name=payload.name, token_hash=token_hash(token),
                       allowed_class_ids=list(dict.fromkeys(payload.allowed_class_ids)))
    db.add(device)
    audit(db, actor, "device.create", device.id)
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    return {**device_out(device), "deviceToken": token}


@router.get("/devices")
def list_devices(db: Session = Depends(get_db), actor: User = Depends(require_teacher)):
    return [device_out(d) for d in db.scalars(select(NfcDevice)).all() if device_in_scope(actor, d)]


@router.patch("/devices/{device_id}")
def change_device(device_id: str, payload: DeviceUpdate, db: Session = Depends(get_db),
                  actor: User = Depends(require_teacher)):
    device = db.get(NfcDevice, device_id)
    if not device:
        raise HTTPException(404, "设备不存在")
    if not device_in_scope(actor, device):
        raise HTTPException(403, "只能管理本班设备")
    device.enabled = payload.enabled
    audit(db, actor, "device.enable" if payload.enabled else "device.disable", device.id)
    db.commit()
    return device_out(device)


@router.post("/devices/{device_id}/rotate-token")
def rotate_token(device_id: str, response: Response, db: Session = Depends(get_db),
                 actor: User = Depends(require_teacher)):
    device = db.get(NfcDevice, device_id)
    if not device:
        raise HTTPException(404, "设备不存在")
    if not device_in_scope(actor, device):
        raise HTTPException(403, "只能管理本班设备")
    token = "nfc_" + secrets.token_urlsafe(32)
    device.token_hash = token_hash(token)
    audit(db, actor, "device.rotate", device.id)
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    return {**device_out(device), "deviceToken": token}


def student(db: Session, actor: User, user_id: str) -> User:
    user = db.get(User, user_id)
    if not user or user.account_role != "student" or not user.class_id:
        raise HTTPException(404, "学生不存在或未分班")
    require_class_access(actor, user.class_id)
    return user


@router.post("/cards/bind")
def bind_card(payload: CardBind, db: Session = Depends(get_db), actor: User = Depends(require_teacher)):
    user = student(db, actor, payload.user_id)
    key, mask = uid_key(payload.card_uid)
    card = db.get(NfcCard, key)
    if card and card.user_id != user.id:
        raise HTTPException(409, "卡片已有归属，不能自动转移")
    # Revoke old card and bind new card in one transaction. Unique active_user_id
    # also rejects concurrent attempts to bind two different cards to one student.
    db.execute(update(NfcCard).where(NfcCard.active_user_id == user.id).values(
        active_user_id=None, revoked_at=datetime.now(timezone.utc)))
    if card is None:
        card = NfcCard(uid_key=key, uid_mask=mask, user_id=user.id)
        db.add(card)
    card.active_user_id = user.id
    card.revoked_at = None
    from ..nfc_inventory import remember_uid
    remember_uid(db, key, payload.card_uid)
    audit(db, actor, "card.bind", user.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "绑定冲突，请刷新后重试")
    return {"userId": user.id, "uidMask": mask, "enabled": True}


@router.post("/cards/revoke")
def revoke_card(payload: CardRevoke, db: Session = Depends(get_db), actor: User = Depends(require_teacher)):
    user = student(db, actor, payload.user_id)
    db.execute(update(NfcCard).where(NfcCard.active_user_id == user.id).values(
        active_user_id=None, revoked_at=datetime.now(timezone.utc)))
    audit(db, actor, "card.revoke", user.id)
    db.commit()
    return {"ok": True}


@router.get("/cards")
def list_cards(response: Response, db: Session = Depends(get_db), actor: User = Depends(require_teacher)):
    stmt = select(NfcCard, User).join(User, NfcCard.user_id == User.id)
    if actor.account_role != "admin" and actor.class_id:
        stmt = stmt.where(User.class_id == actor.class_id)
    response.headers["Cache-Control"] = "no-store"
    return [{"userId": u.id, "uidMask": c.uid_mask, "enabled": c.active_user_id is not None}
            for c, u in db.execute(stmt).all()]


# Single-process token bucket. Put shared/proxy rate limiting in front of multiple workers.
_buckets: dict[str, tuple[float, float]] = {}
_bucket_lock = threading.Lock()


def allow_tap(device_id: str) -> bool:
    now = time.monotonic()
    with _bucket_lock:
        credit, seen = _buckets.get(device_id, (4.0, now))
        credit = min(4.0, credit + (now - seen) * 2)
        allowed = credit >= 1
        _buckets[device_id] = (credit - 1 if allowed else credit, now)
        return allowed


def failure(request_id: str, status: int, code: str) -> JSONResponse:
    headers = {"Cache-Control": "no-store"}
    if status == 429:
        headers["Retry-After"] = "1"
    return JSONResponse(status_code=status, headers=headers,
                        content={"requestId": request_id, "error": {"code": code}})


@router.post("/tap")
async def tap(request: Request, db: Session = Depends(get_db)):
    request_id = uuid4().hex
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    device = db.scalar(select(NfcDevice).where(NfcDevice.token_hash == token_hash(token))) if token else None
    if device is None:
        return failure(request_id, 401, "DEVICE_UNAUTHENTICATED")
    if not device.enabled:
        return failure(request_id, 403, "DEVICE_DISABLED")
    if not allow_tap(device.id):
        return failure(request_id, 429, "RATE_LIMITED")
    # Avoid putting UID in URL/access logs, bound JSON before parsing.
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 512:
            return failure(request_id, 400, "INVALID_REQUEST")
    import json
    try:
        payload = json.loads(body)
        if not isinstance(payload, dict) or set(payload) != {"cardUid", "requestId"}:
            raise ValueError()
        rid, uid = payload["requestId"], payload["cardUid"]
        if not isinstance(rid, str) or not re.fullmatch(r"[A-Za-z0-9-]{1,64}", rid) or not isinstance(uid, str):
            raise ValueError()
        request_id = rid
        key, _ = uid_key(uid)
    except HTTPException as exc:
        return failure(request_id, exc.status_code, "SERVICE_UNAVAILABLE" if exc.status_code == 503 else "INVALID_CARD_FORMAT")
    except (ValueError, TypeError):
        return failure(request_id, 400, "INVALID_REQUEST")
    # One SQL snapshot for both balances; check student's class, not only group.
    row = db.execute(select(User, Group).join(NfcCard, NfcCard.active_user_id == User.id)
                     .outerjoin(Group, User.group_id == Group.id).where(NfcCard.uid_key == key)).first()
    if row is None:
        return failure(request_id, 404, "CARD_UNAVAILABLE")
    user, group = row
    if user.account_role != "student" or not user.class_id or user.class_id not in device.allowed_class_ids:
        return failure(request_id, 404, "CARD_UNAVAILABLE")
    if user.group_id and (group is None or group.class_id != user.class_id):
        return failure(request_id, 409, "ACCOUNT_INCONSISTENT")
    return JSONResponse(headers={"Cache-Control": "no-store"}, content={
        "requestId": request_id, "studentName": user.name, "groupName": group.name if group else None,
        "personalCoins": user.personal_coins, "groupCoins": group.total_coins if group else None,
        "queriedAt": datetime.now(timezone.utc).isoformat(),
    })
