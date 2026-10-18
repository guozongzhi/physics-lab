from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, update
from sqlalchemy.orm import Session

from .. import services
from ..access import require_class_access
from ..database import get_db
from ..deps import get_current_user, require_teacher, visible_class_id, window_guard
from ..models import ClassMeta, CoinTransaction, CoinTransferRequest, Group, User
from ..schemas import (
    ActivityWindowUpdate,
    ClassMetaOut,
    ClassMetaUpdate,
    CoinDelta,
    CoinTransfer,
    CoinTransferReview,
    GroupRankRow,
    PersonalRankRow,
    RankingsOut,
)

router = APIRouter(prefix="/api", tags=["coins"])


@router.get("/coin-transactions")
def list_transactions(
    group_id: str | None = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    q = db.query(CoinTransaction)
    scoped = visible_class_id(current)
    if current.account_role == "student" and not scoped:
        return []
    if scoped:
        q = q.join(Group, CoinTransaction.group_id == Group.id).filter(Group.class_id == scoped)
    if group_id:
        q = q.filter(CoinTransaction.group_id == group_id)
    txs = q.order_by(CoinTransaction.created_at.desc()).all()
    return [
        {
            "id": t.id,
            "groupId": t.group_id,
            "userId": t.user_id,
            "source": t.source,
            "refId": t.ref_id,
            "delta": t.delta,
            "balanceAfter": t.balance_after,
            "createdAt": t.created_at.isoformat(),
            "note": t.note,
        }
        for t in txs
    ]


@router.get("/rankings", response_model=RankingsOut)
def rankings(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    groups_q = db.query(Group)
    users_q = db.query(User).filter(User.account_role == "student")
    scoped = visible_class_id(current)
    if current.account_role == "student" and not scoped:
        groups, users = [], []
    else:
        if scoped:
            groups_q = groups_q.filter(Group.class_id == scoped)
            users_q = users_q.filter(User.class_id == scoped)
        groups, users = groups_q.all(), users_q.all()

    group_ranking = [
        GroupRankRow(group_id=g.id, name=g.name, total_coins=g.total_coins, rank=idx + 1)
        for idx, g in enumerate(sorted(groups, key=lambda x: x.total_coins, reverse=True))
    ]
    personal_ranking = [
        PersonalRankRow(
            user_id=u.id,
            name=u.name,
            personal_coins=u.personal_coins,
            group_id=u.group_id or "",
            rank=idx + 1,
        )
        for idx, u in enumerate(sorted(users, key=lambda x: x.personal_coins, reverse=True))
    ]
    return RankingsOut(group_ranking=group_ranking, personal_ranking=personal_ranking)


@router.post("/groups/{group_id}/coins")
def teacher_adjust_coins(
    group_id: str,
    payload: CoinDelta,
    db: Session = Depends(get_db),
    current: User = Depends(require_teacher),
):
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="小组不存在")
    require_class_access(current, group.class_id)
    tx = services.add_tx(
        db,
        group_id,
        source="teacher_set" if payload.delta >= 0 else "penalty",
        ref_id="teacher_adjust",
        delta=payload.delta,
        # 理由写进流水，学生端可见；没给理由时回退到中性描述
        note=(payload.note or "").strip()
        or ("教师调整能量币" if payload.delta >= 0 else "教师扣除能量币"),
    )
    db.commit()
    return {"balanceAfter": tx.balance_after}


def transfer_out(request: CoinTransferRequest) -> dict:
    return {
        "id": request.id,
        "sourceGroupId": request.source_group_id,
        "targetGroupId": request.target_group_id,
        "requestedBy": request.requested_by,
        "amount": request.amount,
        "note": request.note,
        "status": request.status,
        "createdAt": request.created_at.replace(tzinfo=timezone.utc),
        "reviewedBy": request.reviewed_by,
        "reviewedAt": request.reviewed_at.replace(tzinfo=timezone.utc) if request.reviewed_at else None,
        "reviewNote": request.review_note,
    }


@router.get("/coins/transfers")
def list_transfers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(CoinTransferRequest)
    scoped = visible_class_id(user)
    if user.account_role == "student":
        if not scoped or not user.group_id:
            return []
        q = q.filter(or_(CoinTransferRequest.source_group_id == user.group_id,
                         CoinTransferRequest.target_group_id == user.group_id))
    if scoped:
        group_ids = db.query(Group.id).filter(Group.class_id == scoped)
        q = q.filter(CoinTransferRequest.source_group_id.in_(group_ids),
                     CoinTransferRequest.target_group_id.in_(group_ids))
    return [transfer_out(t) for t in q.order_by(CoinTransferRequest.created_at.desc()).all()]


@router.post("/coins/transfer")
def transfer_coins(
    payload: CoinTransfer,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _window: None = Depends(window_guard("transfer")),
):
    if user.account_role != "student" or user.member_role != "leader":
        raise HTTPException(status_code=403, detail="只有组长可以发起转账申请")
    if user.group_id != payload.source_group_id:
        raise HTTPException(status_code=403, detail="只能从自己所在小组转出")
    if payload.source_group_id == payload.target_group_id:
        raise HTTPException(status_code=400, detail="不能转账给自己小组")
    src = db.get(Group, payload.source_group_id)
    tgt = db.get(Group, payload.target_group_id)
    if not src or not tgt:
        raise HTTPException(status_code=404, detail="小组不存在")
    require_class_access(user, src.class_id)
    require_class_access(user, tgt.class_id)
    if src.total_coins < payload.amount:
        raise HTTPException(status_code=400, detail="小组能量币不足")
    request = CoinTransferRequest(
        id=services.gen_id("tr_"), source_group_id=src.id, target_group_id=tgt.id,
        requested_by=user.id, amount=payload.amount, note=payload.note.strip(),
    )
    db.add(request)
    db.commit()
    return transfer_out(request)


@router.post("/coins/transfers/{transfer_id}/review")
def review_transfer(
    transfer_id: str,
    payload: CoinTransferReview,
    db: Session = Depends(get_db),
    user: User = Depends(require_teacher),
):
    request = db.get(CoinTransferRequest, transfer_id)
    if not request:
        raise HTTPException(status_code=404, detail="转账申请不存在")
    src = db.get(Group, request.source_group_id)
    tgt = db.get(Group, request.target_group_id)
    if not src or not tgt:
        raise HTTPException(status_code=404, detail="转账小组已不存在")
    require_class_access(user, src.class_id)
    require_class_access(user, tgt.class_id)
    # 条件更新同时领取审核权；并发审核或重试只能有一个请求成功。
    claimed = db.execute(
        update(CoinTransferRequest)
        .where(CoinTransferRequest.id == transfer_id, CoinTransferRequest.status == "pending")
        .values(status="approved" if payload.decision == "approve" else "rejected",
                reviewed_by=user.id, reviewed_at=datetime.now(timezone.utc), review_note=payload.note.strip())
        .execution_options(synchronize_session=False)
    ).rowcount
    if not claimed:
        raise HTTPException(status_code=409, detail="该申请已审核，请刷新列表")
    if payload.decision == "approve":
        try:
            # 固定加锁顺序，避免相反方向的转账互相等待。
            for group_id in sorted((src.id, tgt.id)):
                db.execute(update(Group).where(Group.id == group_id).values(total_coins=Group.total_coins)
                           .execution_options(synchronize_session=False))
            services.add_tx(db, src.id, source="transfer", ref_id=request.id, delta=-request.amount,
                            allow_partial_debit=False, user_id=request.requested_by,
                            note=f"转账给「{tgt.name}」" + (f"：{request.note}" if request.note else ""))
            services.add_tx(db, tgt.id, source="transfer", ref_id=request.id, delta=request.amount,
                            note=f"收到「{src.name}」转账" + (f"：{request.note}" if request.note else ""))
        except services.InsufficientCoins as exc:
            db.rollback()
            raise HTTPException(status_code=400, detail="当前余额不足，无法通过审核") from exc
    db.commit()
    db.refresh(request)
    return transfer_out(request)


@router.get("/class-meta", response_model=ClassMetaOut)
def get_class_meta(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    meta = db.get(ClassMeta, 1)
    if not meta:
        raise HTTPException(status_code=404, detail="班级信息未初始化")
    return meta


@router.put("/class-meta", response_model=ClassMetaOut)
def update_class_meta(
    payload: ClassMetaUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher),
):
    """教师调整挑战奖励单价（按题目难度）。"""
    meta = db.get(ClassMeta, 1)
    if not meta:
        meta = ClassMeta(id=1)
        db.add(meta)
    meta.coin_easy = payload.coinEasy
    meta.coin_medium = payload.coinMedium
    meta.coin_hard = payload.coinHard
    db.commit()
    db.refresh(meta)
    return meta


@router.put("/activity-window", response_model=ClassMetaOut)
def update_activity_window(
    payload: ActivityWindowUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher),
):
    """教师开关挑战/招募窗口，学生在这个窗口外不能"新开局"。

    只挡新开局：已经开着的挑战与招募照常作答、结算，否则交过押金的一方
    会被卡住拿不回能量币。组间转账不单独设开关，任一窗口开着即视为可转。
    """
    meta = db.get(ClassMeta, 1)
    if not meta:
        meta = ClassMeta(id=1)
        db.add(meta)

    def _closes_at(is_open: bool, minutes: int | None):
        # 关闭时不保留旧的到期时间；开放且选了时长才算到期点
        if not is_open or minutes is None:
            return None
        return datetime.now(timezone.utc) + timedelta(minutes=minutes)

    meta.challenge_window_open = payload.challengeOpen
    meta.challenge_window_minutes = payload.challengeMinutes if payload.challengeOpen else None
    meta.challenge_window_closes_at = _closes_at(payload.challengeOpen, payload.challengeMinutes)
    meta.recruit_window_open = payload.recruitOpen
    meta.recruit_window_minutes = payload.recruitMinutes if payload.recruitOpen else None
    meta.recruit_window_closes_at = _closes_at(payload.recruitOpen, payload.recruitMinutes)
    db.commit()
    db.refresh(meta)
    return meta
