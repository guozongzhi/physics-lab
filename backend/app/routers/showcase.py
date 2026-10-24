from datetime import datetime, timedelta, timezone
import json
from jose import jwt
from pathlib import Path
import re
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import services
from ..access import require_group_write
from ..config import settings
from ..database import get_db
from ..deps import get_current_user, require_teacher
from ..models import Group, Project, ShowcaseItem, User
from ..security import decode_access_token
from ..schemas import ShowcaseCreate, ShowcaseOut, ShowcaseReview, ShowcaseUpdate

router = APIRouter(prefix="/api", tags=["showcase"])

ALLOWED_VIDEO_EXTS: dict[str, str] = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
}
_SAFE_VIDEO_FILENAME_RE = re.compile(r"^vid_[a-zA-Z0-9_-]{8,48}\.(mp4|webm|mov)$")


def _is_valid_video_header(header: bytes, ext: str) -> bool:
    """校验视频文件头魔数，阻断伪造后缀的文本或脚本文件。"""
    if len(header) < 8:
        return False
    if ext == ".webm":
        # WebM / Matroska EBML Header: 0x1A 0x45 0xDF 0xA3
        return header.startswith(b"\x1a\x45\xdf\xa3")
    # MP4 / MOV ISO Base Media File Format: bytes 4..8 为原子类型 (ftyp / moov / mdat / wide / free / skip / pnot)
    box_type = header[4:8]
    return box_type in {b"ftyp", b"moov", b"mdat", b"wide", b"free", b"skip", b"pnot"}


def _video_path(filename: str) -> Path:
    if not _SAFE_VIDEO_FILENAME_RE.fullmatch(filename):
        raise HTTPException(status_code=404, detail="视频不存在")
    target = Path(settings.video_upload_dir) / filename
    if not target.is_file():
        raise HTTPException(status_code=404, detail="视频不存在")
    return target


def _require_video_access(filename: str, db: Session, current: User) -> Path:
    target = _video_path(filename)
    content = f"<!--VIDEO_SRC-->/api/showcase/video/{filename}"
    items = db.query(ShowcaseItem).filter(ShowcaseItem.html_content == content).all()
    for item in items:
        if item.status == "approved" or current.account_role == "admin":
            return target
        if item.group_id:
            try:
                require_group_write(db, current, item.group_id)
                return target
            except HTTPException:
                pass
    # 未绑定作品的草稿仅允许上传者预览；旧文件没有元数据时默认拒绝。
    if not items:
        try:
            owner = json.loads(target.with_suffix(target.suffix + ".json").read_text())
            if owner["user_id"] == current.id:
                return target
        except (OSError, ValueError, KeyError):
            pass
    raise HTTPException(status_code=403, detail="无权查看此视频")


def _validate_video_binding(content: str | None, db: Session, current: User) -> None:
    prefix = "<!--VIDEO_SRC-->/api/showcase/video/"
    if content and content.startswith(prefix):
        _require_video_access(content[len(prefix):], db, current)


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
    _validate_video_binding(payload.htmlContent, db, current)
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

    if payload.projectId is not None:
        if payload.projectId:
            if not item.group_id:
                raise HTTPException(status_code=400, detail="平台公共作品不关联小组项目")
            project = db.get(Project, payload.projectId)
            if not project or project.owner_group_id != item.group_id:
                raise HTTPException(status_code=400, detail="项目与作品小组不匹配")
        item.project_id = payload.projectId
    if payload.htmlContent is not None:
        _validate_video_binding(payload.htmlContent, db, current)
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


@router.post("/showcase/video")
def upload_showcase_video(
    file: UploadFile = File(...),
    current: User = Depends(get_current_user),
):
    """流式接收最大 100 MB 的实验视频文件并持久化至独立视频目录，返回轻量流式访问 URL。"""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_VIDEO_EXTS:
        raise HTTPException(status_code=400, detail="仅支持上传 .mp4、.webm 或 .mov 格式的视频文件")

    upload_dir = Path(settings.video_upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    fname = f"vid_{secrets.token_hex(12)}{ext}"
    dest = upload_dir / fname

    max_bytes = settings.max_video_bytes
    total = 0
    first_chunk = b""

    try:
        with dest.open("wb") as out:
            while True:
                chunk = file.file.read(1024 * 1024)  # 1 MB 分块
                if not chunk:
                    break
                if not first_chunk:
                    first_chunk = chunk[:64]
                    if not _is_valid_video_header(first_chunk, ext):
                        raise HTTPException(
                            status_code=400,
                            detail="视频文件头校验未通过，请确认文件为有效的 MP4 / WebM / MOV 视频",
                        )
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"视频文件超出上限（最大支持 {max_bytes // (1024 * 1024)} MB）",
                    )
                out.write(chunk)
        if total == 0:
            raise HTTPException(status_code=400, detail="上传的视频文件为空")
        dest.with_suffix(ext + ".json").write_text(json.dumps({"user_id": current.id}))
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    except Exception as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="保存视频文件失败") from exc

    return {
        "url": f"/api/showcase/video/{fname}",
        "filename": fname,
        "size": total,
    }


@router.post("/showcase/video/{filename}/ticket")
def video_ticket(filename: str, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    _require_video_access(filename, db, current)
    # 不含 sub，不能作为站点登录凭证使用。
    token = jwt.encode(
        {"video": filename, "viewer": current.id,
         "exp": datetime.now(timezone.utc) + timedelta(hours=2)},
        settings.jwt_secret, algorithm=settings.jwt_algorithm,
    )
    return {"url": f"/api/showcase/video/{filename}?ticket={token}"}


@router.get("/showcase/video/{filename}")
def get_showcase_video(filename: str, ticket: str = "", db: Session = Depends(get_db)):
    payload = decode_access_token(ticket) if ticket else None
    if not payload or payload.get("video") != filename:
        raise HTTPException(status_code=401, detail="视频播放凭证无效或已过期")
    current = db.get(User, payload.get("viewer", ""))
    if not current:
        raise HTTPException(status_code=401, detail="用户不存在")
    target = _require_video_access(filename, db, current)
    return FileResponse(
        path=target,
        media_type=ALLOWED_VIDEO_EXTS[target.suffix.lower()],
        headers={"Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer"},
    )
