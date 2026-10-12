import uuid
from datetime import datetime, timezone

def gen_id(prefix: str = "") -> str:
    core = uuid.uuid4().hex[:12]
    return f"{prefix}{core}" if prefix else core


def _now() -> datetime:
    return datetime.now(timezone.utc)
