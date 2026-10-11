from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import services
from ..database import get_db
from ..deps import get_current_user, require_teacher, window_guard
from ..models import Group, Project, Recruitment, SafetyExamAttempt, ShowcaseItem, User
from ..schemas import (
    AssignRequest,
    BidCreate,
    ProjectCreate,
    ProjectOut,
    ProjectProgressUpdate,
    ProjectStatusUpdate,
    ProjectUpdate,
    RecruitmentCreate,
    RecruitmentOut,
    ResolveRequest,
    ShowcaseCreate,
    ShowcaseOut,
    ShowcaseReview,
    ShowcaseUpdate,
)

router = APIRouter(prefix="/api", tags=["projects"])

_CATEGORY_MAP = {
    "electric": "electric",
    "thermal": "thermal",
    "optical": "optical",
    "mechanical": "mechanical",
    "radiation": "radiation",
    "chemical": "chemical",
}


def _infer_safety_category(equipment_list: list[dict]) -> str:
    cats = {_CATEGORY_MAP.get(e.get("category")) for e in equipment_list}
    cats.discard(None)
    if not cats:
        return "mechanical"
    if len(cats) == 1:
        return next(iter(cats))
    return "combined"


def _group_id(current: User) -> str:
    if not current.group_id:
        raise HTTPException(status_code=400, detail="当前用户未归属小组")
    return current.group_id


# ---------- Projects ----------
@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Project).all()


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    return p


