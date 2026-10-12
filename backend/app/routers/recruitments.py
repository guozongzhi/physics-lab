from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import services
from ..access import require_group_access, require_group_write
from ..database import get_db
from ..deps import get_current_user, window_guard
from ..models import Group, Project, Recruitment, User
from ..schemas import AssignRequest, BidCreate, RecruitmentCreate, RecruitmentOut, ResolveRequest

router = APIRouter(prefix="/api", tags=["recruitments"])

# ---------- Recruitments ----------
@router.get("/recruitments", response_model=list[RecruitmentOut])
def list_recruitments(
    project_id: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Recruitment)
    if project_id:
        q = q.filter(Recruitment.project_id == project_id)
    return q.all()


@router.post("/recruitments", response_model=RecruitmentOut)
def create_recruitment(
    payload: RecruitmentCreate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
    _window: None = Depends(window_guard("recruit")),
):
    project = db.get(Project, payload.projectId)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    require_group_write(db, current, project.owner_group_id)
    if current.account_role not in ("teacher", "admin") and current.group_id != project.owner_group_id:
        raise HTTPException(status_code=403, detail="只能为本小组项目发布招募")
    deadline = payload.deadline
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    if deadline <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="招募截止时间必须晚于当前时间")
    # 酬劳从项目归属组的能量币里预扣作押金。不扣的话结算时就是凭空发币，
    # 而且「失败」那一档会让发包组白得一笔自己从未付过的钱。
    owner = db.get(Group, project.owner_group_id) if project.owner_group_id else None
    if owner is None:
        raise HTTPException(status_code=400, detail="该项目没有归属小组，无法发布招募")
    if owner.total_coins < payload.reward:
        raise HTTPException(
            status_code=400,
            detail=f"能量币不足：本次招募酬劳 {payload.reward} ⚡，本组只有 {owner.total_coins} ⚡",
        )
    rec = Recruitment(
        id=services.gen_id("rec_"),
        project_id=payload.projectId,
        title=payload.title,
        description=payload.description,
        skills=payload.skills,
        reward=payload.reward,
        deadline=payload.deadline,
        status="open",
        bids=[],
    )
    db.add(rec)
    try:
        services.escrow_recruitment(db, rec, owner.id, note=f"招募「{rec.title}」预扣押金", allow_partial_debit=False)
    except services.InsufficientCoins as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.commit()
    db.refresh(rec)
    return rec


@router.post("/recruitments/{rec_id}/bid", response_model=RecruitmentOut)
def place_bid(
    rec_id: str,
    payload: BidCreate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
    _window: None = Depends(window_guard("recruit")),
):
    rec = db.get(Recruitment, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="招募不存在")
    project = db.get(Project, rec.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    require_group_access(db, current, project.owner_group_id)
    if payload.userId != current.id:
        raise HTTPException(status_code=403, detail="只能以本人身份投标")
    deadline = rec.deadline
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    if rec.status != "open" or deadline <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="招募已关闭或过期")
    if any(b.get("userId") == current.id for b in rec.bids):
        raise HTTPException(status_code=409, detail="请勿重复投标")
    bid = {
        "userId": payload.userId,
        "skillDesc": payload.skillDesc,
        "hours": payload.hours,
        "bidAt": datetime.now(timezone.utc).isoformat(),
    }
    rec.bids = list(rec.bids) + [bid]
    db.commit()
    db.refresh(rec)
    return rec


@router.put("/recruitments/{rec_id}/assign", response_model=RecruitmentOut)
def assign(rec_id: str, payload: AssignRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    rec = db.get(Recruitment, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="招募不存在")
    if rec.status != "open":
        raise HTTPException(status_code=400, detail="仅开放中的招募可分配")
    project = db.get(Project, rec.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    require_group_write(db, current, project.owner_group_id)
    if current.account_role not in ("teacher", "admin") and (
        project is None or current.group_id != project.owner_group_id
    ):
        raise HTTPException(status_code=403, detail="只能分配本项目招募")
    if payload.userId == current.id and current.account_role == "student":
        raise HTTPException(status_code=400, detail="不能给自己投标的招募做分配")
    if not db.get(User, payload.userId) or not any(b.get("userId") == payload.userId for b in rec.bids):
        raise HTTPException(status_code=400, detail="只能指派已投标的有效用户")
    rec.status = "assigned"
    rec.assignee_user_id = payload.userId
    db.commit()
    db.refresh(rec)
    return rec


@router.put("/recruitments/{rec_id}/resolve", response_model=RecruitmentOut)
def resolve(rec_id: str, payload: ResolveRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    rec = db.get(Recruitment, rec_id)
    if not rec:
        raise HTTPException(status_code=404, detail="招募不存在")
    if payload.result not in ("success", "partial", "fail"):
        raise HTTPException(status_code=400, detail="非法的结算结果")
    if rec.status in ("done", "failed"):
        raise HTTPException(status_code=400, detail="该招募已结算，请勿重复操作")
    project = db.get(Project, rec.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    require_group_write(db, current, project.owner_group_id)
    if current.account_role not in ("teacher", "admin") and (
        project is None or current.group_id != project.owner_group_id
    ):
        raise HTTPException(status_code=403, detail="只能结算本项目招募")
    target_status = "failed" if payload.result == "fail" else "done"
    changed = db.query(Recruitment).filter(
        Recruitment.id == rec_id, Recruitment.status.notin_(("done", "failed"))
    ).update({Recruitment.status: target_status}, synchronize_session=False)
    if changed != 1:
        raise HTTPException(status_code=400, detail="该招募已结算，请勿重复操作")
    db.refresh(rec)
    settled = services.settle_recruitment(db, rec, payload.result)
    rec.result = payload.result
    rec.status = "failed" if payload.result == "fail" else "done"
    # 记实际付出去的钱，而不是理论值——押金不足或中标学生没有小组时会少于理论值
    rec.actual_pay = settled["assigneePay"]
    db.commit()
    db.refresh(rec)
    return rec
