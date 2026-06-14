from pydantic_settings import BaseSettings
from zoneinfo import ZoneInfo
from typing import List
import json


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://asistencia:asistencia_pass@db:5432/asistencia"
    SECRET_KEY: str = "cambia-esto-por-una-clave-segura-minimo-32-caracteres"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 8
    CORS_ORIGINS: str = '["http://localhost", "http://localhost:8000"]'
    TIMEZONE: str = "America/Mazatlan"
    APP_NAME: str = "Sistema de Asistencia QR"
    DEBUG: bool = False

    @property
    def cors_origins_list(self) -> List[str]:
        try:
            return json.loads(self.CORS_ORIGINS)
        except Exception:
            return ["*"]

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.TIMEZONE)

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()