@router.post("/projects", response_model=ProjectOut)
def create_project(payload: ProjectCreate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    if current.account_role in ("teacher", "admin"):
        # 教师/管理员代建：必须指定目标小组
        if not payload.ownerGroupId:
            raise HTTPException(status_code=400, detail="教师创建项目需指定所属小组")
        owner_group_id = payload.ownerGroupId
        if not db.get(Group, owner_group_id):
            raise HTTPException(status_code=400, detail="所选小组不存在")
    else:
        owner_group_id = _group_id(current)
    equip = [e.model_dump() for e in payload.equipmentList]
    now = datetime.now(timezone.utc)
    project = Project(
        id=services.gen_id("proj_"),
        title=payload.title,
        topic=payload.topic,
        owner_group_id=owner_group_id,
        start_date=now,
        due_date=payload.dueDate or (now + timedelta(days=30)),
        progress=0,
        status="planning",
        tech_points=payload.techPoints or "",
        difficulties=payload.difficulties or "",
        equipment_list=equip,
        safety_category=_infer_safety_category(equip),
        safety_passed={},
        photos=[],
        results="",
        reward_coins=payload.rewardCoins or 200,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.put("/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """更新项目信息（技术要点/难点、课题、器材清单、成果等）。

    权限：教师/管理员可编辑任意项目；学生仅可编辑本小组项目。
    """
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    if current.account_role not in ("teacher", "admin") and current.group_id != p.owner_group_id:
        raise HTTPException(status_code=403, detail="只能编辑本小组的项目")

    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        p.title = data["title"]
    if "topic" in data and data["topic"] is not None:
        p.topic = data["topic"]
    if "techPoints" in data:
        p.tech_points = data["techPoints"] or ""
    if "difficulties" in data:
        p.difficulties = data["difficulties"] or ""
    if "equipmentList" in data and data["equipmentList"] is not None:
        p.equipment_list = data["equipmentList"]
        p.safety_category = _infer_safety_category(data["equipmentList"])
    if "dueDate" in data and data["dueDate"] is not None:
        p.due_date = data["dueDate"]
    if "results" in data:
        p.results = data["results"] or ""
    if "photos" in data and data["photos"] is not None:
        p.photos = data["photos"]
    if "rewardCoins" in data and data["rewardCoins"] is not None:
        p.reward_coins = data["rewardCoins"]
    if "status" in data and data["status"] is not None:
        p.status = data["status"]
    if "progress" in data and data["progress"] is not None:
        p.progress = max(0, min(100, data["progress"]))

    db.commit()
    db.refresh(p)
    return p


@router.delete("/projects/{project_id}")
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """删除项目（连同其招募公告）。权限：教师/管理员任意，学生仅本组项目。"""
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    if current.account_role not in ("teacher", "admin") and current.group_id != p.owner_group_id:
        raise HTTPException(status_code=403, detail="只能删除本项目")
    db.query(Recruitment).filter(Recruitment.project_id == project_id).delete(synchronize_session=False)
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.put("/projects/{project_id}/status", response_model=ProjectOut)
def update_status(
    project_id: str,
    payload: ProjectStatusUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    if current.account_role not in ("teacher", "admin") and current.group_id != p.owner_group_id:
        raise HTTPException(status_code=403, detail="只能更新本项目")
    p.status = payload.status
    db.commit()
    db.refresh(p)
    return p


@router.put("/projects/{project_id}/progress", response_model=ProjectOut)
def update_progress(
    project_id: str,
    payload: ProjectProgressUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    if current.account_role not in ("teacher", "admin") and current.group_id != p.owner_group_id:
        raise HTTPException(status_code=403, detail="只能更新本项目")
    p.progress = max(0, min(100, payload.progress))
    db.commit()
    db.refresh(p)
    return p


@router.post("/projects/{project_id}/done", response_model=ProjectOut)
def mark_done(project_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    if current.account_role not in ("teacher", "admin") and current.group_id != p.owner_group_id:
        raise HTTPException(status_code=403, detail="只能结算本项目")
    if p.status == "done":
        raise HTTPException(status_code=400, detail="项目已结算，请勿重复操作")
    p.status = "done"
    p.progress = 100
    services.settle_project_done(db, p)
    db.commit()
    db.refresh(p)
    return p


@router.post("/projects/{project_id}/safety-pass", response_model=ProjectOut)
def mark_safety_pass(project_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    if current.account_role == "student" and current.group_id != p.owner_group_id:
        raise HTTPException(status_code=403, detail="只能认证本组项目")
    passed_attempt = (
        db.query(SafetyExamAttempt)
        .filter(
            SafetyExamAttempt.user_id == current.id,
            SafetyExamAttempt.project_id == project_id,
            SafetyExamAttempt.graded.is_(True),
            SafetyExamAttempt.passed.is_(True),
        )
        .first()
    )
    if not passed_attempt:
        raise HTTPException(status_code=403, detail="请先完成本项目的安全考核")
    passed = dict(p.safety_passed)
    passed[current.id] = True
    p.safety_passed = passed
    db.commit()
    db.refresh(p)
    return p


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
    services.escrow_recruitment(db, rec, owner.id, note=f"招募「{rec.title}」预扣押金")
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
    if current.account_role not in ("teacher", "admin") and (
        project is None or current.group_id != project.owner_group_id
    ):
        raise HTTPException(status_code=403, detail="只能结算本项目招募")
    settled = services.settle_recruitment(db, rec, payload.result)
    rec.result = payload.result
    rec.status = "failed" if payload.result == "fail" else "done"
    # 记实际付出去的钱，而不是理论值——押金不足或中标学生没有小组时会少于理论值
    rec.actual_pay = settled["assigneePay"]
    db.commit()
    db.refresh(rec)
    return rec


# ---------- Showcase ----------
@router.get("/showcase", response_model=list[ShowcaseOut])
def list_showcase(db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    q = db.query(ShowcaseItem)
    if current.account_role == "student":
        from sqlalchemy import or_

        q = q.filter(or_(ShowcaseItem.status == "approved", ShowcaseItem.group_id == current.group_id))
    return q.all()


@router.post("/showcase", response_model=ShowcaseOut)
def create_showcase(payload: ShowcaseCreate, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    group = db.get(Group, payload.groupId)
    if not group:
        raise HTTPException(status_code=404, detail="小组不存在")
    if current.account_role == "student" and current.group_id != group.id:
        raise HTTPException(status_code=403, detail="只能以本组名义提交作品")
    if payload.projectId:
        project = db.get(Project, payload.projectId)
        if not project or project.owner_group_id != group.id:
            raise HTTPException(status_code=400, detail="项目与作品小组不匹配")
    item = ShowcaseItem(
        id=services.gen_id("showcase_"),
        project_id=payload.projectId or "",
        title=payload.title,
        cover_image=payload.coverImage,
        group_id=payload.groupId,
        description=payload.description or "",
        loves=0,
        loved_by=[],
        created_at=datetime.now(timezone.utc),
        # 新上传一律待审批：通过后才算正式展出（教师可在审批时奖励能量币）
        status="pending",
        reject_reason="",
        awarded_coins=0,
        category=payload.category,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/showcase/{showcase_id}", response_model=ShowcaseOut)
def update_showcase(
    showcase_id: str,
    payload: ShowcaseUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """学生修改本组作品（教师/管理员也可改）。

    学生改完必须重新审批（置回 pending）；**教师/管理员改则保留原状态**——
    教师本人就是审批人，把他的修改打回待审批会让已通过的作品无故下线。
    """
    item = db.get(ShowcaseItem, showcase_id)
    if not item:
        raise HTTPException(status_code=404, detail="展示不存在")
    is_teacher = current.account_role in ("teacher", "admin")
    if not is_teacher and current.group_id != item.group_id:
        raise HTTPException(status_code=403, detail="只能修改本组的作品")

    if payload.title is not None:
        item.title = payload.title
    if payload.coverImage is not None:
        item.cover_image = payload.coverImage
    if payload.description is not None:
        item.description = payload.description
    if payload.category is not None:
        item.category = payload.category
    if not is_teacher:
        # 任何修改都要重新送审：置回待审批并清掉上一次的驳回理由
        item.status = "pending"
        item.reject_reason = ""

    db.commit()
    db.refresh(item)
    return item


@router.delete("/showcase/{showcase_id}")
def delete_showcase(
    showcase_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher),
):
    """教师/管理员下架作品。

    只删展示条目——已发出去的奖励能量币**不回滚**（那笔账已在流水里，
    撤回会让小组余额凭空变动，也可能把它扣成负数）。
    """
    item = db.get(ShowcaseItem, showcase_id)
    if not item:
        raise HTTPException(status_code=404, detail="展示不存在")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/showcase/{showcase_id}/review", response_model=ShowcaseOut)
def review_showcase(
    showcase_id: str,
    payload: ShowcaseReview,
    db: Session = Depends(get_db),
    current: User = Depends(require_teacher),
):
    """教师审批作品。通过时可奖励该小组能量币；驳回时必须写明理由。"""
    item = db.get(ShowcaseItem, showcase_id)
    if not item:
        raise HTTPException(status_code=404, detail="展示不存在")

    if payload.action == "approve":
        # 状态转换在数据库中原子执行；并发重试只能有一个请求拿到发奖资格。
        changed = (
            db.query(ShowcaseItem)
            .filter(ShowcaseItem.id == showcase_id, ShowcaseItem.status != "approved")
            .update({ShowcaseItem.status: "approved", ShowcaseItem.reject_reason: ""}, synchronize_session=False)
        )
        if changed != 1:
            raise HTTPException(status_code=409, detail="作品已审批通过，不可重复发放奖励")
        db.refresh(item)
        coins = max(0, payload.coins or 0)
        if coins > 0 and item.awarded_coins == 0:
            # add_tx 会同时更新 group.total_coins 并写入流水，但不提交——由这里统一 commit
            services.add_tx(
                db,
                item.group_id,
                source="showcase",
                ref_id=item.id,
                delta=coins,
                note=f"成果「{item.title}」通过奖励",
                user_id=current.id,
            )
            item.awarded_coins = coins
    elif payload.action == "reject":
        reason = (payload.reason or "").strip()
        if not reason:
            raise HTTPException(status_code=400, detail="驳回时必须填写理由")
        item.status = "rejected"
        item.reject_reason = reason
    else:
        raise HTTPException(status_code=400, detail="action 只能是 approve 或 reject")

    db.commit()
    db.refresh(item)
    return item


@router.post("/showcase/{showcase_id}/love", response_model=ShowcaseOut)
def toggle_love(showcase_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    item = db.get(ShowcaseItem, showcase_id)
    if not item:
        raise HTTPException(status_code=404, detail="展示不存在")
    uid = str(current.id)
    loved_by = list(item.loved_by)
    if uid in loved_by:
        loved_by.remove(uid)
        item.loves = max(0, item.loves - 1)
    else:
        loved_by.append(uid)
        item.loves = item.loves + 1
    item.loved_by = loved_by
    db.commit()
    db.refresh(item)
    return item
