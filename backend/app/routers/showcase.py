from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import services
from ..access import require_group_write
from ..database import get_db
from ..deps import get_current_user, require_teacher
from ..models import Group, Project, ShowcaseItem, User
from ..schemas import ShowcaseCreate, ShowcaseOut, ShowcaseReview, ShowcaseUpdate

router = APIRouter(prefix="/api", tags=["showcase"])

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
    if not payload.groupId:
        if current.account_role != "admin":
            raise HTTPException(status_code=403, detail="只有管理员可以发布平台公共作品")
        if payload.projectId:
            raise HTTPException(status_code=400, detail="平台公共作品不关联小组项目")
    else:
        group = db.get(Group, payload.groupId)
        if not group:
            raise HTTPException(status_code=404, detail="小组不存在")
        require_group_write(db, current, group.id)
        if current.account_role == "student" and current.group_id != group.id:
            raise HTTPException(status_code=403, detail="只能以本组名义提交作品")
        if payload.demoKind:
            raise HTTPException(status_code=400, detail="交互 Demo 仅用于平台公共作品")
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
        author_user_id=current.id if not payload.groupId else "",
        demo_kind=payload.demoKind,
        html_content=payload.htmlContent,
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
    if item.group_id:
        require_group_write(db, current, item.group_id)
    is_teacher = current.account_role in ("teacher", "admin")
    if not is_teacher and (not item.group_id or current.group_id != item.group_id):
        raise HTTPException(status_code=403, detail="只能修改本组的作品")

    if payload.htmlContent is not None:
        item.html_content = payload.htmlContent
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
    current: User = Depends(require_teacher),
):
    """教师/管理员下架作品。

    只删展示条目——已发出去的奖励能量币**不回滚**（那笔账已在流水里，
    撤回会让小组余额凭空变动，也可能把它扣成负数）。
    """
    item = db.get(ShowcaseItem, showcase_id)
    if not item:
        raise HTTPException(status_code=404, detail="展示不存在")
    if item.group_id:
        require_group_write(db, current, item.group_id)
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

    if item.group_id:
        require_group_write(db, current, item.group_id)
    if payload.action == "approve":
        if not item.group_id and (payload.coins or 0) > 0:
            raise HTTPException(status_code=400, detail="平台公共作品不参与小组能量币奖励")
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
