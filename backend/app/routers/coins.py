from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import services
from ..access import require_class_access
from ..database import get_db
from ..deps import get_current_user, require_teacher, visible_class_id, window_guard
from ..models import ClassMeta, CoinTransaction, Group, User
from ..schemas import (
    ActivityWindowUpdate,
    ClassMetaOut,
    ClassMetaUpdate,
    CoinDelta,
    CoinTransfer,
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


@router.post("/coins/transfer")
def transfer_coins(
    payload: CoinTransfer,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _window: None = Depends(window_guard("transfer")),
):
    """组间能量币转账（学生发起，后端原子记账，收支两笔共享同一 refId）。"""
    if payload.source_group_id == payload.target_group_id:
        raise HTTPException(status_code=400, detail="不能转账给自己小组")
    src = db.get(Group, payload.source_group_id)
    tgt = db.get(Group, payload.target_group_id)
    if not src or not tgt:
        raise HTTPException(status_code=404, detail="小组不存在")
    require_class_access(user, src.class_id)
    require_class_access(user, tgt.class_id)
    # 学生只能从自己所在小组转出；教师/管理员可代任意小组操作
    if user.account_role == "student" and user.group_id != src.id:
        raise HTTPException(status_code=403, detail="只能从自己所在小组转出")
    if src.total_coins < payload.amount:
        raise HTTPException(status_code=400, detail="小组能量币不足")

    ref_id = services.gen_id("tr_")
    note = payload.note.strip()
    try:
        tx_out = services.add_tx(
            db,
            src.id,
            source="transfer",
            ref_id=ref_id,
            delta=-payload.amount,
            allow_partial_debit=False,
            note=f"转账给「{tgt.name}」" + (f"：{note}" if note else ""),
            user_id=user.id,
        )
    except services.InsufficientCoins as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    tx_in = services.add_tx(
        db,
        tgt.id,
        source="transfer",
        ref_id=ref_id,
        delta=payload.amount,
        note=f"收到「{src.name}」转账" + (f"：{note}" if note else ""),
    )
    db.commit()
    return {
        "refId": ref_id,
        "sourceBalanceAfter": tx_out.balance_after,
        "targetBalanceAfter": tx_in.balance_after,
    }


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
