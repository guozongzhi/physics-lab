import secrets
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置，可通过 backend/.env 或环境变量覆盖。"""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./physics_lab.db"
    # 优先取环境变量 JWT_SECRET；未配置则每次启动随机生成（杜绝可伪造的公开默认密钥）。
    jwt_secret: str = secrets.token_hex(32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 720  # 12 小时

    # 兜底值仅为占位符：正式使用必须在 .env 中配置真实密码（改后需重启后端）。
    # 刻意不写任何"看起来像真密码"的默认值，避免仓库泄露可用的登录凭据。
    teacher_password: str = "change-me-via-env"
    student_default_password: str = "change-me-via-env"
    admin_password: str = "change-me-via-env"

    # 独立、持久的 NFC UID 索引密钥；未配置时 NFC 接口返回 503，不影响原业务。
    nfc_uid_secret: str = ""

    cors_origins: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
