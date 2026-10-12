from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..access import require_class_access, require_group_access
from ..database import get_db
from ..deps import get_current_user, require_teacher, visible_class_id
from ..models import Class, CoinTransaction, Group, User
from ..schemas import (
    ClassOut,
    ContributionUpdate,
    GroupCoinsReset,
    GroupCreate,
    GroupOut,
    GroupRename,
    UserAvatarUpdate,
    UserCoinAdjust,
    UserGroupAssign,
    UserOut,
)
from ..services import gen_id
from ..user_views import user_to_out

router = APIRouter(prefix="/api", tags=["groups"])


# ---------- Classes ----------
@router.get("/classes", response_model=list[ClassOut])
def list_classes(db: Session = Depends(get_db)):
    """公开：注册页需要在登录前拉取班级列表供选择。"""
    return db.query(Class).all()


# ---------- Groups ----------
@router.get("/groups", response_model=list[GroupOut])
def list_groups(
    class_id: str | None = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    q = db.query(Group)
    scoped = visible_class_id(current)
    if current.account_role == "student" and not scoped:
        return []
    if scoped:
        q = q.filter(Group.class_id == scoped)
    if class_id:
        q = q.filter(Group.class_id == class_id)
    return q.all()


@router.post("/groups", response_model=GroupOut)
def create_group(payload: GroupCreate, db: Session = Depends(get_db), current: User = Depends(require_teacher)):
    require_class_access(current, payload.classId)
    if payload.classId and not db.get(Class, payload.classId):
        raise HTTPException(status_code=400, detail="所选班级不存在")
    group = Group(
        id=gen_id("g_"),
        name=payload.name,
        logo="#0D47A1",
        total_coins=payload.initialCoins,
        initial_coins=payload.initialCoins,
        class_id=payload.classId,
        contribution_ratio={},
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.post("/groups/reset-coins")
def reset_all_group_coins(
    payload: GroupCoinsReset,
    db: Session = Depends(get_db),
    current: User = Depends(require_teacher),
):
    """批量重置所有小组能量币为目标值（基线重置，不产生逐组"扣除"流水）。"""
    query = db.query(Group)
    scoped = visible_class_id(current)
    if scoped:
        query = query.filter(Group.class_id == scoped)
    groups = query.all()
    for g in groups:
        g.total_coins = payload.targetCoins
    db.commit()
    return {"ok": True, "count": len(groups), "targetCoins": payload.targetCoins}


@router.patch("/groups/{group_id}", response_model=GroupOut)
def rename_group(
    group_id: str,
    payload: GroupRename,
    db: Session = Depends(get_db),
    current: User = Depends(require_teacher),
):
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="小组不存在")
    require_class_access(current, group.class_id)
    group.name = payload.name.strip()
    db.commit()
    db.refresh(group)
    return group


@router.delete("/groups/{group_id}")
def delete_group(group_id: str, db: Session = Depends(get_db), current: User = Depends(require_teacher)):
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="小组不存在")
    require_class_access(current, group.class_id)
    # 解绑成员（保留账号与班级归属），而非删除学生账号
    for m in db.query(User).filter(User.group_id == group_id).all():
        m.group_id = None
        m.member_role = "member"
    db.delete(group)
    db.commit()
    return {"ok": True}


@router.put("/groups/{group_id}/contribution", response_model=GroupOut)
def update_contribution(
    group_id: str,
    payload: ContributionUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_teacher),
):
    total = sum(payload.ratioRecord.values())
    if total != 100:
        raise HTTPException(status_code=400, detail=f"贡献比例之和必须为 100，当前为 {total}")
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="小组不存在")
    require_class_access(current, group.class_id)
    if any(value < 0 or value > 100 for value in payload.ratioRecord.values()):
        raise HTTPException(status_code=400, detail="贡献比例必须在 0 到 100 之间")
    member_ids = {u.id for u in db.query(User).filter(User.group_id == group_id).all()}
    if not set(payload.ratioRecord).issubset(member_ids):
        raise HTTPException(status_code=400, detail="贡献者必须为本小组成员")
    group.contribution_ratio = dict(payload.ratioRecord)
    db.commit()
    db.refresh(group)
    return group


@router.put("/groups/{group_id}/leader/{user_id}")
def set_leader(group_id: str, user_id: str, db: Session = Depends(get_db), current: User = Depends(require_teacher)):
    require_group_access(db, current, group_id)
    members = db.query(User).filter(User.group_id == group_id).all()
    if not members:
        raise HTTPException(status_code=404, detail="小组无成员")
    if not any(m.id == user_id for m in members):
        raise HTTPException(status_code=400, detail="目标用户不是本小组成员")
    for m in members:
        m.member_role = "leader" if m.id == user_id else "member"
    db.commit()
    return {"ok": True}


@router.post("/groups/{group_id}/join", response_model=UserOut)
def join_group(
    group_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """学生自助加入某小组（仅在自己尚未分配小组、且小组属于本班时允许）。"""
    if current.account_role != "student":
        raise HTTPException(status_code=403, detail="仅学生可加入小组")
    if current.group_id:
        raise HTTPException(status_code=400, detail="你已在某小组中，请联系教师调整")
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="小组不存在")
    require_class_access(current, group.class_id)
    current.group_id = group_id
    # 补齐班级归属（防止历史数据缺失）
    if not current.class_id and group.class_id:
        current.class_id = group.class_id
    current.member_role = "member"
    db.commit()
    db.refresh(current)
    return user_to_out(current)


