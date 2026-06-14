from pydantic_settings import BaseSettings
from zoneinfo import ZoneInfo
from typing import List
import json

class Settings(BaseSettings):
    # Forzamos una clave limpia y segura directamente aquí para evitar problemas de .env
    SECRET_KEY: str = "b8ab27715951a8bc9a2ba0eb835ee7b38163"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 8
    DATABASE_URL: str = "sqlite:///./asistencia.db"
    CORS_ORIGINS: str = '["http://localhost", "http://localhost:8000"]'
    TIMEZONE: str = "America/Mazatlan"
    APP_NAME: str = "Sistema de Asistencia QR"
    DEBUG: bool = True

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