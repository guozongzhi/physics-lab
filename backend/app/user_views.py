"""账号响应投影：不暴露密码哈希或认证角色字段。"""
from .models import User
from .schemas import UserOut

def user_to_out(u: User) -> UserOut:
    """模型 member_role -> 前端 role 字段。"""
    return UserOut(
        id=u.id,
        name=u.name,
        avatar=u.avatar,
        class_id=u.class_id,
        group_id=u.group_id,
        role=u.member_role,
        personal_coins=u.personal_coins,
    )
