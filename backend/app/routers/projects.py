from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import services
from ..access import require_group_write
from ..database import get_db
from ..deps import get_current_user
from ..models import CoinTransaction, Group, Project, Recruitment, SafetyExamAttempt, User
from ..schemas import ProjectCreate, ProjectOut, ProjectProgressUpdate, ProjectStatusUpdate, ProjectUpdate

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


def _check_status_update(project: Project, target: str) -> None:
    if project.status == "done" and target != "done":
        raise HTTPException(status_code=409, detail="已结算项目不可重新开启")
    if target == "done" and project.status != "done":
        raise HTTPException(status_code=409, detail="请通过完成结算接口关闭项目")


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
    require_group_write(db, current, owner_group_id)
    if current.account_role == "student" and payload.rewardCoins not in (None, 200):
        raise HTTPException(status_code=403, detail="项目奖励由教师设置")
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
        reward_coins=200 if payload.rewardCoins is None else payload.rewardCoins,
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

    权限：教师限本班、管理员/全校教师全局；学生限本组。
    """
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    require_group_write(db, current, p.owner_group_id)

    data = payload.model_dump(exclude_unset=True)
    if payload.rewardCoins is not None and current.account_role == "student" and payload.rewardCoins != p.reward_coins:
        raise HTTPException(status_code=403, detail="项目奖励由教师设置")
    if payload.status is not None:
        _check_status_update(p, payload.status)
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
    """删除项目（连同其招募公告）。权限：教师限本班、管理员/全校教师全局，学生仅本组项目。"""
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    require_group_write(db, current, p.owner_group_id)
    active_escrow = db.query(Recruitment.id).filter(
        Recruitment.project_id == project_id,
        Recruitment.status.notin_(("done", "failed")),
        Recruitment.escrow_paid > 0,
    ).first()
    if active_escrow:
        raise HTTPException(status_code=409, detail="请先结算或取消有押金的招募，再删除项目")
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
    require_group_write(db, current, p.owner_group_id)
    _check_status_update(p, payload.status)
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
    require_group_write(db, current, p.owner_group_id)
    p.progress = max(0, min(100, payload.progress))
    db.commit()
    db.refresh(p)
    return p


@router.post("/projects/{project_id}/done", response_model=ProjectOut)
def mark_done(project_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    require_group_write(db, current, p.owner_group_id)
    if p.status == "done" or db.query(CoinTransaction.id).filter_by(source="project", ref_id=p.id).first():
        raise HTTPException(status_code=400, detail="项目已结算，请勿重复操作")
    # 原子领取结算资格：同一事务中的竞争请求只能有一个成功。
    changed = db.query(Project).filter(Project.id == p.id, Project.status != "done").update(
        {Project.status: "done", Project.progress: 100}, synchronize_session=False
    )
    if changed != 1:
        raise HTTPException(status_code=400, detail="项目已结算，请勿重复操作")
    db.refresh(p)
    services.settle_project_done(db, p)
    db.commit()
    db.refresh(p)
    return p


@router.post("/projects/{project_id}/safety-pass", response_model=ProjectOut)
def mark_safety_pass(project_id: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    require_group_write(db, current, p.owner_group_id)
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
