"""管理员路由：班级 CRUD + 教师账号管理。

仅 admin 角色可访问。admin 同时继承 teacher 全部权限（require_teacher 放行 admin）。
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..access import require_class_access
from ..database import get_db
from ..deps import require_admin, require_teacher
from ..models import Class, Group, User
from ..schemas import (
    ClassCreate,
    ClassOut,
    ClassRename,
    GroupClassMove,
    GroupOut,
    PasswordReset,
    StudentBatchUpload,
    TeacherCreate,
    TeacherOut,
    UserOut,
)
from ..security import hash_password
from ..services import gen_id
from ..user_views import user_to_out

router = APIRouter(prefix="/api", tags=["admin"])

MAX_STUDENTS_PER_CLASS = 30


# ---------- 班级管理 ----------
@router.post("/classes", response_model=ClassOut, status_code=status.HTTP_201_CREATED)
def create_class(
    payload: ClassCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """创建班级（仅管理员）。"""
    cls = Class(id=gen_id("class_"), name=payload.name.strip())
    db.add(cls)
    db.commit()
    db.refresh(cls)
    return cls


@router.patch("/classes/{class_id}", response_model=ClassOut)
def rename_class(
    class_id: str,
    payload: ClassRename,
    db: Session = Depends(get_db),
    current: User = Depends(require_teacher),
):
    """重命名班级（教师或管理员）。"""
    require_class_access(current, class_id)
    cls = db.get(Class, class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="班级不存在")
    cls.name = payload.name.strip()
    db.commit()
    db.refresh(cls)
    return cls


@router.delete("/classes/{class_id}")
def delete_class(
    class_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """删除班级（仅管理员）。

    级联清理：班级下所有小组及其学生、金币流水一并删除。
    """
    cls = db.get(Class, class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="班级不存在")

    groups = db.query(Group).filter(Group.class_id == class_id).all()
    group_ids = [g.id for g in groups]
    if group_ids:
        from ..models import CoinTransaction
        db.query(User).filter(User.group_id.in_(group_ids)).delete(synchronize_session=False)
        db.query(CoinTransaction).filter(CoinTransaction.group_id.in_(group_ids)).delete(synchronize_session=False)
        db.query(Group).filter(Group.id.in_(group_ids)).delete(synchronize_session=False)

    # 清除未分组但归属此班的学生引用
    db.query(User).filter(User.class_id == class_id, User.group_id.is_(None)).update(
        {"class_id": None}, synchronize_session=False
    )
    db.delete(cls)
    db.commit()
    return {"ok": True}


# ---------- 小组跨班移动 ----------
@router.patch("/groups/{group_id}/class", response_model=GroupOut)
def move_group_to_class(
    group_id: str,
    payload: GroupClassMove,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """将小组移动到另一班级（仅管理员）。

    同时更新组内所有学生的 class_id，保证班级归属一致。
    """
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="小组不存在")
    target_class = db.get(Class, payload.classId)
    if not target_class:
        raise HTTPException(status_code=400, detail="目标班级不存在")
    if group.class_id == payload.classId:
        raise HTTPException(status_code=400, detail="小组已在该班级中")

    group.class_id = payload.classId
    # 同步组内学生的班级归属
    db.query(User).filter(User.group_id == group_id).update(
        {"class_id": payload.classId}, synchronize_session=False
    )
    db.commit()
    db.refresh(group)
    return group


# ---------- 学生名单管理 ----------
@router.get("/classes/{class_id}/students", response_model=list[UserOut])
def list_class_students(
    class_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(require_teacher),
):
    """按班级查询学生名单（教师或管理员）。"""
    require_class_access(current, class_id)
    cls = db.get(Class, class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="班级不存在")
    students = (
        db.query(User)
        .filter(User.class_id == class_id, User.account_role == "student")
        .order_by(User.id)
        .all()
    )
    return [user_to_out(u) for u in students]


@router.post("/classes/{class_id}/students/batch", response_model=list[UserOut], status_code=status.HTTP_201_CREATED)
def batch_upload_students(
    class_id: str,
    payload: StudentBatchUpload,
    db: Session = Depends(get_db),
    current: User = Depends(require_teacher),
):
    """批量上传学生名单到指定班级（教师或管理员）。

    - 每班人数上限 30
    - 用户名默认取学生姓名（如未提供，可直接用姓名登录）
    - 密码默认 student_default_password（初始密码 123456，如未提供）
    """
    require_class_access(current, class_id)
    cls = db.get(Class, class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="班级不存在")

    current_count = (
        db.query(User)
        .filter(User.class_id == class_id, User.account_role == "student")
        .count()
    )
    incoming = len(payload.students)
    if current_count + incoming > MAX_STUDENTS_PER_CLASS:
        raise HTTPException(
            status_code=400,
            detail=f"班级人数上限 {MAX_STUDENTS_PER_CLASS}，当前 {current_count} 人，本次新增 {incoming} 人将超出上限",
        )

    created: list[User] = []
    from ..config import settings

    for item in payload.students:
        name = item.name.strip()
        # 用户名：优先使用传入的，否则取学生姓名（便于用姓名直接登录）
        username = (item.username or "").strip() or name
        # 检查用户名唯一
        if db.query(User).filter(User.username == username).first():
            raise HTTPException(status_code=409, detail=f"用户名「{username}」已被占用")
        password = item.password or settings.student_default_password
        uid = gen_id("u_")
        user = User(
            id=uid,
            username=username,
            password_hash=hash_password(password),
            account_role="student",
            name=name,
            avatar=f"https://api.dicebear.com/7.x/avataaars/svg?seed={username}&backgroundColor=FF6B35",
            class_id=class_id,
            group_id=None,
            member_role="member",
            personal_coins=0,
        )
        db.add(user)
        created.append(user)

    db.commit()
    for u in created:
        db.refresh(u)
    return [user_to_out(u) for u in created]


@router.delete("/students/{user_id}")
def delete_student(
    user_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(require_teacher),
):
    """删除学生账号（教师或管理员）。"""
    user = db.get(User, user_id)
    if not user or user.account_role != "student":
        raise HTTPException(status_code=404, detail="学生不存在")
    require_class_access(current, user.class_id)
    db.delete(user)
    db.commit()
    return {"ok": True}


@router.post("/students/{user_id}/password/reset")
def reset_student_password(
    user_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(require_teacher),
):
    """教师重置学生密码（学生忘记密码时的唯一出路）。

    新密码由服务端取 `settings.student_default_password`，**不下发给前端去拼**——
    默认密码只存在于服务端配置里。返回值带上重置后的密码，方便老师当场转告学生
    （走的是已鉴权接口，且这本来就是老师要告诉学生的东西）。
    """
    from ..config import settings

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="学生不存在")
    if user.account_role != "student":
        raise HTTPException(status_code=400, detail="只能重置学生账号的密码")

    require_class_access(current, user.class_id)
    default_password = settings.student_default_password
    if not default_password:
        raise HTTPException(status_code=500, detail="未配置学生初始密码，无法重置")

    user.password_hash = hash_password(default_password)
    db.commit()
    return {"ok": True, "password": default_password}


# ---------- 教师账号管理 ----------
@router.get("/teachers", response_model=list[TeacherOut])
def list_teachers(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """列出所有教师账号（仅管理员）。"""
    teachers = db.query(User).filter(User.account_role == "teacher").all()
    return [
        TeacherOut(id=t.id, username=t.username, name=t.name, avatar=t.avatar)
        for t in teachers
    ]


@router.post("/teachers", response_model=TeacherOut, status_code=status.HTTP_201_CREATED)
def create_teacher(
    payload: TeacherCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """创建教师账号（仅管理员）。"""
    username = payload.username.strip()
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=409, detail="用户名已被占用")
    display_name = (payload.name or "").strip() or username
    teacher = User(
        id=gen_id("t_"),
        username=username,
        password_hash=hash_password(payload.password),
        account_role="teacher",
        name=display_name,
        avatar=f"https://api.dicebear.com/7.x/avataaars/svg?seed={username}&backgroundColor=4F7CFF",
        group_id=None,
        member_role="leader",
        personal_coins=0,
    )
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return TeacherOut(
        id=teacher.id, username=teacher.username, name=teacher.name, avatar=teacher.avatar
    )


@router.delete("/teachers/{teacher_id}")
def delete_teacher(
    teacher_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(require_admin),
):
    """删除教师账号（仅管理员，不可删除自己）。"""
    if teacher_id == current.id:
        raise HTTPException(status_code=400, detail="不能删除当前登录的管理员账号")
    teacher = db.get(User, teacher_id)
    if not teacher or teacher.account_role != "teacher":
        raise HTTPException(status_code=404, detail="教师账号不存在")
    db.delete(teacher)
    db.commit()
    return {"ok": True}


@router.patch("/teachers/{teacher_id}/password")
def reset_teacher_password(
    teacher_id: str,
    payload: PasswordReset,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """重置教师密码（仅管理员）。"""
    teacher = db.get(User, teacher_id)
    if not teacher or teacher.account_role != "teacher":
        raise HTTPException(status_code=404, detail="教师账号不存在")
    teacher.password_hash = hash_password(payload.password)
    db.commit()
    return {"ok": True}