# ---------- Users ----------
@router.get("/users", response_model=list[UserOut])
def list_users(
    group_id: str | None = None,
    class_id: str | None = None,
    unassigned: bool = False,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    q = db.query(User).filter(User.account_role == "student")
    scoped = visible_class_id(current)
    if current.account_role == "student" and not scoped:
        return []
    if scoped:
        q = q.filter(User.class_id == scoped)
    if class_id:
        q = q.filter(User.class_id == class_id)
    if unassigned:
        q = q.filter(User.group_id.is_(None))
    elif group_id:
        q = q.filter(User.group_id == group_id)
    return [user_to_out(u) for u in q.all()]


@router.put("/users/{user_id}/group", response_model=UserOut)
def assign_user_group(
    user_id: str,
    payload: UserGroupAssign,
    db: Session = Depends(get_db),
    current: User = Depends(require_teacher),
):
    """教师把学生分配/移动到某小组，或移出（groupId 为 null）。

    分配到某组时，学生的班级归属会随目标小组的班级同步（跨班调组也随之更新）。
    """
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    require_class_access(current, u.class_id)
    if u.account_role != "student":
        raise HTTPException(status_code=400, detail="只能对学生分组")
    if payload.groupId:
        group = db.get(Group, payload.groupId)
        if not group:
            raise HTTPException(status_code=404, detail="目标小组不存在")
        if current.account_role != "admin" and u.class_id and group.class_id != u.class_id:
            raise HTTPException(status_code=403, detail="跨班调组仅管理员可操作")
        if payload.role == "leader":
            # 降级目标小组现任组长，避免出现两个组长
            for other in db.query(User).filter(
                User.group_id == payload.groupId, User.member_role == "leader"
            ).all():
                if other.id != u.id:
                    other.member_role = "member"
        u.group_id = payload.groupId
        if group.class_id:
            u.class_id = group.class_id
        u.member_role = "leader" if payload.role == "leader" else "member"
    else:
        # 移出小组：清空组归属并降级为普通成员（保留班级归属）
        u.group_id = None
        u.member_role = "member"
    db.commit()
    db.refresh(u)
    return user_to_out(u)


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    scoped = visible_class_id(current)
    if current.account_role == "student" and (not scoped or u.class_id != scoped):
        raise HTTPException(status_code=403, detail="只能查看本班学生")
    if current.account_role == "teacher" and scoped and u.class_id != scoped:
        raise HTTPException(status_code=403, detail="只能查看本班学生")
    return user_to_out(u)


@router.put("/users/{user_id}/avatar", response_model=UserOut)
def update_avatar(
    user_id: str,
    payload: UserAvatarUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.account_role not in ("teacher", "admin") and current.id != user_id:
        raise HTTPException(status_code=403, detail="只能修改本人头像")
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    if current.id != user_id:
        require_class_access(current, u.class_id)
    u.avatar = payload.avatar
    db.commit()
    db.refresh(u)
    return user_to_out(u)


@router.post("/users/{user_id}/coins")
def adjust_user_coins(
    user_id: str,
    payload: UserCoinAdjust,
    db: Session = Depends(get_db),
    current: User = Depends(require_teacher),
):
    """教师调整某学生个人能量币，并在其所在小组的能量流水中记录该成员变动。"""
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    require_class_access(current, u.class_id)
    if u.account_role != "student":
        raise HTTPException(status_code=400, detail="只能调整学生个人能量币")
    if payload.delta == 0:
        raise HTTPException(status_code=400, detail="调整数量不能为 0")
    u.personal_coins = max(0, u.personal_coins + payload.delta)
    # 让小组总能量随成员个人能量同步变化（团队总能量 = 成员能量之和的口径）
    if u.group_id:
        group = db.get(Group, u.group_id)
        if group is not None:
            group.total_coins = max(0, group.total_coins + payload.delta)
    # 团队流水记录：注明是某成员的个人能量变动
    if u.group_id:
        db.add(
            CoinTransaction(
                id=gen_id("ct_"),
                group_id=u.group_id,
                user_id=u.id,
                source="personal",
                ref_id=gen_id(),
                delta=payload.delta,
                balance_after=u.personal_coins,
                note=payload.note or f"教师调整「{u.name}」个人能量币 {payload.delta:+d}",
            )
        )
    db.commit()
    db.refresh(u)
    return {"ok": True, "personalCoins": u.personal_coins}


@router.post("/users/{user_id}/earned-reset")
def reset_user_earned(
    user_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(require_teacher),
):
    """清零某学生的「累计获得」。

    非破坏性：不修改也不删除任何历史流水，只写入一条 source="reset" 的标记流水；
    前端统计「累计获得」时，只累加该学生最近一次 reset 之后的正向流水。
    这样既能把数字归零，又保留完整审计轨迹（可追溯是谁在什么时候清的）。
    """
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    require_class_access(current, u.class_id)
    if u.account_role != "student":
        raise HTTPException(status_code=400, detail="只能清零学生的累计获得")
    if not u.group_id:
        # coin_transactions.group_id 非空，未分组学生无处挂账
        raise HTTPException(status_code=400, detail="该学生尚未加入小组，无法记录清零操作")

    db.add(
        CoinTransaction(
            id=gen_id("ct_"),
            group_id=u.group_id,
            user_id=u.id,
            source="reset",
            ref_id=gen_id(),
            delta=0,
            balance_after=u.personal_coins,
            note=f"清零「{u.name}」累计获得",
        )
    )
    db.commit()
    return {"ok": True, "userId": u.id}
