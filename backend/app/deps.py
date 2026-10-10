from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from . import services
from .database import get_db
from .models import ClassMeta, User
from .security import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="未认证或登录已过期",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exc
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise credentials_exc
    user = db.get(User, payload["sub"])
    if not user:
        raise credentials_exc
    return user


def require_teacher(current: User = Depends(get_current_user)) -> User:
    """教师或管理员均可通过（admin 继承教师全部权限）。"""
    if current.account_role not in ("teacher", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要教师权限")
    return current


def require_admin(current: User = Depends(get_current_user)) -> User:
    if current.account_role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return current


def visible_class_id(current: User) -> str | None:
    """管理员与未绑定班级的全校教师可见全局；学生及绑定班级的教师限定本班。"""
    if current.account_role == "admin":
        return None
    return current.class_id


#: 窗口关闭时给学生看的话术
_WINDOW_LABELS = {
    "challenge": "挑战窗口",
    "recruit": "招募窗口",
    "transfer": "组间转账",
}


def window_guard(kind: str):
    """挡在学生"新开局"前面的一道闸：建挑战 / 发招募 / 投标 / 发起转账。

    **只挡新开局**——已经开着的挑战与招募照常作答、结算，否则交过押金的一方
    会卡在中间谁也拿不回能量币。

    教师/管理员不受限（他们是监督者，关了窗口自己也得能发招募）。
    用法：`Depends(window_guard("challenge"))`
    """

    def _guard(
        db: Session = Depends(get_db),
        current: User = Depends(get_current_user),
    ) -> None:
        if current.account_role in ("teacher", "admin"):
            return
        if not services.window_state(db.get(ClassMeta, 1))[kind]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"{_WINDOW_LABELS[kind]}已关闭，请联系老师开放",
            )

    return _guard
