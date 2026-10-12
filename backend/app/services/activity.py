from datetime import datetime, timezone
from .. import models

# ---------- 教师可控的开放窗口 ----------
def _utcnow_naive() -> datetime:
    """SQLite 的时间列没有时区（存的是 UTC 字面值），比较前要去掉 tzinfo，
    否则 aware 与 naive 相减会抛 TypeError。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _window_open(flag: bool | None, closes_at: datetime | None) -> bool:
    if not flag:
        return False
    if closes_at is None:
        return True
    if closes_at.tzinfo is not None:
        closes_at = closes_at.astimezone(timezone.utc).replace(tzinfo=None)
    return _utcnow_naive() < closes_at


def window_state(meta: models.ClassMeta | None) -> dict:
    """三个窗口此刻是否开着。

    到点自动关闭是**惰性判定**——每次请求现算即可，不需要定时任务；
    老师端界面用同一套规则渲染，所以到点会自己显示"已关闭"。

    `meta` 为 None（尚未播种）时按全开处理，与旧行为一致。
    """
    if meta is None:
        return {"challenge": True, "recruit": True, "transfer": True}
    challenge = _window_open(meta.challenge_window_open, meta.challenge_window_closes_at)
    recruit = _window_open(meta.recruit_window_open, meta.recruit_window_closes_at)
    # 组间转账不单设开关：任一窗口开着就算"课上有监督"
    return {"challenge": challenge, "recruit": recruit, "transfer": challenge or recruit}
