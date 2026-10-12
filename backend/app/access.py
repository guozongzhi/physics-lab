"""对象级权限策略。角色守卫之外，写操作必须检查资源所属班级/小组。"""
from fastapi import HTTPException
from sqlalchemy.orm import Session
from .models import Group, User


def require_class_access(current: User, class_id: str | None) -> None:
    # 管理员与未绑定班级的全校教师具有全局权限（既有产品契约）。
    if current.account_role == 'admin':
        return
    if current.account_role == 'teacher' and not current.class_id:
        return
    if not current.class_id or current.class_id != class_id:
        raise HTTPException(status_code=403, detail='只能操作本班资源')


def require_group_access(db: Session, current: User, group_id: str) -> Group:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail='小组不存在')
    require_class_access(current, group.class_id)
    return group


def require_group_write(db: Session, current: User, group_id: str) -> Group:
    group = require_group_access(db, current, group_id)
    if current.account_role == 'student' and current.group_id != group_id:
        raise HTTPException(status_code=403, detail='只能操作本小组资源')
    return group
